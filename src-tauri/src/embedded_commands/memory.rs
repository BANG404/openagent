// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;

#[tauri::command]
pub(crate) async fn get_agent_memories(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    query: Option<String>,
) -> Result<Vec<AgentMemoryEntry>, String> {
    openagent_runtime::commands::get_agent_memories(runtime.state(), scope, query).await
}

#[tauri::command]
pub(crate) async fn delete_agent_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_runtime::commands::delete_agent_memory(runtime.state(), id).await
}

#[tauri::command]
pub(crate) async fn trigger_memory_agent(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::trigger_memory_agent(runtime.inner(), runtime.state(), conv_id)
        .await
}

#[tauri::command]
pub(crate) async fn get_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_runtime::commands::get_memory(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
pub(crate) async fn save_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    content: String,
) -> Result<(), String> {
    openagent_runtime::commands::save_memory(runtime.inner(), runtime.state(), scope, content).await
}

#[tauri::command]
pub(crate) async fn export_memory_backup(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_runtime::commands::export_memory_backup(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
pub(crate) async fn import_memory_backup(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    content: String,
    replace: bool,
) -> Result<MemoryImportResult, String> {
    openagent_runtime::commands::import_memory_backup(
        runtime.inner(),
        runtime.state(),
        scope,
        content,
        replace,
    )
    .await
}

#[tauri::command]
pub(crate) async fn clear_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<(), String> {
    openagent_runtime::commands::clear_memory(runtime.inner(), runtime.state(), scope).await
}
