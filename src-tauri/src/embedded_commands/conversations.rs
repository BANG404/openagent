// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;

#[tauri::command]
pub(crate) async fn get_conversations(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: Option<String>,
) -> Result<Vec<ConversationMeta>, String> {
    openagent_runtime::commands::get_conversations(runtime.state(), workspace).await
}

#[tauri::command]
pub(crate) async fn get_conversation_page(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: Option<String>,
    cursor: Option<ConversationPageCursor>,
    limit: usize,
    search_query: Option<String>,
    filter_by_role: Option<bool>,
    role_id: Option<String>,
) -> Result<ConversationPage, String> {
    openagent_runtime::commands::get_conversation_page(
        runtime.state(),
        workspace,
        cursor,
        limit,
        search_query,
        filter_by_role,
        role_id,
    )
    .await
}

#[tauri::command]
pub(crate) async fn get_conversation_meta(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<ConversationMeta>, String> {
    openagent_runtime::commands::get_conversation_meta(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn get_child_conversations(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    parent_conv_id: String,
    workspace: Option<String>,
) -> Result<Vec<ConversationMeta>, String> {
    openagent_runtime::commands::get_child_conversations(runtime.state(), parent_conv_id, workspace)
        .await
}

#[tauri::command]
pub(crate) async fn create_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
    title: String,
    workspace: String,
    parent_conv_id: Option<String>,
    role_id: Option<String>,
) -> Result<(), String> {
    runtime
        .facade()
        .create_conversation(CreateConversationRequest {
            id,
            title,
            workspace,
            parent_conv_id,
            role_id,
        })
        .await
}

#[tauri::command]
pub(crate) async fn update_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    patch: ConvPatch,
) -> Result<(), String> {
    openagent_runtime::commands::update_conversation(runtime.state(), conv_id, patch).await
}

#[tauri::command]
pub(crate) async fn create_branch(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
    conv_id: String,
    parent_branch_id: Option<String>,
    forked_from_checkpoint_id: Option<String>,
    forked_from_message_id: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::create_branch(
        runtime.state(),
        id,
        conv_id,
        parent_branch_id,
        forked_from_checkpoint_id,
        forked_from_message_id,
    )
    .await
}

#[tauri::command]
pub(crate) async fn get_branches(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<BranchMeta>, String> {
    openagent_runtime::commands::get_branches(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn set_branch_head(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    branch_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::set_branch_head(runtime.state(), branch_id, checkpoint_id).await
}

#[tauri::command]
pub(crate) async fn set_active_branch_tip(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::set_active_branch_tip(runtime.state(), conv_id, checkpoint_id)
        .await
}

#[tauri::command]
pub(crate) async fn get_active_branch_tip(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<String>, String> {
    openagent_runtime::commands::get_active_branch_tip(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn delete_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    runtime.facade().delete_conversation(conv_id).await
}

#[tauri::command]
pub(crate) async fn get_task_traces(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<TaskTrace>, String> {
    openagent_runtime::commands::get_task_traces(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn get_chat_task_usages(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<ChatTaskUsage>, String> {
    openagent_runtime::commands::get_chat_task_usages(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn get_latest_checkpoint(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<CheckpointMeta>, String> {
    openagent_runtime::commands::get_latest_checkpoint(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn get_checkpoint_metas(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<CheckpointMeta>, String> {
    openagent_runtime::commands::get_checkpoint_metas(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn get_renderable_checkpoints(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<RenderableCheckpoint>, String> {
    runtime.facade().renderable_checkpoints(conv_id).await
}

#[tauri::command]
pub(crate) async fn rollback_to_checkpoint(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::rollback_to_checkpoint(runtime.state(), conv_id, checkpoint_id)
        .await
}

#[tauri::command]
pub(crate) async fn restore_agent_history(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    checkpoint_id: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::restore_agent_history(runtime.state(), conv_id, checkpoint_id)
        .await
}

#[tauri::command]
pub(crate) async fn get_file_changes(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<FileChange>, String> {
    openagent_runtime::commands::get_file_changes(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn revert_file_change(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    change_id: String,
) -> Result<String, String> {
    openagent_runtime::commands::revert_file_change(runtime.state(), change_id).await
}

#[tauri::command]
pub(crate) async fn revert_file_change_keep(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    change_id: String,
) -> Result<String, String> {
    openagent_runtime::commands::revert_file_change_keep(runtime.state(), change_id).await
}

#[tauri::command]
pub(crate) async fn apply_file_change_forward(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    change_id: String,
) -> Result<String, String> {
    openagent_runtime::commands::apply_file_change_forward(runtime.state(), change_id).await
}

#[tauri::command]
pub(crate) async fn set_conversation_ui_props(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    branch_id: String,
    message_id: String,
    props: serde_json::Value,
) -> Result<serde_json::Value, String> {
    openagent_runtime::commands::set_conversation_ui_props(
        &runtime, conv_id, branch_id, message_id, props,
    )
    .await
}
