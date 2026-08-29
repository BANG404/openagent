use crate::runtime_process::RuntimeProcessSupervisor;
use crate::runtime_transport::proxy_runtime_asset_request;
use http::{header, Request, Response, StatusCode};

pub const SCHEME: &str = "openagent-runtime";

fn response(status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(body)
        .expect("valid Runtime asset protocol response")
}

pub async fn serve(
    request: Request<Vec<u8>>,
    supervisor: &RuntimeProcessSupervisor,
) -> Response<Vec<u8>> {
    let path = request
        .uri()
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or(request.uri().path());
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());
    let proxied =
        match proxy_runtime_asset_request(supervisor, request.method().as_str(), path, range).await
        {
            Ok(response) => response,
            Err(error) => {
                tracing::warn!(%error, "Runtime asset proxy rejected a request");
                return response(StatusCode::BAD_GATEWAY, Vec::new());
            }
        };
    let status = StatusCode::from_u16(proxied.status).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut builder = Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::CACHE_CONTROL, "no-cache");
    for (name, value) in proxied.headers {
        builder = builder.header(name, value);
    }
    builder
        .body(proxied.body)
        .unwrap_or_else(|_| response(StatusCode::BAD_GATEWAY, Vec::new()))
}
