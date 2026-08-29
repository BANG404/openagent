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

pub struct RuntimeAssetProxyResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
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

pub async fn proxy_webview_runtime_request(
    supervisor: &RuntimeProcessSupervisor,
    request: RuntimeProxyRequest,
) -> Result<RuntimeProxyResponse, String> {
    validate_webview_product_request(&request)?;
    proxy_runtime_request(supervisor, request).await
}

pub async fn proxy_runtime_asset_request(
    supervisor: &RuntimeProcessSupervisor,
    method: &str,
    path: &str,
    range: Option<&str>,
) -> Result<RuntimeAssetProxyResponse, String> {
    validate_runtime_asset_request(method, path)?;
    let connection = supervisor.connection().await?;
    let url = resolve_api_url(&connection.endpoint, path)?;
    let method = match method {
        "GET" => Method::GET,
        "HEAD" => Method::HEAD,
        _ => return Err("Runtime asset method is not allowed".to_string()),
    };
    let mut outbound = reqwest::Client::new()
        .request(method, url)
        .bearer_auth(&connection.token);
    if let Some(range) = range {
        outbound = outbound.header(reqwest::header::RANGE, range);
    }
    let mut response = outbound
        .send()
        .await
        .map_err(|error| format!("Runtime asset request failed: {error}"))?;
    let status = response.status().as_u16();
    let headers = [
        reqwest::header::CONTENT_TYPE,
        reqwest::header::CONTENT_LENGTH,
        reqwest::header::CONTENT_RANGE,
        reqwest::header::ACCEPT_RANGES,
    ]
    .into_iter()
    .filter_map(|name| {
        response
            .headers()
            .get(&name)
            .and_then(|value| value.to_str().ok())
            .map(|value| (name.as_str().to_string(), value.to_string()))
    })
    .collect();
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Runtime asset response failed: {error}"))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_PROXY_BODY_BYTES {
            return Err("Runtime asset response exceeds the desktop proxy limit".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(RuntimeAssetProxyResponse {
        status,
        headers,
        body,
    })
}

fn validate_runtime_asset_request(method: &str, path: &str) -> Result<(), String> {
    if !matches!(method, "GET" | "HEAD") {
        return Err("Runtime asset method is not allowed".to_string());
    }
    let url = Url::parse("http://openagent.runtime")
        .and_then(|base| base.join(path))
        .map_err(|error| format!("Runtime asset path is invalid: {error}"))?;
    let segments = url
        .path_segments()
        .map(|segments| segments.collect::<Vec<_>>())
        .unwrap_or_default();
    let allowed = matches!(segments.as_slice(), ["api", "media-assets", _])
        || matches!(segments.as_slice(), ["api", "html-assets", _, _, ..]);
    if url.origin() != Url::parse("http://openagent.runtime").unwrap().origin()
        || !allowed
        || path.contains(['\r', '\n', '#'])
        || path.starts_with("//")
    {
        return Err("Runtime asset path is not allowed".to_string());
    }
    Ok(())
}

fn validate_webview_product_request(request: &RuntimeProxyRequest) -> Result<(), String> {
    let method = parse_method(&request.method)?;
    let url = Url::parse("http://openagent.runtime")
        .and_then(|base| base.join(&request.path))
        .map_err(|error| format!("Runtime proxy path is invalid: {error}"))?;
    if url.origin() != Url::parse("http://openagent.runtime").unwrap().origin()
        || !request.path.starts_with("/api/")
        || request.path.contains(['\r', '\n', '#'])
        || request.path.starts_with("//")
    {
        return Err("Runtime proxy path is not allowed".to_string());
    }

    let segments = url
        .path_segments()
        .map(|segments| segments.collect::<Vec<_>>())
        .unwrap_or_default();
    let allowed = match (method, segments.as_slice()) {
        (Method::GET, ["api", "desktop", "bootstrap"])
        | (Method::GET, ["api", "session"])
        | (Method::GET, ["api", "workspaces"])
        | (Method::GET, ["api", "models"])
        | (Method::GET, ["api", "commands"])
        | (Method::GET, ["api", "preferences"])
        | (Method::GET, ["api", "workspaces", _, "roles"])
        | (Method::GET, ["api", "workspaces", _, "files"])
        | (Method::GET, ["api", "workspaces", _, "conversations"])
        | (Method::GET, ["api", "conversations", _])
        | (Method::GET, ["api", "conversations", _, "history"])
        | (Method::GET, ["api", "attachments", _])
        | (Method::POST, ["api", "pair"])
        | (Method::POST, ["api", "desktop", "operations"])
        | (Method::POST, ["api", "conversations"])
        | (Method::POST, ["api", "attachments"])
        | (Method::POST, ["api", "attachments", _])
        | (Method::POST, ["api", "conversations", _, "active-tip"])
        | (Method::POST, ["api", "conversations", _, "fork-runs"])
        | (Method::POST, ["api", "conversations", _, "cancel"])
        | (Method::POST, ["api", "conversations", _, "runs"])
        | (Method::POST, ["api", "conversations", _, "stream", "pause"])
        | (Method::POST, ["api", "conversations", _, "memory-retrieval", "skip"])
        | (Method::POST, ["api", "conversations", _, "interrupts", _])
        | (Method::POST, ["api", "conversations", _, "interrupts", _, "response"])
        | (Method::POST, ["api", "conversations", _, "file-changes", _, "revert"])
        | (Method::POST, ["api", "conversations", _, "workspace", "open"])
        | (Method::POST, ["api", "conversations", _, "workspace", "text-snippet"])
        | (Method::POST, ["api", "conversations", _, "workspace", "media"])
        | (Method::POST, ["api", "conversations", _, "workspace", "html-preview"])
        | (Method::PATCH, ["api", "conversations", _])
        | (Method::DELETE, ["api", "conversations", _]) => true,
        _ => false,
    };
    if !allowed {
        return Err("Runtime product operation is not available to the WebView".to_string());
    }
    Ok(())
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
    use super::{
        find_sse_frame, parse_method, parse_sse_frame, resolve_api_url,
        validate_runtime_asset_request, validate_webview_product_request, RuntimeProxyRequest,
    };
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
    fn webview_proxy_allows_product_operations_but_denies_lifecycle_control() {
        for (method, path) in [
            ("GET", "/api/desktop/bootstrap"),
            ("GET", "/api/workspaces/workspace-1/files?query=src"),
            ("POST", "/api/conversations/conv-1/runs"),
            ("POST", "/api/desktop/operations"),
            ("PATCH", "/api/conversations/conv-1"),
        ] {
            validate_webview_product_request(&RuntimeProxyRequest {
                method: method.to_string(),
                path: path.to_string(),
                body: None,
            })
            .unwrap();
        }

        for (method, path) in [
            ("POST", "/api/desktop/drain"),
            ("GET", "/api/events"),
            ("POST", "/api/conversations/conv-1/admin"),
            ("GET", "//example.com/api/conversations/conv-1"),
        ] {
            assert!(validate_webview_product_request(&RuntimeProxyRequest {
                method: method.to_string(),
                path: path.to_string(),
                body: None,
            })
            .is_err());
        }
    }

    #[test]
    fn runtime_asset_proxy_accepts_only_bounded_read_routes() {
        assert!(validate_runtime_asset_request("GET", "/api/media-assets/token").is_ok());
        assert!(
            validate_runtime_asset_request("HEAD", "/api/html-assets/token/assets/app.css").is_ok()
        );
        assert!(validate_runtime_asset_request("POST", "/api/media-assets/token").is_err());
        assert!(validate_runtime_asset_request("GET", "/api/desktop/bootstrap").is_err());
        assert!(
            validate_runtime_asset_request("GET", "//example.com/api/media-assets/token").is_err()
        );
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
