// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;

#[tauri::command]
pub(crate) async fn set_default_chat_model(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    binding: DefaultModelBinding,
) -> Result<DefaultModelBinding, String> {
    openagent_runtime::commands::set_default_chat_model(runtime.state(), binding).await
}

#[tauri::command]
pub(crate) async fn set_model_reasoning_effort(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    provider_id: String,
    model: String,
    effort: ReasoningEffort,
) -> Result<ReasoningEffort, String> {
    openagent_runtime::commands::set_model_reasoning_effort(
        runtime.state(),
        provider_id,
        model,
        effort,
    )
    .await
}

#[tauri::command]
pub(crate) async fn save_workspace_prefs(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
    recent_workspaces: Vec<RecentWorkspace>,
) -> Result<(), String> {
    openagent_runtime::commands::save_workspace_prefs(runtime.state(), workspace, recent_workspaces)
        .await
}

#[tauri::command]
pub(crate) async fn set_active_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: Option<String>,
    workspace: String,
) -> Result<(), String> {
    openagent_runtime::commands::set_active_conversation(runtime.state(), conv_id, workspace).await
}

#[tauri::command]
pub(crate) async fn get_active_conv_id(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
) -> Result<Option<String>, String> {
    openagent_runtime::commands::get_active_conv_id(runtime.state(), workspace).await
}

#[tauri::command]
pub(crate) async fn get_new_conversation_suggestions(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
    language: String,
) -> Result<Vec<String>, String> {
    openagent_runtime::commands::get_new_conversation_suggestions(
        runtime.state(),
        workspace,
        language,
    )
    .await
}

#[tauri::command]
pub(crate) async fn test_provider_connection(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    request: ProviderProbeRequest,
) -> Result<ProviderProbeResult, String> {
    openagent_runtime::commands::test_provider_connection(runtime.inner(), request).await
}

#[tauri::command]
pub(crate) async fn fetch_provider_models(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    request: ProviderProbeRequest,
) -> Result<Vec<String>, String> {
    openagent_runtime::commands::fetch_provider_models(runtime.inner(), request).await
}

#[tauri::command]
pub(crate) async fn get_chatgpt_auth_status() -> Result<bool, String> {
    openagent_runtime::commands::get_chatgpt_auth_status().await
}

#[tauri::command]
pub(crate) async fn logout_chatgpt() -> Result<bool, String> {
    openagent_runtime::commands::logout_chatgpt().await
}

#[tauri::command]
pub(crate) async fn refresh_mcp_servers(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<(), String> {
    openagent_runtime::commands::refresh_mcp_servers(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn inspector_database_overview(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<InspectorDatabaseOverview, String> {
    openagent_runtime::commands::inspector_database_overview(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn inspector_table_data(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    table_name: String,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<InspectorTableData, String> {
    openagent_runtime::commands::inspector_table_data(
        runtime.state(),
        table_name,
        search,
        sort_column,
        sort_direction,
        offset,
        limit,
    )
    .await
}
