use openagent_app::checkpoint::{
    BranchMeta, CheckpointMeta, ConvPatch, ConversationMeta, FileChange, RenderableCheckpoint,
    TaskTrace,
};
use openagent_app::commands::*;
use openagent_app::config::{Config, DefaultModelBinding, McpServerConfig, RecentWorkspace};
use openagent_app::conversation_memory::{
    AgentMemoryEntry, AgentRole, ConversationPage, ConversationPageCursor,
};
use openagent_app::skills::SkillMetadata;
use openagent_app::state::{
    AppState, OpenAgentRuntime, RuntimeAsset, RuntimeHost, ScheduledChatHookDefinition,
};
use openagent_app::tools::ScheduleChatHookArgs;
use openagent_app::{
    bootstrap_runtime, html_preview_protocol, mcp, tools, tracing_setup, AgentInputRequest,
    ChatModelBinding, CommandSpec, InputError, ResolvedInput, ResumeInterruptRequest,
    RuntimeBootstrap, SubmissionOutcome, SubmitInterruptResponseRequest,
};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};

// Keep the flat arguments aligned with the existing typed Tauri command contract.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn submit_agent_input(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    text: String,
    parent_checkpoint_id: Option<String>,
    branch_id: Option<String>,
    attachments: Option<Vec<String>>,
    model_binding: Option<ChatModelBinding>,
    user_message_id: Option<String>,
    assistant_message_id: Option<String>,
) -> Result<SubmissionOutcome, String> {
    OpenAgentFacade::new(runtime.inner().clone())
        .submit_agent_input(AgentInputRequest {
            conv_id,
            text,
            parent_checkpoint_id,
            branch_id,
            attachments: attachments.unwrap_or_default(),
            model_binding,
            user_message_id,
            assistant_message_id,
        })
        .await
}

#[tauri::command]
fn get_agent_commands() -> Vec<CommandSpec> {
    agent_commands()
}

#[tauri::command]
fn resolve_agent_input(text: String) -> Result<ResolvedInput, InputError> {
    resolve_agent_input_text(text)
}

#[tauri::command]
async fn debug_create_context_compaction_diagnostic(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<String, String> {
    create_context_compaction_diagnostic(runtime.inner().clone(), runtime.state()).await
}

#[tauri::command]
async fn resume_interrupted_chat(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    interrupt_id: String,
    response: String,
    branch_id: Option<String>,
    assistant_message_id: String,
) -> Result<(), String> {
    OpenAgentFacade::new(runtime.inner().clone())
        .resume_interrupt(ResumeInterruptRequest {
            conv_id,
            interrupt_id,
            response,
            branch_id,
            assistant_message_id,
        })
        .await
}

#[tauri::command]
async fn submit_interrupt_response(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    interrupt_id: String,
    response: String,
) -> Result<(), String> {
    OpenAgentFacade::new(runtime.inner().clone())
        .submit_interrupt_response(SubmitInterruptResponseRequest {
            interrupt_id,
            response,
        })
        .await
}

#[tauri::command]
async fn list_agent_roles(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<Vec<AgentRole>, String> {
    openagent_app::commands::list_agent_roles(runtime.state(), scope).await
}

#[tauri::command]
async fn save_agent_role(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: Option<String>,
    scope: String,
    name: String,
    description: String,
) -> Result<AgentRole, String> {
    openagent_app::commands::save_agent_role(runtime.state(), id, scope, name, description).await
}

#[tauri::command]
async fn delete_agent_role(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_app::commands::delete_agent_role(runtime.state(), id).await
}

#[tauri::command]
async fn get_settings(runtime: State<'_, Arc<OpenAgentRuntime>>) -> Result<Config, String> {
    openagent_app::commands::get_settings(runtime.state()).await
}

#[tauri::command]
async fn save_settings(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    config: Config,
) -> Result<(), String> {
    openagent_app::commands::save_settings(runtime.state(), config).await
}

#[tauri::command]
async fn set_default_chat_model(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    binding: DefaultModelBinding,
) -> Result<DefaultModelBinding, String> {
    openagent_app::commands::set_default_chat_model(runtime.state(), binding).await
}

#[tauri::command]
async fn save_workspace_prefs(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
    recent_workspaces: Vec<RecentWorkspace>,
) -> Result<(), String> {
    openagent_app::commands::save_workspace_prefs(runtime.state(), workspace, recent_workspaces)
        .await
}

#[tauri::command]
async fn set_active_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: Option<String>,
    workspace: String,
) -> Result<(), String> {
    openagent_app::commands::set_active_conversation(runtime.state(), conv_id, workspace).await
}

#[tauri::command]
async fn get_active_conv_id(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
) -> Result<Option<String>, String> {
    openagent_app::commands::get_active_conv_id(runtime.state(), workspace).await
}

#[tauri::command]
async fn test_provider_connection(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    request: ProviderProbeRequest,
) -> Result<ProviderProbeResult, String> {
    openagent_app::commands::test_provider_connection(runtime.inner(), request).await
}

#[tauri::command]
async fn fetch_provider_models(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    request: ProviderProbeRequest,
) -> Result<Vec<String>, String> {
    openagent_app::commands::fetch_provider_models(runtime.inner(), request).await
}

#[tauri::command]
async fn refresh_mcp_servers(runtime: State<'_, Arc<OpenAgentRuntime>>) -> Result<(), String> {
    openagent_app::commands::refresh_mcp_servers(runtime.state()).await
}

#[tauri::command]
async fn inspector_database_overview(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<InspectorDatabaseOverview, String> {
    openagent_app::commands::inspector_database_overview(runtime.state()).await
}

#[tauri::command]
async fn inspector_table_data(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    table_name: String,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<InspectorTableData, String> {
    openagent_app::commands::inspector_table_data(
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

#[tauri::command]
async fn get_conversations(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: Option<String>,
) -> Result<Vec<ConversationMeta>, String> {
    openagent_app::commands::get_conversations(runtime.state(), workspace).await
}

#[tauri::command]
async fn get_conversation_page(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: Option<String>,
    cursor: Option<ConversationPageCursor>,
    limit: usize,
    search_query: Option<String>,
    filter_by_role: Option<bool>,
    role_id: Option<String>,
) -> Result<ConversationPage, String> {
    openagent_app::commands::get_conversation_page(
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
async fn get_conversation_meta(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<ConversationMeta>, String> {
    openagent_app::commands::get_conversation_meta(runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_child_conversations(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    parent_conv_id: String,
    workspace: Option<String>,
) -> Result<Vec<ConversationMeta>, String> {
    openagent_app::commands::get_child_conversations(runtime.state(), parent_conv_id, workspace)
        .await
}

#[tauri::command]
async fn create_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
    title: String,
    workspace: String,
    parent_conv_id: Option<String>,
    role_id: Option<String>,
) -> Result<(), String> {
    openagent_app::commands::create_conversation(
        runtime.state(),
        id,
        title,
        workspace,
        parent_conv_id,
        role_id,
    )
    .await
}

#[tauri::command]
async fn update_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    patch: ConvPatch,
) -> Result<(), String> {
    openagent_app::commands::update_conversation(runtime.state(), conv_id, patch).await
}

#[tauri::command]
async fn create_branch(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
    conv_id: String,
    parent_branch_id: Option<String>,
    forked_from_checkpoint_id: Option<String>,
    forked_from_message_id: Option<String>,
) -> Result<(), String> {
    openagent_app::commands::create_branch(
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
async fn get_branches(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<BranchMeta>, String> {
    openagent_app::commands::get_branches(runtime.state(), conv_id).await
}

#[tauri::command]
async fn set_branch_head(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    branch_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    openagent_app::commands::set_branch_head(runtime.state(), branch_id, checkpoint_id).await
}

#[tauri::command]
async fn set_active_branch_tip(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    openagent_app::commands::set_active_branch_tip(runtime.state(), conv_id, checkpoint_id).await
}

#[tauri::command]
async fn get_active_branch_tip(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<String>, String> {
    openagent_app::commands::get_active_branch_tip(runtime.state(), conv_id).await
}

#[tauri::command]
async fn delete_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    openagent_app::commands::delete_conversation(runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_task_traces(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<TaskTrace>, String> {
    openagent_app::commands::get_task_traces(runtime.state()).await
}

#[tauri::command]
async fn get_latest_checkpoint(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<CheckpointMeta>, String> {
    openagent_app::commands::get_latest_checkpoint(runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_checkpoint_metas(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<CheckpointMeta>, String> {
    openagent_app::commands::get_checkpoint_metas(runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_renderable_checkpoints(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<RenderableCheckpoint>, String> {
    openagent_app::commands::get_renderable_checkpoints(runtime.state(), conv_id).await
}

#[tauri::command]
async fn rollback_to_checkpoint(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    openagent_app::commands::rollback_to_checkpoint(runtime.state(), conv_id, checkpoint_id).await
}

#[tauri::command]
async fn restore_agent_history(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    checkpoint_id: Option<String>,
) -> Result<(), String> {
    openagent_app::commands::restore_agent_history(runtime.state(), conv_id, checkpoint_id).await
}

#[tauri::command]
async fn get_file_changes(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<FileChange>, String> {
    openagent_app::commands::get_file_changes(runtime.state(), conv_id).await
}

#[tauri::command]
async fn revert_file_change(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    change_id: String,
) -> Result<String, String> {
    openagent_app::commands::revert_file_change(runtime.state(), change_id).await
}

#[tauri::command]
async fn revert_file_change_keep(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    change_id: String,
) -> Result<String, String> {
    openagent_app::commands::revert_file_change_keep(runtime.state(), change_id).await
}

#[tauri::command]
async fn apply_file_change_forward(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    change_id: String,
) -> Result<String, String> {
    openagent_app::commands::apply_file_change_forward(runtime.state(), change_id).await
}

#[tauri::command]
async fn list_skills(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<SkillMetadata>, String> {
    openagent_app::commands::list_skills(runtime.state()).await
}

#[tauri::command]
async fn get_skill_content(path: String) -> Result<String, String> {
    openagent_app::commands::get_skill_content(path).await
}

#[tauri::command]
async fn save_skill_content(path: String, content: String) -> Result<(), String> {
    openagent_app::commands::save_skill_content(path, content).await
}

#[tauri::command]
async fn create_skill(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    name: String,
    description: String,
) -> Result<SkillMetadata, String> {
    openagent_app::commands::create_skill(runtime.state(), scope, name, description).await
}

#[tauri::command]
async fn delete_skill(path: String) -> Result<(), String> {
    openagent_app::commands::delete_skill(path).await
}

#[tauri::command]
async fn get_skills_dir(
    scope: String,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<String, String> {
    openagent_app::commands::get_skills_dir(scope, runtime.state()).await
}

#[tauri::command]
async fn open_path(
    path: String,
    app_handle: tauri::AppHandle,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let resolved = openagent_app::commands::resolve_open_path(path, runtime.state()).await?;
    app_handle
        .opener()
        .open_path(resolved, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn read_html_preview_file(
    path: String,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<HtmlPreviewFile, String> {
    openagent_app::commands::read_html_preview_file(path, runtime.state()).await
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    openagent_app::commands::read_text_file(path).await
}

#[tauri::command]
async fn read_workspace_text_snippet(
    path: String,
    start_line: usize,
    end_line: usize,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<WorkspaceTextSnippet, String> {
    openagent_app::commands::read_workspace_text_snippet(
        path,
        start_line,
        end_line,
        runtime.state(),
    )
    .await
}

#[tauri::command]
async fn resolve_workspace_media_source(
    path: String,
    kind: String,
    app_handle: tauri::AppHandle,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<WorkspaceMediaSource, String> {
    let source =
        openagent_app::commands::resolve_workspace_media_source(path, kind, runtime.state())
            .await?;
    app_handle
        .asset_protocol_scope()
        .allow_file(&source.path)
        .map_err(|error| format!("Failed to authorize media preview: {error}"))?;
    Ok(source)
}

#[tauri::command]
async fn save_download_file(
    filename: String,
    content: String,
    encoding: Option<String>,
) -> Result<String, String> {
    openagent_app::commands::save_download_file(filename, content, encoding).await
}

#[tauri::command]
async fn get_mcp_servers(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<McpServerConfig>, String> {
    openagent_app::commands::get_mcp_servers(runtime.state()).await
}

#[tauri::command]
async fn save_mcp_servers(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    servers: Vec<McpServerConfig>,
) -> Result<(), String> {
    openagent_app::commands::save_mcp_servers(runtime.state(), servers).await
}

#[tauri::command]
async fn test_mcp_server(server: McpServerConfig) -> Result<mcp::McpProbeResult, String> {
    openagent_app::commands::test_mcp_server(server).await
}

#[tauri::command]
fn get_system_locale() -> String {
    openagent_app::commands::get_system_locale()
}

#[tauri::command]
async fn list_workspace_files(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    query: Option<String>,
) -> Result<Vec<String>, String> {
    openagent_app::commands::list_workspace_files(runtime.state(), query).await
}

#[tauri::command]
async fn clear_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    openagent_app::commands::clear_conversation(runtime.state(), conv_id).await
}

#[tauri::command]
async fn cancel_chat_message(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    openagent_app::commands::cancel_chat_message(runtime.state(), conv_id).await
}

#[tauri::command]
async fn set_chat_queue_pending(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    pending: bool,
) -> Result<(), String> {
    openagent_app::commands::set_chat_queue_pending(runtime.state(), conv_id, pending).await
}

#[tauri::command]
async fn debug_disconnect_model_requests(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<String>, String> {
    openagent_app::commands::debug_disconnect_model_requests(runtime.state()).await
}

#[tauri::command]
async fn get_memory_status(runtime: State<'_, Arc<OpenAgentRuntime>>) -> Result<bool, String> {
    openagent_app::commands::get_memory_status(runtime.state()).await
}

#[tauri::command]
async fn trigger_flash_agent(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: Option<String>,
) -> Result<(), String> {
    openagent_app::commands::trigger_flash_agent(runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_flash_status(runtime: State<'_, Arc<OpenAgentRuntime>>) -> Result<bool, String> {
    openagent_app::commands::get_flash_status(runtime.state()).await
}

#[tauri::command]
async fn list_scheduled_chat_hooks(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<ScheduledChatHookDefinition>, String> {
    openagent_app::commands::list_scheduled_chat_hooks(runtime.state()).await
}

#[tauri::command]
async fn cancel_scheduled_chat_hook(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_app::commands::cancel_scheduled_chat_hook(runtime.state(), id).await
}

#[tauri::command]
async fn schedule_chat_hook(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    args: ScheduleChatHookArgs,
) -> Result<String, String> {
    openagent_app::commands::schedule_chat_hook(runtime.state(), args).await
}

#[tauri::command]
async fn update_scheduled_chat_hook(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
    args: ScheduleChatHookArgs,
) -> Result<String, String> {
    openagent_app::commands::update_scheduled_chat_hook(runtime.state(), id, args).await
}

#[tauri::command]
async fn get_agent_memories(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    query: Option<String>,
) -> Result<Vec<AgentMemoryEntry>, String> {
    openagent_app::commands::get_agent_memories(runtime.state(), scope, query).await
}

#[tauri::command]
async fn delete_agent_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_app::commands::delete_agent_memory(runtime.state(), id).await
}

#[tauri::command]
async fn trigger_memory_agent(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: Option<String>,
) -> Result<(), String> {
    openagent_app::commands::trigger_memory_agent(runtime.inner(), runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_app::commands::get_memory(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn save_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    content: String,
) -> Result<(), String> {
    openagent_app::commands::save_memory(runtime.inner(), runtime.state(), scope, content).await
}

#[tauri::command]
async fn export_memory_backup(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_app::commands::export_memory_backup(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn import_memory_backup(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    content: String,
    replace: bool,
) -> Result<MemoryImportResult, String> {
    openagent_app::commands::import_memory_backup(
        runtime.inner(),
        runtime.state(),
        scope,
        content,
        replace,
    )
    .await
}

#[tauri::command]
async fn clear_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<(), String> {
    openagent_app::commands::clear_memory(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn list_project_drafts(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<Vec<DraftCategoryEntry>, String> {
    openagent_app::commands::list_project_drafts(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn ensure_project_drafts_dir(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_app::commands::ensure_project_drafts_dir(runtime.inner(), runtime.state(), scope)
        .await
}

#[tauri::command]
async fn get_project_draft(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    path: String,
) -> Result<String, String> {
    openagent_app::commands::get_project_draft(runtime.inner(), runtime.state(), scope, path).await
}

#[tauri::command]
async fn save_project_draft(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    category: String,
    name: String,
    content: String,
) -> Result<DraftFileEntry, String> {
    openagent_app::commands::save_project_draft(
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
async fn delete_project_draft(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    path: String,
) -> Result<(), String> {
    openagent_app::commands::delete_project_draft(runtime.inner(), runtime.state(), scope, path)
        .await
}

#[tauri::command]
async fn get_design_document(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_app::commands::get_design_document(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn save_design_document(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    content: String,
) -> Result<(), String> {
    openagent_app::commands::save_design_document(runtime.inner(), runtime.state(), scope, content)
        .await
}

#[tauri::command]
async fn save_pasted_attachment(name: String, content_base64: String) -> Result<String, String> {
    openagent_app::commands::save_pasted_attachment(name, content_base64).await
}

#[tauri::command]
async fn materialize_attachment_blob(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    blob_id: String,
    name: String,
) -> Result<String, String> {
    openagent_app::commands::materialize_attachment_blob(runtime.state(), blob_id, name).await
}

#[tauri::command]
async fn repair_attachment_blob(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    blob_id: String,
    name: String,
    path: String,
) -> Result<(), String> {
    openagent_app::commands::repair_attachment_blob(runtime.state(), blob_id, name, path).await
}

#[tauri::command]
async fn repair_attachment_blob_content(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    blob_id: String,
    name: String,
    content_base64: String,
) -> Result<(), String> {
    openagent_app::commands::repair_attachment_blob_content(
        runtime.state(),
        blob_id,
        name,
        content_base64,
    )
    .await
}

#[tauri::command]
async fn read_attachment_preview(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    locator: String,
    name: String,
) -> Result<AttachmentPreview, String> {
    openagent_app::commands::read_attachment_preview(runtime.state(), locator, name).await
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn reveal_main_window(
    app: tauri::AppHandle,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    runtime
        .state()
        .startup_window_revealed
        .store(true, std::sync::atomic::Ordering::Release);
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_remote_gateway_status() -> Result<RemoteGatewayStatus, String> {
    openagent_app::commands::get_remote_gateway_status().await
}

#[tauri::command]
async fn rotate_remote_gateway_pairing_code() -> Result<String, String> {
    openagent_app::commands::rotate_remote_gateway_pairing_code().await
}

#[tauri::command]
async fn list_wsl_distributions() -> Result<Vec<openagent_app::wsl::WslDistribution>, String> {
    openagent_app::commands::list_wsl_distributions().await
}

#[tauri::command]
async fn get_wsl_home(
    distribution: String,
) -> Result<openagent_app::wsl::WslWorkspaceTarget, String> {
    openagent_app::commands::get_wsl_home(distribution).await
}

#[tauri::command]
async fn resolve_wsl_workspace(
    distribution: String,
    linux_path: String,
) -> Result<openagent_app::wsl::WslWorkspaceTarget, String> {
    openagent_app::commands::resolve_wsl_workspace(distribution, linux_path).await
}

#[tauri::command]
async fn get_startup_bootstrap(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<StartupBootstrap, String> {
    openagent_app::commands::get_startup_bootstrap(runtime.inner().clone()).await
}

#[tauri::command]
async fn set_workspace(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    path: Option<String>,
) -> Result<(), String> {
    openagent_app::commands::set_workspace(runtime.inner().clone(), path).await
}

#[tauri::command]
async fn get_workspace_context(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<WorkspaceContext, String> {
    openagent_app::commands::get_workspace_context(runtime.state()).await
}

#[tauri::command]
fn get_workspace_launch_context() -> WorkspaceLaunchContext {
    openagent_app::commands::get_workspace_launch_context()
}

#[tauri::command]
async fn open_workspace_window(
    path: String,
    conversation_id: Option<String>,
    message_id: Option<String>,
) -> Result<(), String> {
    openagent_app::commands::open_workspace_window(path, conversation_id, message_id).await
}

#[tauri::command]
async fn get_conversation_workspace(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<String>, String> {
    openagent_app::commands::get_conversation_workspace(runtime.state(), conv_id).await
}

struct TauriRuntimeHost {
    app: tauri::AppHandle,
}

impl RuntimeHost for TauriRuntimeHost {
    fn translate(&self, key: &str, fallback: &str) -> String {
        use tauri_plugin_i18n::PluginI18nExt;

        self.app
            .i18n()
            .translate(key)
            .filter(|translated| *translated != key)
            .unwrap_or(fallback)
            .to_string()
    }

    fn open_path(&self, path: &std::path::Path) -> Result<(), String> {
        use tauri_plugin_opener::OpenerExt;

        self.app
            .opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|error| error.to_string())
    }

    fn activate_workspace_window(&self, context: serde_json::Value) -> Result<(), String> {
        let window = self
            .app
            .get_webview_window("main")
            .ok_or_else(|| "Main window is unavailable".to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        self.app
            .emit_to("main", "workspace-window-open-request", context)
            .map_err(|error| error.to_string())
    }

    fn frontend_asset(&self, path: &str) -> Option<RuntimeAsset> {
        self.app
            .asset_resolver()
            .get(path.to_string())
            .map(|asset| RuntimeAsset {
                bytes: asset.bytes,
                mime_type: asset.mime_type,
            })
    }
}

#[cfg(all(test, windows))]
unsafe extern "C" {
    fn openagent_link_windows_test_manifest();
}

#[cfg(all(test, windows))]
#[test]
fn windows_test_harness_uses_common_controls_v6() {
    unsafe { openagent_link_windows_test_manifest() };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    run_with_mode(false);
}

pub fn run_agent_server() {
    run_with_mode(true);
}

fn run_with_mode(agent_server: bool) {
    let startup_started_at = std::time::Instant::now();
    let is_workspace_window = is_workspace_window_process();
    let RuntimeBootstrap {
        initial_locale,
        runtime,
        state: app_state,
        html_preview_roots,
    } = bootstrap_runtime(agent_server);

    let protocol_roots = html_preview_roots;
    let builder = tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(
            html_preview_protocol::SCHEME,
            move |_context, request, responder| {
                let roots = protocol_roots.clone();
                tauri::async_runtime::spawn(async move {
                    responder.respond(html_preview_protocol::serve(request, roots).await);
                });
            },
        )
        .plugin(tauri_plugin_i18n::init(Some(initial_locale)));

    #[cfg(desktop)]
    let builder = if agent_server {
        builder
    } else {
        builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
    };

    #[cfg(desktop)]
    let builder = if agent_server {
        builder
    } else {
        builder.plugin(tauri_plugin_updater::Builder::new().build())
    };

    let mut context = tauri::generate_context!();
    if agent_server {
        context.config_mut().app.windows.clear();
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .manage(runtime)
        .setup(move |app| {
            // init_tracing() spawns a background Tokio task (batch exporter). The
            // .setup() callback runs on the main thread which is not a Tokio worker
            // thread, so we use block_on to enter the runtime context before calling it.
            tauri::async_runtime::block_on(async {
                tracing_setup::init_tracing();
            });
            tracing::info!(
                target: "openagent::startup",
                elapsed_ms = startup_started_at.elapsed().as_millis() as u64,
                "Tauri setup started"
            );

            // Keep diagnostics alongside the application without shipping an
            // inspector surface in release builds. The frontend route is also
            // guarded by import.meta.env.DEV.
            #[cfg(debug_assertions)]
            {
                if !is_workspace_window {
                    let runtime = app.state::<Arc<OpenAgentRuntime>>().inner().clone();
                    let result = tauri::async_runtime::block_on(async { start_dev_api(runtime) });
                    if let Err(error) = result {
                        tracing::warn!(%error, "OpenAgent dev API did not start");
                    }
                    if !agent_server {
                        tauri::WebviewWindowBuilder::new(
                            app,
                            "debug",
                            tauri::WebviewUrl::App("/?dev-inspector=1".into()),
                        )
                        .title("OpenAgent Dev Inspector")
                        .inner_size(980.0, 760.0)
                        .min_inner_size(720.0, 520.0)
                        .build()?;
                    }
                }
            }

            // Publish the AppHandle to anything that needs to emit events to the
            // frontend from outside a command (e.g. AskUserTool).
            let state = app.state::<AppState>();
            let runtime = app.state::<Arc<OpenAgentRuntime>>();
            let _ = runtime.set_host(Arc::new(TauriRuntimeHost {
                app: app.handle().clone(),
            }));
            let mut runtime_events = state.event_bus.subscribe();
            let event_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    match runtime_events.recv().await {
                        Ok(event) => {
                            if let Err(error) = event_app.emit(&event.name, event.payload) {
                                tracing::warn!(
                                    event = %event.name,
                                    %error,
                                    "failed to project runtime event to Tauri"
                                );
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                            tracing::warn!(
                                skipped,
                                "Tauri runtime-event adapter lagged behind"
                            );
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            });
            if !is_workspace_window {
                let gateway_runtime = runtime.inner().clone();
                let result = tauri::async_runtime::block_on(async {
                    start_remote_gateway(gateway_runtime)
                });
                if let Err(error) = result {
                    tracing::warn!(%error, "OpenAgent remote gateway did not start");
                }
            }
            if !agent_server {
                let startup_window_revealed = state.startup_window_revealed.clone();
                let startup_app = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                    if !startup_window_revealed.load(std::sync::atomic::Ordering::Acquire) {
                        if let Some(window) = startup_app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                });
            }
            if !agent_server && !is_workspace_window {
                let restore_runtime = runtime.inner().clone();
                tauri::async_runtime::spawn(async move {
                    match tools::restore_scheduled_chat_hooks(restore_runtime).await {
                        Ok(count) if count > 0 => {
                            tracing::info!(target: "openagent::app", count, "restored scheduled chat hooks");
                        }
                        Ok(_) => {}
                        Err(e) => tracing::error!(target: "openagent::app", error = %e, "scheduled chat hook restoration failed"),
                    }
                });
            }
            // MCP transports may spawn subprocesses or establish network
            // connections. Keep all of that work off Tauri's main-thread setup
            // path so the webview can begin bootstrapping immediately.
            let startup_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = startup_app.state::<AppState>();
                let config = state.config.lock().await.clone();
                let tool_server = state.tool_server.lock().await.clone();
                let recall_tool_server = state.recall_tool_server.lock().await.clone();
                let mcp_handles = mcp::connect_mcp_servers(
                    &config.mcp.servers,
                    &[tool_server, recall_tool_server],
                );
                *state.mcp_join_handles.lock().await = mcp_handles;
                tracing::info!(
                    target: "openagent::startup",
                    elapsed_ms = startup_started_at.elapsed().as_millis() as u64,
                    "MCP connections scheduled"
                );
            });

            if !agent_server {
                // Initialize embedding model in the background so the app starts instantly.
                // The model (~100 MB) is cached in the system's HuggingFace cache dir after
                // first download. Hybrid memory search gracefully falls back to keyword +
                // time scoring while the model is loading.
                let em = app.state::<AppState>().embedding_model.clone();
                tauri::async_runtime::spawn(async move {
                    let result = tokio::task::spawn_blocking(|| {
                        use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
                        TextEmbedding::try_new(
                            InitOptions::new(EmbeddingModel::AllMiniLML6V2)
                                .with_show_download_progress(false),
                        )
                        .map(Arc::new)
                    })
                    .await;

                    match result {
                        Ok(Ok(model)) => {
                            *em.lock().await = Some(model);
                            tracing::info!(target: "openagent::app", "embedding model ready");
                        }
                        Ok(Err(e)) => tracing::error!(target: "openagent::app", error = %e, "embedding model initialization failed"),
                        Err(e) => tracing::error!(target: "openagent::app", error = %e, "embedding task failed"),
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            set_default_chat_model,
            test_provider_connection,
            fetch_provider_models,
            set_workspace,
            get_workspace_context,
            get_remote_gateway_status,
            rotate_remote_gateway_pairing_code,
            list_wsl_distributions,
            get_wsl_home,
            resolve_wsl_workspace,
            get_startup_bootstrap,
            get_workspace_launch_context,
            open_workspace_window,
            get_conversation_workspace,
            clear_conversation,
            submit_agent_input,
            get_agent_commands,
            resolve_agent_input,
            debug_create_context_compaction_diagnostic,
            resume_interrupted_chat,
            cancel_chat_message,
            set_chat_queue_pending,
            debug_disconnect_model_requests,
            inspector_database_overview,
            inspector_table_data,
            trigger_memory_agent,
            get_memory_status,
            trigger_flash_agent,
            get_flash_status,
            list_scheduled_chat_hooks,
            cancel_scheduled_chat_hook,
            schedule_chat_hook,
            update_scheduled_chat_hook,
            get_memory,
            save_memory,
            export_memory_backup,
            import_memory_backup,
            clear_memory,
            get_agent_memories,
            delete_agent_memory,
            list_agent_roles,
            save_agent_role,
            delete_agent_role,
            list_project_drafts,
            ensure_project_drafts_dir,
            get_project_draft,
            save_project_draft,
            delete_project_draft,
            get_design_document,
            save_design_document,
            get_system_locale,
            list_skills,
            get_skill_content,
            save_skill_content,
            create_skill,
            delete_skill,
            get_skills_dir,
            open_path,
            read_html_preview_file,
            read_text_file,
            read_workspace_text_snippet,
            resolve_workspace_media_source,
            save_download_file,
            get_mcp_servers,
            save_mcp_servers,
            test_mcp_server,
            refresh_mcp_servers,
            get_conversations,
            get_conversation_page,
            get_conversation_meta,
            get_child_conversations,
            create_conversation,
            update_conversation,
            create_branch,
            get_branches,
            set_branch_head,
            delete_conversation,
            get_task_traces,
            get_latest_checkpoint,
            get_checkpoint_metas,
            get_renderable_checkpoints,
            rollback_to_checkpoint,
            restore_agent_history,
            get_file_changes,
            revert_file_change,
            revert_file_change_keep,
            apply_file_change_forward,
            submit_interrupt_response,
            save_workspace_prefs,
            set_active_conversation,
            get_active_conv_id,
            set_active_branch_tip,
            get_active_branch_tip,
            list_workspace_files,
            save_pasted_attachment,
            materialize_attachment_blob,
            repair_attachment_blob,
            repair_attachment_blob_content,
            read_attachment_preview,
            restart_app,
            quit_app,
            reveal_main_window,
        ])
        .run(context)
        .expect("error while running tauri application");

    // Flush remaining spans before the process exits. Must be called here while
    // tauri::async_runtime (a global Tokio runtime) is still alive, because the
    // BatchSpanProcessor needs an async context to export the final HTTP batch.
    tracing_setup::shutdown_tracing();
}
