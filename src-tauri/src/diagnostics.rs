#[cfg(feature = "embedded-runtime")]
use openagent_runtime::state::OpenAgentRuntime;
#[cfg(feature = "embedded-runtime")]
use std::sync::Arc;
#[cfg(not(feature = "embedded-runtime"))]
use tracing_subscriber::fmt::writer::MakeWriterExt;

#[cfg(not(feature = "embedded-runtime"))]
const RETAINED_HOST_LOG_FILES: usize = 15;

pub(crate) fn init_host_tracing(
    data_dir: &std::path::Path,
    #[cfg(feature = "embedded-runtime")] runtime: Option<&Arc<OpenAgentRuntime>>,
) {
    #[cfg(feature = "embedded-runtime")]
    {
        let _ = data_dir;
        tauri::async_runtime::block_on(async {
            let diagnostic_logs_enabled = if let Some(runtime) = runtime {
                runtime
                    .state()
                    .config
                    .lock()
                    .await
                    .diagnostic_log_collection_enabled
            } else {
                openagent_runtime::config::load_config()
                    .map(|config| config.diagnostic_log_collection_enabled)
                    .unwrap_or(true)
            };
            openagent_runtime::tracing_setup::set_diagnostic_log_collection_enabled(
                diagnostic_logs_enabled,
            );
            openagent_runtime::tracing_setup::init_tracing_with_service_version(env!(
                "CARGO_PKG_VERSION"
            ));
        });
    }
    #[cfg(not(feature = "embedded-runtime"))]
    {
        let logs_dir = data_dir.join("logs");
        if let Err(error) = std::fs::create_dir_all(&logs_dir) {
            eprintln!("failed to create host diagnostics directory: {error}");
            let _ = tracing_subscriber::fmt()
                .with_ansi(false)
                .with_max_level(tracing::Level::INFO)
                .try_init();
            return;
        }
        let file = match tracing_appender::rolling::RollingFileAppender::builder()
            .rotation(tracing_appender::rolling::Rotation::DAILY)
            .filename_prefix("openagent-host.jsonl")
            .max_log_files(RETAINED_HOST_LOG_FILES)
            .build(logs_dir)
        {
            Ok(file) => file,
            Err(error) => {
                eprintln!("failed to initialize host diagnostics file: {error}");
                let _ = tracing_subscriber::fmt()
                    .with_ansi(false)
                    .with_max_level(tracing::Level::INFO)
                    .try_init();
                return;
            }
        };
        let writer = std::io::stderr.and(file);
        let _ = tracing_subscriber::fmt()
            .json()
            .with_ansi(false)
            .with_max_level(tracing::Level::INFO)
            .with_writer(writer)
            .try_init();
    }
}

pub(crate) fn shutdown_host_tracing() {
    #[cfg(feature = "embedded-runtime")]
    openagent_runtime::tracing_setup::shutdown_tracing();
}

fn diagnostic_error_type(value: &str) -> &'static str {
    match value {
        "Error" => "Error",
        "EvalError" => "EvalError",
        "RangeError" => "RangeError",
        "ReferenceError" => "ReferenceError",
        "SyntaxError" => "SyntaxError",
        "TypeError" => "TypeError",
        "URIError" => "URIError",
        "AggregateError" => "AggregateError",
        "AbortError" => "AbortError",
        "NetworkError" => "NetworkError",
        "NotAllowedError" => "NotAllowedError",
        "NotFoundError" => "NotFoundError",
        "NotReadableError" => "NotReadableError",
        "NotSupportedError" => "NotSupportedError",
        "OperationError" => "OperationError",
        "QuotaExceededError" => "QuotaExceededError",
        "SecurityError" => "SecurityError",
        "TimeoutError" => "TimeoutError",
        "UnknownError" => "UnknownError",
        "bigint" => "bigint",
        "boolean" => "boolean",
        "function" => "function",
        "number" => "number",
        "object" => "object",
        "string" => "string",
        "symbol" => "symbol",
        "undefined" => "undefined",
        _ => "unknown_error_type",
    }
}

fn component_update_name(value: &str) -> Result<&'static str, String> {
    match value {
        "shell" => Ok("shell"),
        "runtime" => Ok("runtime"),
        "frontend" => Ok("frontend"),
        _ => Err("unknown component update diagnostic component".to_string()),
    }
}

fn component_update_stage(value: &str) -> Result<&'static str, String> {
    match value {
        "check_started" => Ok("check_started"),
        "check_available" => Ok("check_available"),
        "check_current" => Ok("check_current"),
        "check_failed" => Ok("check_failed"),
        "download_started" => Ok("download_started"),
        "download_finished" => Ok("download_finished"),
        "download_failed" => Ok("download_failed"),
        "install_started" => Ok("install_started"),
        "install_finished" => Ok("install_finished"),
        "install_failed" => Ok("install_failed"),
        "confirmation_started" => Ok("confirmation_started"),
        "confirmation_finished" => Ok("confirmation_finished"),
        "confirmation_failed" => Ok("confirmation_failed"),
        "restart_requested" => Ok("restart_requested"),
        _ => Err("unknown component update diagnostic stage".to_string()),
    }
}

pub(crate) fn component_update_version(value: Option<String>) -> Result<Option<String>, String> {
    value
        .map(|version| {
            semver::Version::parse(&version)
                .map(|parsed| parsed.to_string())
                .map_err(|_| "component update diagnostic version is invalid".to_string())
        })
        .transpose()
}

#[tauri::command]
pub(crate) fn report_component_update_event(
    component: String,
    stage: String,
    current_version: Option<String>,
    candidate_version: Option<String>,
    error_kind: Option<String>,
) -> Result<(), String> {
    let component = component_update_name(&component)?;
    let stage = component_update_stage(&stage)?;
    let current_version = component_update_version(current_version)?;
    let candidate_version = component_update_version(candidate_version)?;
    let error_type = error_kind
        .as_deref()
        .map(diagnostic_error_type)
        .unwrap_or("none");
    if stage.ends_with("failed") {
        tracing::error!(
            target: "openagent::component_update",
            component,
            stage,
            current_version = current_version.as_deref().unwrap_or("unknown"),
            candidate_version = candidate_version.as_deref().unwrap_or("unknown"),
            error_type,
            "component update stage reported by the frontend failed"
        );
    } else {
        tracing::info!(
            target: "openagent::component_update",
            component,
            stage,
            current_version = current_version.as_deref().unwrap_or("unknown"),
            candidate_version = candidate_version.as_deref().unwrap_or("unknown"),
            "component update stage reported by the frontend"
        );
    }
    Ok(())
}

#[cfg(feature = "embedded-runtime")]
#[tauri::command]
pub(crate) fn report_frontend_diagnostic(
    event_name: String,
    component: String,
    error_kind: String,
) {
    openagent_runtime::commands::report_frontend_diagnostic(&event_name, &component, &error_kind);
}

#[cfg(not(feature = "embedded-runtime"))]
#[tauri::command]
pub(crate) async fn report_frontend_diagnostic(
    supervisor: tauri::State<'_, std::sync::Arc<crate::runtime_process::RuntimeProcessSupervisor>>,
    event_name: String,
    component: String,
    error_kind: String,
) -> Result<(), String> {
    let response = crate::runtime_transport::proxy_runtime_request(
        supervisor.inner(),
        crate::runtime_transport::RuntimeProxyRequest {
            method: "POST".to_string(),
            path: "/api/desktop/operations".to_string(),
            body: Some(serde_json::json!({
                "operation": "report_frontend_diagnostic",
                "args": { "eventName": event_name, "component": component, "errorKind": error_kind }
            }).to_string()),
        },
    ).await?;
    if !(200..300).contains(&response.status) {
        return Err("Runtime frontend diagnostic reporting failed".to_string());
    }
    Ok(())
}

#[cfg(feature = "embedded-runtime")]
#[tauri::command]
pub(crate) async fn submit_problem_report(
    runtime: tauri::State<'_, std::sync::Arc<openagent_runtime::OpenAgentRuntime>>,
    description: String,
    conv_id: Option<String>,
) -> Result<openagent_runtime::commands::ProblemReportReceipt, String> {
    openagent_runtime::commands::submit_problem_report(runtime.state(), description, conv_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn component_update_diagnostic_fields_are_bounded() {
        assert_eq!(component_update_name("shell"), Ok("shell"));
        assert_eq!(component_update_name("runtime"), Ok("runtime"));
        assert_eq!(component_update_name("frontend"), Ok("frontend"));
        assert!(component_update_name("conversation-123").is_err());

        for stage in [
            "check_started",
            "check_available",
            "check_current",
            "check_failed",
            "download_started",
            "download_finished",
            "download_failed",
            "install_started",
            "install_finished",
            "install_failed",
            "confirmation_started",
            "confirmation_finished",
            "confirmation_failed",
            "restart_requested",
        ] {
            assert_eq!(component_update_stage(stage), Ok(stage));
        }
        assert!(component_update_stage("raw user content").is_err());

        assert_eq!(
            component_update_version(Some("1.2.3-beta.1+build.7".to_string())),
            Ok(Some("1.2.3-beta.1+build.7".to_string()))
        );
        assert_eq!(component_update_version(None), Ok(None));
        assert!(component_update_version(Some("latest/private/path".to_string())).is_err());
    }
}
