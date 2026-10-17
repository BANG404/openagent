//! Native command boundary for authenticated external Runtime requests.
use crate::plugin_daemons::plugin_daemon_supervisor;
use crate::runtime_process::RuntimeProcessSupervisor;
use crate::runtime_transport::{
    self, RuntimeEventProxy, RuntimeProxyRequest, RuntimeProxyResponse,
};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub(crate) async fn proxy_runtime_request(
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
    request: RuntimeProxyRequest,
) -> Result<RuntimeProxyResponse, String> {
    if request.method == "POST" && request.path == "/api/desktop/operations" {
        if let Some(body) = request.body.as_deref() {
            if let Ok(operation) = serde_json::from_str::<serde_json::Value>(body) {
                if matches!(
                    operation["operation"].as_str(),
                    Some("uninstall_agent_plugin" | "update_agent_plugin")
                ) {
                    if let Some(id) = operation["args"]["id"].as_str() {
                        // Host-owned daemons must release the package before
                        // Runtime can replace or remove its files on Windows.
                        plugin_daemon_supervisor().stop(id)?;
                    }
                }
            }
        }
    }
    let response =
        runtime_transport::proxy_webview_runtime_request(supervisor.inner(), request).await?;
    Ok(response)
}

#[tauri::command]
pub(crate) async fn runtime_transport_mode(
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<String, String> {
    Ok(if supervisor.status().await.is_some() {
        "external".to_string()
    } else {
        "embedded".to_string()
    })
}

#[tauri::command]
pub(crate) async fn start_runtime_event_proxy(
    app: tauri::AppHandle,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
    proxy: State<'_, RuntimeEventProxy>,
) -> Result<u64, String> {
    proxy.start(app, supervisor.inner().clone()).await
}

#[tauri::command]
pub(crate) async fn stop_runtime_event_proxy(
    proxy: State<'_, RuntimeEventProxy>,
) -> Result<(), String> {
    proxy.stop().await;
    Ok(())
}
