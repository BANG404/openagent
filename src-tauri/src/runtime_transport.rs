use crate::runtime_process::RuntimeProcessSupervisor;
use reqwest::{Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::async_runtime::JoinHandle;
use tauri::Emitter;
use tokio::sync::Mutex;

const MAX_PROXY_BODY_BYTES: usize = 64 * 1024 * 1024;
const MAX_SSE_FRAME_BYTES: usize = 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProxyRequest {
    pub method: String,
    pub path: String,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProxyResponse {
    pub status: u16,
    pub status_text: String,
    pub content_type: Option<String>,
    pub body: String,
}

#[derive(Debug, Deserialize)]
struct ProjectedRuntimeEvent {
    name: String,
    payload: Value,
}

#[derive(Default)]
pub struct RuntimeEventProxy {
    generation: AtomicU64,
    active: Arc<AtomicBool>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl RuntimeEventProxy {
    pub async fn start(
        &self,
        app: tauri::AppHandle,
        supervisor: Arc<RuntimeProcessSupervisor>,
    ) -> Result<u64, String> {
        let connection = supervisor.connection().await?;
        let mut task = self.task.lock().await;
        if self.active.load(Ordering::Acquire) {
            return Ok(self.generation.load(Ordering::Acquire));
        }
        if let Some(finished) = task.take() {
            let _ = finished.await;
        }
        let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
        self.active.store(true, Ordering::Release);
        let active = self.active.clone();
        *task = Some(tauri::async_runtime::spawn(async move {
            if let Err(error) =
                relay_runtime_events(&app, connection.endpoint, &connection.token, generation).await
            {
                tracing::warn!(generation, %error, "Runtime event relay stopped");
                let _ = app.emit(
                    "runtime-resync-required",
                    serde_json::json!({ "generation": generation }),
                );
            }
            active.store(false, Ordering::Release);
        }));
        Ok(generation)
    }

    pub async fn stop(&self) {
        self.active.store(false, Ordering::Release);
        if let Some(task) = self.task.lock().await.take() {
            task.abort();
            let _ = task.await;
        }
    }
}

pub async fn proxy_runtime_request(
    supervisor: &RuntimeProcessSupervisor,
    request: RuntimeProxyRequest,
) -> Result<RuntimeProxyResponse, String> {
    let connection = supervisor.connection().await?;
    let method = parse_method(&request.method)?;
    let url = resolve_api_url(&connection.endpoint, &request.path)?;
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_PROXY_BODY_BYTES)
    {
        return Err("Runtime request body exceeds the desktop proxy limit".to_string());
    }

    let client = reqwest::Client::new();
    let mut outbound = client.request(method, url).bearer_auth(&connection.token);
    if let Some(body) = request.body {
        outbound = outbound
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body);
    }
    let mut response = outbound
        .send()
        .await
        .map_err(|error| format!("Runtime request failed: {error}"))?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Runtime response body failed: {error}"))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_PROXY_BODY_BYTES {
            return Err("Runtime response body exceeds the desktop proxy limit".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(body)
        .map_err(|_| "Runtime response body was not valid UTF-8".to_string())?;
    Ok(RuntimeProxyResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or_default().to_string(),
        content_type,
        body,
    })
}

fn parse_method(method: &str) -> Result<Method, String> {
    match method {
        "GET" => Ok(Method::GET),
        "POST" => Ok(Method::POST),
        "PATCH" => Ok(Method::PATCH),
        "DELETE" => Ok(Method::DELETE),
        _ => Err("Runtime proxy method is not allowed".to_string()),
    }
}

fn resolve_api_url(endpoint: &Url, path: &str) -> Result<Url, String> {
    if !path.starts_with("/api/")
        || path.contains(['\r', '\n'])
        || path.contains('#')
        || path.starts_with("//")
    {
        return Err("Runtime proxy path is not allowed".to_string());
    }
    let url = endpoint
        .join(path)
        .map_err(|error| format!("Runtime proxy path is invalid: {error}"))?;
    if url.scheme() != endpoint.scheme()
        || url.host_str() != endpoint.host_str()
        || url.port_or_known_default() != endpoint.port_or_known_default()
    {
        return Err("Runtime proxy path escaped the supervised endpoint".to_string());
    }
    Ok(url)
}

async fn relay_runtime_events(
    app: &tauri::AppHandle,
    endpoint: Url,
    token: &str,
    generation: u64,
) -> Result<(), String> {
    let url = endpoint
        .join("/api/events")
        .map_err(|error| format!("Runtime event URL is invalid: {error}"))?;
    let mut response = reqwest::Client::new()
        .get(url)
        .bearer_auth(token)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .send()
        .await
        .map_err(|error| format!("Runtime event connection failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Runtime event connection was rejected: {error}"))?;
    let mut buffer = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Runtime event stream failed: {error}"))?
    {
        if buffer.len().saturating_add(chunk.len()) > MAX_SSE_FRAME_BYTES {
            return Err("Runtime event frame exceeds the desktop proxy limit".to_string());
        }
        buffer.extend_from_slice(&chunk);
        while let Some((frame_end, delimiter_len)) = find_sse_frame(&buffer) {
            let frame = buffer.drain(..frame_end).collect::<Vec<_>>();
            buffer.drain(..delimiter_len);
            match parse_sse_frame(&frame)? {
                Some((event, data)) if event == "runtime" => {
                    let projected: ProjectedRuntimeEvent = serde_json::from_str(&data)
                        .map_err(|error| format!("Runtime event payload was invalid: {error}"))?;
                    app.emit(&projected.name, projected.payload)
                        .map_err(|error| format!("failed to emit Runtime event: {error}"))?;
                }
                Some((event, _)) if event == "resync" => {
                    app.emit(
                        "runtime-resync-required",
                        serde_json::json!({ "generation": generation }),
                    )
                    .map_err(|error| format!("failed to request Runtime resync: {error}"))?;
                    return Ok(());
                }
                _ => {}
            }
        }
    }
    Err("Runtime event stream closed".to_string())
}

fn find_sse_frame(buffer: &[u8]) -> Option<(usize, usize)> {
    buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| (index, 4))
        .or_else(|| {
            buffer
                .windows(2)
                .position(|window| window == b"\n\n")
                .map(|index| (index, 2))
        })
}

fn parse_sse_frame(frame: &[u8]) -> Result<Option<(String, String)>, String> {
    let text = std::str::from_utf8(frame)
        .map_err(|_| "Runtime event frame was not valid UTF-8".to_string())?;
    let mut event = None;
    let mut data = Vec::new();
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("event:") {
            event = Some(value.trim_start().to_string());
        } else if let Some(value) = line.strip_prefix("data:") {
            data.push(value.trim_start());
        }
    }
    Ok(event.map(|event| (event, data.join("\n"))))
}

#[cfg(test)]
mod tests {
    use super::{find_sse_frame, parse_method, parse_sse_frame, resolve_api_url};
    use reqwest::{Method, Url};

    #[test]
    fn proxy_allows_only_product_api_paths_on_the_supervised_origin() {
        let endpoint = Url::parse("http://127.0.0.1:43123/").unwrap();
        assert_eq!(
            resolve_api_url(&endpoint, "/api/conversations?id=1").unwrap(),
            Url::parse("http://127.0.0.1:43123/api/conversations?id=1").unwrap()
        );
        assert!(resolve_api_url(&endpoint, "/v1/health").is_err());
        assert!(resolve_api_url(&endpoint, "//example.com/api/events").is_err());
        assert!(resolve_api_url(&endpoint, "/api/events#fragment").is_err());
    }

    #[test]
    fn proxy_allows_only_the_typed_transport_methods() {
        assert_eq!(parse_method("GET").unwrap(), Method::GET);
        assert_eq!(parse_method("POST").unwrap(), Method::POST);
        assert_eq!(parse_method("PATCH").unwrap(), Method::PATCH);
        assert_eq!(parse_method("DELETE").unwrap(), Method::DELETE);
        assert!(parse_method("PUT").is_err());
    }

    #[test]
    fn parses_runtime_and_resync_sse_frames() {
        let frame = b"event: runtime\r\ndata: {\"name\":\"chat-done\",\"payload\":{}}";
        assert_eq!(
            parse_sse_frame(frame).unwrap(),
            Some((
                "runtime".to_string(),
                "{\"name\":\"chat-done\",\"payload\":{}}".to_string()
            ))
        );
        assert_eq!(find_sse_frame(b"event: resync\n\nnext"), Some((13, 2)));
    }
}
