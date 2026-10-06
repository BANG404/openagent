// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;
use tauri::Manager;

#[tauri::command]
pub(crate) async fn read_workspace_text_snippet(
    path: String,
    start_line: usize,
    end_line: usize,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<WorkspaceTextSnippet, String> {
    openagent_runtime::commands::read_workspace_text_snippet(
        path,
        start_line,
        end_line,
        runtime.state(),
    )
    .await
}

#[tauri::command]
pub(crate) async fn resolve_workspace_media_source(
    path: String,
    kind: String,
    app_handle: tauri::AppHandle,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<WorkspaceMediaSource, String> {
    let source =
        openagent_runtime::commands::resolve_workspace_media_source(path, kind, runtime.state())
            .await?;
    app_handle
        .asset_protocol_scope()
        .allow_file(&source.path)
        .map_err(|error| format!("Failed to authorize media preview: {error}"))?;
    Ok(source)
}
#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn get_startup_bootstrap(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<StartupBootstrap, String> {
    openagent_runtime::commands::get_startup_bootstrap(runtime.inner().clone()).await
}

#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn set_workspace(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    path: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::set_workspace(runtime.inner().clone(), path).await
}

#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn get_workspace_context(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<WorkspaceContext, String> {
    openagent_runtime::commands::get_workspace_context(runtime.state()).await
}

#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) fn get_workspace_launch_context() -> WorkspaceLaunchContext {
    openagent_runtime::commands::get_workspace_launch_context()
}

#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn submit_quick_chat(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
    text: String,
    attachments: Option<Vec<String>>,
    model_binding: Option<ChatModelBinding>,
    role_id: Option<String>,
) -> Result<String, String> {
    openagent_runtime::commands::submit_quick_chat(
        runtime.inner().clone(),
        QuickChatSubmission {
            workspace,
            text,
            attachments: attachments.unwrap_or_default(),
            model_binding,
            role_id,
        },
    )
    .await
}

#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn get_conversation_workspace(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<String>, String> {
    openagent_runtime::commands::get_conversation_workspace(runtime.state(), conv_id).await
}
