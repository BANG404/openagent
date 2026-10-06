//! Native capabilities: paths, downloads, workspace processes, and WSL.
#[cfg(feature = "embedded-runtime")]
use crate::embedding_adapter::EmbeddedRuntimeState;
use crate::runtime_process::RuntimeProcessSupervisor;
use crate::runtime_transport::{self, RuntimeProxyRequest};
use crate::{local_capabilities, workspace_process, wsl, DesktopDataDir};
#[cfg(feature = "embedded-runtime")]
use openagent_runtime::state::OpenAgentRuntime;
use std::sync::Arc;
use tauri::State;

pub(crate) async fn resolve_desktop_open_path(
    path: String,
    #[cfg(feature = "embedded-runtime")] embedded_runtime: Option<&OpenAgentRuntime>,
    supervisor: &RuntimeProcessSupervisor,
) -> Result<String, String> {
    #[cfg(feature = "embedded-runtime")]
    if let Some(runtime) = embedded_runtime {
        return openagent_runtime::commands::resolve_open_path(path, runtime.state()).await;
    }
    let response = runtime_transport::proxy_runtime_request(
        supervisor,
        RuntimeProxyRequest {
            method: "POST".to_string(),
            path: "/api/desktop/operations".to_string(),
            body: Some(
                serde_json::json!({
                    "operation": "resolve_open_path",
                    "args": { "path": path },
                })
                .to_string(),
            ),
        },
    )
    .await?;
    if !(200..300).contains(&response.status) {
        return Err(format!(
            "Runtime path resolution failed with status {}: {}",
            response.status, response.body
        ));
    }
    serde_json::from_str(&response.body)
        .map_err(|error| format!("Runtime path resolution response was invalid: {error}"))
}

#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn open_path(
    path: String,
    app_handle: tauri::AppHandle,
    embedded_runtime: State<'_, EmbeddedRuntimeState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let resolved = resolve_desktop_open_path(
        path,
        embedded_runtime.inner().0.as_deref(),
        supervisor.inner(),
    )
    .await?;
    app_handle
        .opener()
        .open_path(resolved, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn open_logs_folder(
    app_handle: tauri::AppHandle,
    data_dir: State<'_, DesktopDataDir>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let logs_dir = data_dir.0.join("logs");
    std::fs::create_dir_all(&logs_dir).map_err(|error| error.to_string())?;
    app_handle
        .opener()
        .open_path(logs_dir.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[cfg(not(feature = "embedded-runtime"))]
pub(crate) async fn open_path(
    path: String,
    app_handle: tauri::AppHandle,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let resolved = resolve_desktop_open_path(path, supervisor.inner()).await?;
    app_handle
        .opener()
        .open_path(resolved, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn read_text_file(path: String) -> Result<String, String> {
    local_capabilities::read_text_file(path).await
}

#[tauri::command]
pub(crate) async fn save_download_file(
    filename: String,
    content: String,
    encoding: Option<String>,
) -> Result<String, String> {
    local_capabilities::save_download_file(filename, content, encoding).await
}

#[tauri::command]
pub(crate) fn get_system_locale() -> String {
    local_capabilities::system_locale()
}

#[tauri::command]
pub(crate) async fn list_wsl_distributions() -> Result<Vec<wsl::WslDistribution>, String> {
    wsl::list_distributions().await
}

#[tauri::command]
pub(crate) async fn get_wsl_home(distribution: String) -> Result<wsl::WslWorkspaceTarget, String> {
    wsl::resolve_home(&distribution).await
}

#[tauri::command]
pub(crate) async fn resolve_wsl_workspace(
    distribution: String,
    linux_path: String,
) -> Result<wsl::WslWorkspaceTarget, String> {
    wsl::resolve_workspace(&distribution, &linux_path).await
}

#[tauri::command]
pub(crate) async fn open_workspace_window(
    path: String,
    conversation_id: Option<String>,
    message_id: Option<String>,
    new_conversation: bool,
) -> Result<(), String> {
    workspace_process::open_workspace_window(path, conversation_id, message_id, new_conversation)
}

#[tauri::command]
pub(crate) fn create_workspace_window(path: String) -> Result<(), String> {
    workspace_process::create_workspace_window(path)
}
