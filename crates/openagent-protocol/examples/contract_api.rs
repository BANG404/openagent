use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use openagent_protocol::{command_specs, resolve_input, InputError};
use serde::Deserialize;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};

#[derive(Clone, Copy)]
struct ApiState {
    address: SocketAddr,
}

#[derive(Deserialize)]
struct ResolveRequest {
    text: String,
}

#[tokio::main]
async fn main() {
    let port = parse_port().unwrap_or_else(|message| {
        eprintln!("{message}");
        std::process::exit(2);
    });
    let listener =
        tokio::net::TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port))
            .await
            .unwrap_or_else(|error| {
                eprintln!("failed to bind runtime test API: {error}");
                std::process::exit(1);
            });
    let address = listener.local_addr().unwrap_or_else(|error| {
        eprintln!("failed to read runtime test API address: {error}");
        std::process::exit(1);
    });
    let app = Router::new()
        .route("/v1/health", get(health))
        .route("/v1/commands", get(commands))
        .route("/v1/input/resolve", post(resolve))
        .with_state(ApiState { address });

    println!(
        "{{\"service\":\"openagent-protocol-test-api\",\"base_url\":\"http://{}\"}}",
        address
    );
    if let Err(error) = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        eprintln!("runtime test API failed: {error}");
        std::process::exit(1);
    }
}

async fn health(State(state): State<ApiState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "openagent-protocol-test-api",
        "address": state.address,
    }))
}

async fn commands() -> Json<Vec<openagent_protocol::CommandSpec>> {
    Json(command_specs())
}

async fn resolve(Json(request): Json<ResolveRequest>) -> Result<Json<serde_json::Value>, ApiError> {
    let resolved = resolve_input(&request.text).map_err(ApiError)?;
    Ok(Json(
        serde_json::to_value(resolved).expect("resolved input must serialize"),
    ))
}

struct ApiError(InputError);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (StatusCode::UNPROCESSABLE_ENTITY, Json(self.0)).into_response()
    }
}

fn parse_port() -> Result<u16, String> {
    let mut args = std::env::args().skip(1);
    let mut port = 0;
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--port" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--port requires a value".to_string())?;
                port = value
                    .parse::<u16>()
                    .map_err(|_| format!("invalid port: {value}"))?;
            }
            "--help" | "-h" => {
                println!("Usage: openagent-protocol-test-api [--port <0-65535>]");
                std::process::exit(0);
            }
            _ => return Err(format!("unknown argument: {argument}")),
        }
    }
    Ok(port)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
