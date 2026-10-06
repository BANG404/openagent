// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;
use crate::cua_driver::stop_cua_driver_serve;

#[tauri::command]
pub(crate) async fn list_agent_roles(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<AgentRole>, String> {
    openagent_runtime::commands::list_agent_roles(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn list_agent_roles_for_workspace(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
) -> Result<Vec<AgentRole>, String> {
    openagent_runtime::commands::list_agent_roles_for_workspace(runtime.state(), workspace).await
}

#[tauri::command]
pub(crate) async fn save_agent_role(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: Option<String>,
    name: String,
    description: String,
    skill_ids: Vec<String>,
    mcp_server_ids: Vec<String>,
) -> Result<AgentRole, String> {
    openagent_runtime::commands::save_agent_role(
        runtime.state(),
        id,
        name,
        description,
        skill_ids,
        mcp_server_ids,
    )
    .await
}

#[tauri::command]
pub(crate) async fn delete_agent_role(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_runtime::commands::delete_agent_role(runtime.state(), id).await
}

#[tauri::command]
pub(crate) async fn get_settings(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Config, String> {
    openagent_runtime::commands::get_settings(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn save_settings(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    config: Config,
    base_config: Option<Config>,
) -> Result<Config, String> {
    let saved =
        openagent_runtime::commands::save_settings(runtime.state(), config, base_config).await?;
    if !openagent_runtime::config::agent_plugin_enabled(&saved, "cua-driver") {
        stop_cua_driver_serve();
    }
    Ok(saved)
}

#[tauri::command]
pub(crate) async fn get_wechat_channel_status(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<openagent_runtime::channels::WechatChannelStatus, String> {
    Ok(openagent_runtime::channels::get_wechat_channel_status(runtime.state()).await)
}

#[tauri::command]
pub(crate) async fn get_channel_statuses(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<openagent_runtime::channels::ChannelStatus>, String> {
    Ok(openagent_runtime::channels::get_channel_statuses(runtime.state()).await)
}

#[tauri::command]
pub(crate) async fn reset_wechat_channel(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<(), String> {
    openagent_runtime::channels::reset_wechat_channel(runtime.state()).await
}
#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn get_remote_gateway_status() -> Result<RemoteGatewayStatus, String> {
    openagent_runtime::commands::get_remote_gateway_status().await
}

#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn rotate_remote_gateway_pairing_code() -> Result<String, String> {
    openagent_runtime::commands::rotate_remote_gateway_pairing_code().await
}
