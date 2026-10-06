// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;

#[tauri::command]
pub(crate) async fn list_workspace_files(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    query: Option<String>,
) -> Result<Vec<String>, String> {
    openagent_runtime::commands::list_workspace_files(runtime.state(), query).await
}

#[tauri::command]
pub(crate) async fn clear_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::clear_conversation(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn cancel_chat_message(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    runtime.facade().cancel_conversation(conv_id).await
}

#[tauri::command]
pub(crate) async fn set_chat_stream_paused(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    paused: bool,
) -> Result<(), String> {
    runtime
        .facade()
        .set_conversation_stream_paused(conv_id, paused)
        .await
}

#[tauri::command]
pub(crate) async fn skip_memory_retrieval(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::skip_memory_retrieval(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn set_chat_queue_pending(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    pending: bool,
) -> Result<(), String> {
    openagent_runtime::commands::set_chat_queue_pending(runtime.state(), conv_id, pending).await
}

#[tauri::command]
pub(crate) async fn debug_disconnect_model_requests(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<String>, String> {
    openagent_runtime::commands::debug_disconnect_model_requests(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn get_memory_status(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<bool, String> {
    openagent_runtime::commands::get_memory_status(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn trigger_flash_agent(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::trigger_flash_agent(runtime.state(), conv_id).await
}

#[tauri::command]
pub(crate) async fn get_flash_status(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<bool, String> {
    openagent_runtime::commands::get_flash_status(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn list_scheduled_chat_hooks(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<ScheduledChatHookDefinition>, String> {
    openagent_runtime::commands::list_scheduled_chat_hooks(runtime.state()).await
}

#[tauri::command]
pub(crate) async fn cancel_scheduled_chat_hook(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_runtime::commands::cancel_scheduled_chat_hook(runtime.state(), id).await
}

#[tauri::command]
pub(crate) async fn schedule_chat_hook(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    args: ScheduleChatHookArgs,
) -> Result<String, String> {
    openagent_runtime::commands::schedule_chat_hook(runtime.state(), args).await
}

#[tauri::command]
pub(crate) async fn update_scheduled_chat_hook(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
    args: ScheduleChatHookArgs,
) -> Result<String, String> {
    openagent_runtime::commands::update_scheduled_chat_hook(runtime.state(), id, args).await
}
