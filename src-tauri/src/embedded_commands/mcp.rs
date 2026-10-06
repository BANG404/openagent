// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;

#[tauri::command]
pub(crate) async fn get_mcp_servers(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<McpServerConfig>, String> {
    openagent_runtime::commands::get_mcp_servers(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn save_mcp_servers(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    servers: Vec<McpServerConfig>,
) -> Result<(), String> {
    let cua_enabled = {
        let config = runtime.state().config.lock().await;
        config
            .agent_plugins_enabled
            .get("cua-driver")
            .copied()
            .unwrap_or_else(|| {
                servers
                    .iter()
                    .find(|server| server.id == "cua-driver")
                    .is_some_and(|server| server.enabled)
            })
    };
    if cua_enabled
        && servers
            .iter()
            .any(|server| server.id == "cua-driver" && server.enabled)
    {
        ensure_cua_driver_serve(runtime.inner().clone()).await?;
    }
    openagent_runtime::commands::save_mcp_servers(runtime.state(), servers).await
}

#[tauri::command]
pub(crate) async fn test_mcp_server(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    server: McpServerConfig,
) -> Result<runtime_mcp::McpProbeOutcome, String> {
    let plugin_enabled = {
        let config = runtime.state().config.lock().await;
        config
            .agent_plugins_enabled
            .get("cua-driver")
            .copied()
            .unwrap_or(server.enabled)
    };
    if server.id == "cua-driver" && !plugin_enabled {
        return Err("Cua Driver plugin is disabled in settings".to_string());
    }
    if server.id == "cua-driver" && server.enabled {
        ensure_cua_driver_serve(runtime.inner().clone()).await?;
    }
    openagent_runtime::commands::test_mcp_server(runtime.state(), server).await
}

#[tauri::command]
pub(crate) async fn begin_mcp_oauth(
    server: McpServerConfig,
) -> Result<openagent_runtime::mcp_oauth::OAuthAuthorizationStart, String> {
    openagent_runtime::commands::begin_mcp_oauth(server).await
}

#[tauri::command]
pub(crate) async fn get_mcp_oauth_status(
    server_id: String,
) -> Result<openagent_runtime::mcp_oauth::OAuthAuthorizationStatus, String> {
    openagent_runtime::commands::get_mcp_oauth_status(server_id).await
}

#[tauri::command]
pub(crate) async fn call_mcp_tool(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    server_id: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    openagent_runtime::commands::call_mcp_ui_tool(runtime.state(), server_id, tool_name, arguments)
        .await
}

#[tauri::command]
pub(crate) async fn read_mcp_resource(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    server_id: String,
    uri: String,
) -> Result<serde_json::Value, String> {
    openagent_runtime::commands::read_mcp_resource(runtime.state(), server_id, uri).await
}

#[tauri::command]
pub(crate) async fn list_mcp_prompts(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    server_id: String,
) -> Result<serde_json::Value, String> {
    openagent_runtime::commands::list_mcp_prompts(runtime.state(), server_id).await
}

#[tauri::command]
pub(crate) async fn get_mcp_prompt(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    server_id: String,
    name: String,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    openagent_runtime::commands::get_mcp_prompt(runtime.state(), server_id, name, arguments).await
}

#[tauri::command]
pub(crate) async fn list_mcp_resources(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    server_id: String,
) -> Result<serde_json::Value, String> {
    openagent_runtime::commands::list_mcp_resources(runtime.state(), server_id).await
}

#[tauri::command]
pub(crate) async fn list_mcp_resource_templates(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    server_id: String,
) -> Result<serde_json::Value, String> {
    openagent_runtime::commands::list_mcp_resource_templates(runtime.state(), server_id).await
}

#[tauri::command]
pub(crate) async fn get_mcp_app_state(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conversation_id: Option<String>,
    server_id: String,
    resource_uri: String,
) -> Result<serde_json::Value, String> {
    openagent_runtime::commands::get_mcp_app_state(
        runtime.state(),
        conversation_id,
        server_id,
        resource_uri,
    )
    .await
}

#[tauri::command]
pub(crate) async fn set_mcp_app_state(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conversation_id: Option<String>,
    server_id: String,
    resource_uri: String,
    widget_state: serde_json::Value,
) -> Result<(), String> {
    openagent_runtime::commands::set_mcp_app_state(
        runtime.state(),
        conversation_id,
        server_id,
        resource_uri,
        widget_state,
    )
    .await
}

#[tauri::command]
pub(crate) async fn update_mcp_app_model_context(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conversation_id: String,
    content: Option<serde_json::Value>,
    structured_content: Option<serde_json::Value>,
) -> Result<(), String> {
    openagent_runtime::commands::update_mcp_app_model_context(
        runtime.state(),
        conversation_id,
        content,
        structured_content,
    )
    .await
}

#[tauri::command]
pub(crate) async fn mcp_app_import_file(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    path: String,
) -> Result<openagent_runtime::commands::McpAppFile, String> {
    openagent_runtime::commands::mcp_app_import_file(runtime.state(), path).await
}

#[tauri::command]
pub(crate) async fn mcp_app_upload_file(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    name: String,
    mime_type: String,
    content_base64: String,
) -> Result<openagent_runtime::commands::McpAppFile, String> {
    openagent_runtime::commands::mcp_app_upload_file(
        runtime.state(),
        name,
        mime_type,
        content_base64,
    )
    .await
}

#[tauri::command]
pub(crate) async fn mcp_app_get_file_download_url(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    file_id: String,
) -> Result<openagent_runtime::commands::McpAppDownload, String> {
    openagent_runtime::commands::mcp_app_get_file_download_url(runtime.state(), file_id).await
}
