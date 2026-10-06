// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;

#[tauri::command]
pub(crate) async fn list_project_drafts(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<Vec<DraftCategoryEntry>, String> {
    openagent_runtime::commands::list_project_drafts(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
pub(crate) async fn ensure_project_drafts_dir(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_runtime::commands::ensure_project_drafts_dir(runtime.inner(), runtime.state(), scope)
        .await
}

#[tauri::command]
pub(crate) async fn get_project_draft(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    path: String,
) -> Result<String, String> {
    openagent_runtime::commands::get_project_draft(runtime.inner(), runtime.state(), scope, path)
        .await
}

#[tauri::command]
pub(crate) async fn save_project_draft(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    category: String,
    name: String,
    content: String,
) -> Result<DraftFileEntry, String> {
    openagent_runtime::commands::save_project_draft(
        runtime.inner(),
        runtime.state(),
        scope,
        category,
        name,
        content,
    )
    .await
}

#[tauri::command]
pub(crate) async fn delete_project_draft(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    path: String,
) -> Result<(), String> {
    openagent_runtime::commands::delete_project_draft(runtime.inner(), runtime.state(), scope, path)
        .await
}

#[tauri::command]
pub(crate) async fn get_design_document(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_runtime::commands::get_design_document(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
pub(crate) async fn save_design_document(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    content: String,
) -> Result<(), String> {
    openagent_runtime::commands::save_design_document(
        runtime.inner(),
        runtime.state(),
        scope,
        content,
    )
    .await
}

#[tauri::command]
pub(crate) async fn save_pasted_attachment(
    name: String,
    content_base64: String,
) -> Result<String, String> {
    openagent_runtime::commands::save_pasted_attachment(name, content_base64).await
}

#[tauri::command]
pub(crate) async fn materialize_attachment_blob(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    blob_id: String,
    name: String,
) -> Result<String, String> {
    openagent_runtime::commands::materialize_attachment_blob(runtime.state(), blob_id, name).await
}

#[tauri::command]
pub(crate) async fn repair_attachment_blob(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    blob_id: String,
    name: String,
    path: String,
) -> Result<(), String> {
    openagent_runtime::commands::repair_attachment_blob(runtime.state(), blob_id, name, path).await
}

#[tauri::command]
pub(crate) async fn repair_attachment_blob_content(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    blob_id: String,
    name: String,
    content_base64: String,
) -> Result<(), String> {
    openagent_runtime::commands::repair_attachment_blob_content(
        runtime.state(),
        blob_id,
        name,
        content_base64,
    )
    .await
}

#[tauri::command]
pub(crate) async fn read_attachment_preview(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    locator: String,
    name: String,
) -> Result<AttachmentPreview, String> {
    openagent_runtime::commands::read_attachment_preview(runtime.state(), locator, name).await
}
