// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;

#[tauri::command]
pub(crate) async fn get_agent_plugin_configuration(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    plugin_id: String,
) -> Result<openagent_runtime::agent_plugins::configuration::PluginConfigurationStatus, String> {
    openagent_runtime::commands::get_agent_plugin_configuration(runtime.state(), plugin_id).await
}
#[tauri::command]
pub(crate) async fn save_agent_plugin_configuration(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    plugin_id: String,
    values: std::collections::BTreeMap<String, serde_json::Value>,
    revision: String,
) -> Result<openagent_runtime::agent_plugins::configuration::PluginConfigurationStatus, String> {
    openagent_runtime::commands::save_agent_plugin_configuration(
        runtime.state(),
        plugin_id,
        values,
        revision,
    )
    .await
}
#[tauri::command]
pub(crate) async fn test_agent_plugin_connector(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    plugin_id: String,
    server_name: String,
) -> Result<openagent_runtime::mcp::McpProbeOutcome, String> {
    openagent_runtime::commands::test_agent_plugin_connector(
        runtime.state(),
        plugin_id,
        server_name,
    )
    .await
}
#[tauri::command]
pub(crate) async fn begin_agent_plugin_oauth(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    plugin_id: String,
    server_name: String,
) -> Result<openagent_runtime::mcp_oauth::OAuthAuthorizationStart, String> {
    openagent_runtime::commands::begin_agent_plugin_oauth(runtime.state(), plugin_id, server_name)
        .await
}
#[tauri::command]
pub(crate) async fn get_agent_plugin_oauth_status(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    plugin_id: String,
    server_name: String,
) -> Result<openagent_runtime::mcp_oauth::OAuthAuthorizationStatus, String> {
    openagent_runtime::commands::get_agent_plugin_oauth_status(
        runtime.state(),
        plugin_id,
        server_name,
    )
    .await
}
#[tauri::command]
pub(crate) async fn revoke_agent_plugin_oauth(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    plugin_id: String,
    server_name: String,
) -> Result<(), String> {
    openagent_runtime::commands::revoke_agent_plugin_oauth(runtime.state(), plugin_id, server_name)
        .await
}

#[tauri::command]
pub(crate) async fn list_skills(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<SkillMetadata>, String> {
    openagent_runtime::commands::list_skills(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn list_agent_plugins(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<openagent_runtime::agent_plugins::AgentPluginSummary>, String> {
    openagent_runtime::commands::list_agent_plugins(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn list_agent_plugin_marketplaces(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<openagent_runtime::agent_plugins::AgentPluginMarketplaceSummary>, String> {
    openagent_runtime::commands::list_agent_plugin_marketplaces(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn check_agent_plugin_updates(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<openagent_runtime::agent_plugins::AgentPluginUpdateReport, String> {
    openagent_runtime::commands::check_agent_plugin_updates(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn update_agent_plugin(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<openagent_runtime::agent_plugins::AgentPluginSummary, String> {
    openagent_runtime::commands::update_agent_plugin(runtime.state(), id).await
}

#[tauri::command]
pub(crate) async fn install_agent_plugin(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    source: String,
) -> Result<openagent_runtime::agent_plugins::AgentPluginSummary, String> {
    openagent_runtime::commands::install_agent_plugin(runtime.state(), source).await
}

#[tauri::command]
pub(crate) async fn install_marketplace_agent_plugin(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    marketplace_path: String,
    plugin_name: String,
) -> Result<openagent_runtime::agent_plugins::AgentPluginSummary, String> {
    openagent_runtime::commands::install_marketplace_agent_plugin(
        runtime.state(),
        marketplace_path,
        plugin_name,
    )
    .await
}

/// Install a bundled-registry entry through the Runtime's normal marketplace
/// path. The Runtime owns source validation and temporary marketplace cleanup
/// so embedded and supervised desktop modes follow the same contract.
#[tauri::command]
pub(crate) async fn install_official_agent_plugin(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    plugin_id: String,
    display_name: String,
    source_url: String,
) -> Result<openagent_runtime::agent_plugins::AgentPluginSummary, String> {
    openagent_runtime::commands::install_official_agent_plugin(
        runtime.state(),
        plugin_id,
        display_name,
        source_url,
    )
    .await
}

#[tauri::command]
pub(crate) async fn uninstall_agent_plugin(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    plugin_daemon_supervisor().stop(&id)?;
    openagent_runtime::commands::uninstall_agent_plugin(runtime.state(), id).await
}

#[tauri::command]
pub(crate) async fn read_agent_plugin_asset(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    plugin_id: String,
    entry: String,
) -> Result<openagent_runtime::agent_plugins::AgentPluginAsset, String> {
    openagent_runtime::commands::read_agent_plugin_asset(runtime.state(), plugin_id, entry).await
}

#[tauri::command]
pub(crate) async fn get_skill_content(path: String) -> Result<String, String> {
    openagent_runtime::commands::get_skill_content(path).await
}

#[tauri::command]
pub(crate) async fn save_skill_content(path: String, content: String) -> Result<(), String> {
    openagent_runtime::commands::save_skill_content(path, content).await
}

#[tauri::command]
pub(crate) async fn create_skill(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    name: String,
    description: String,
) -> Result<SkillMetadata, String> {
    openagent_runtime::commands::create_skill(runtime.state(), scope, name, description).await
}

#[tauri::command]
pub(crate) async fn delete_skill(path: String) -> Result<(), String> {
    openagent_runtime::commands::delete_skill(path).await
}

#[tauri::command]
pub(crate) async fn get_skills_dir(
    scope: String,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<String, String> {
    openagent_runtime::commands::get_skills_dir(scope, runtime.state()).await
}
