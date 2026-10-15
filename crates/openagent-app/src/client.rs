//! Native-only client. The process token must never be exposed to a WebView.
use reqwest::{redirect::Policy, Url};
use serde::{de::DeserializeOwned, Serialize};
use std::time::Duration;

#[derive(Clone)]
pub struct RuntimeClient {
    client: reqwest::Client,
    endpoint: Url,
    token: String,
}

impl RuntimeClient {
    pub fn new(endpoint: &str, token: String) -> Result<Self, String> {
        let endpoint = validate_endpoint(endpoint)?;
        if token.len() < 32 || token.bytes().any(|byte| byte.is_ascii_control()) {
            return Err(
                "Runtime token must contain at least 32 bytes without control characters".into(),
            );
        }
        let client = reqwest::Client::builder()
            .redirect(Policy::none())
            .no_proxy()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|error| format!("Failed to create Runtime client: {error}"))?;
        Ok(Self {
            client,
            endpoint,
            token,
        })
    }

    /// Product operations use the same contract as the TypeScript SDK. This
    /// native method is not an unrestricted WebView request proxy.
    pub async fn operation<A: Serialize, R: DeserializeOwned>(
        &self,
        operation: &str,
        args: &A,
    ) -> Result<R, String> {
        let url = self
            .endpoint
            .join("/api/desktop/operations")
            .map_err(|error| error.to_string())?;
        let response = self
            .client
            .post(url)
            .bearer_auth(&self.token)
            .json(&serde_json::json!({ "operation": operation, "args": args }))
            .send()
            .await
            .map_err(|error| format!("Runtime request failed: {error}"))?;
        if !response.status().is_success() {
            // Do not include arbitrary response content: it can contain user
            // configuration, credentials or private execution diagnostics.
            return Err(format!(
                "Runtime operation failed with HTTP {}",
                response.status().as_u16()
            ));
        }
        if response.status() == reqwest::StatusCode::NO_CONTENT {
            return serde_json::from_value(serde_json::Value::Null)
                .map_err(|error| error.to_string());
        }
        response
            .json()
            .await
            .map_err(|error| format!("Invalid Runtime response: {error}"))
    }
}

fn validate_endpoint(endpoint: &str) -> Result<Url, String> {
    let url = Url::parse(endpoint).map_err(|_| "Invalid Runtime endpoint".to_string())?;
    let loopback = url
        .host_str()
        .and_then(|host| {
            host.trim_matches(['[', ']'])
                .parse::<std::net::IpAddr>()
                .ok()
        })
        .is_some_and(|ip| ip.is_loopback());
    if url.scheme() != "http"
        || !loopback
        || url.port().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Runtime endpoint must be an HTTP loopback origin with an explicit port".into(),
        );
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    async fn http_fixture(response: &'static str) -> (String, tokio::task::JoinHandle<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut chunk = [0; 4096];
            loop {
                let count = socket.read(&mut chunk).await.unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..count]);
                let text = String::from_utf8_lossy(&request);
                if let Some((headers, body)) = text.split_once("\r\n\r\n") {
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length: ")?
                                .parse::<usize>()
                                .ok()
                        })
                        .unwrap_or(0);
                    if body.len() >= length {
                        break;
                    }
                }
            }
            socket.write_all(response.as_bytes()).await.unwrap();
            String::from_utf8(request).unwrap()
        });
        (endpoint, server)
    }

    #[tokio::test]
    async fn operations_use_the_authenticated_contract_and_preserve_no_content() {
        let (endpoint, server) =
            http_fixture("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n").await;
        let client = RuntimeClient::new(&endpoint, "a".repeat(32)).unwrap();
        let _: () = client
            .operation(
                "clear_conversation",
                &serde_json::json!({"convId":"fixture"}),
            )
            .await
            .unwrap();
        let request = server.await.unwrap();
        assert!(request.starts_with("POST /api/desktop/operations HTTP/1.1\r\n"));
        assert!(request
            .to_ascii_lowercase()
            .contains(&format!("authorization: bearer {}", "a".repeat(32))));
        let (_, body) = request.split_once("\r\n\r\n").unwrap();
        let body: serde_json::Value = serde_json::from_str(body).unwrap();
        assert_eq!(
            body,
            serde_json::json!({"operation":"clear_conversation", "args":{"convId":"fixture"}})
        );
    }

    #[tokio::test]
    async fn redirects_are_rejected_and_errors_do_not_reveal_response_content() {
        for response in [
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/\r\nContent-Length: 14\r\nConnection: close\r\n\r\nPRIVATE_SECRET",
            "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 14\r\nConnection: close\r\n\r\nPRIVATE_SECRET",
        ] {
            let (endpoint, server) = http_fixture(response).await;
            let client = RuntimeClient::new(&endpoint, "a".repeat(32)).unwrap();
            let error = client.operation::<_, serde_json::Value>("get_settings", &()).await.unwrap_err();
            assert!(error.contains("Runtime operation failed with HTTP"));
            assert!(!error.contains("PRIVATE_SECRET"));
            server.await.unwrap();
        }
    }

    #[test]
    fn endpoint_cannot_redirect_credentials_to_an_external_origin() {
        for endpoint in ["http://127.0.0.1:4100", "http://[::1]:4100"] {
            assert!(validate_endpoint(endpoint).is_ok(), "{endpoint}");
        }
        for endpoint in [
            "https://127.0.0.1:4100",
            "http://localhost:4100",
            "http://192.0.2.1:4100",
            "http://user@127.0.0.1:4100",
            "http://127.0.0.1:4100/private",
            "http://127.0.0.1:4100/?token=secret",
            "http://127.0.0.1",
        ] {
            assert!(validate_endpoint(endpoint).is_err(), "{endpoint}");
        }
    }
}
