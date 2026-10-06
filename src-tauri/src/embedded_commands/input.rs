// Flat parameters preserve the typed diagnostic IPC contract.
#![allow(clippy::too_many_arguments)]
use super::*;

#[tauri::command]
pub(crate) async fn submit_agent_input(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    text: String,
    parent_checkpoint_id: Option<String>,
    branch_id: Option<String>,
    attachments: Option<Vec<String>>,
    contexts: Option<Vec<UserMessageContext>>,
    model_binding: Option<ChatModelBinding>,
    user_message_id: Option<String>,
    assistant_message_id: Option<String>,
) -> Result<SubmissionOutcome, String> {
    runtime
        .inner()
        .facade()
        .submit_agent_input(AgentInputRequest {
            conv_id,
            text,
            parent_checkpoint_id,
            branch_id,
            attachments: attachments.unwrap_or_default(),
            contexts: contexts.unwrap_or_default(),
            model_binding,
            user_message_id,
            assistant_message_id,
        })
        .await
}

#[tauri::command]
pub(crate) async fn get_agent_commands(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<CommandSpec>, String> {
    Ok(agent_commands_for_state(runtime.state()).await)
}

#[tauri::command]
pub(crate) fn resolve_agent_input(text: String) -> Result<ResolvedInput, InputError> {
    resolve_agent_input_text(text)
}

#[tauri::command]
pub(crate) async fn debug_create_context_compaction_diagnostic(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<String, String> {
    create_context_compaction_diagnostic(runtime.inner().clone(), runtime.state()).await
}

#[tauri::command]
pub(crate) async fn resume_interrupted_chat(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    interrupt_id: String,
    response: String,
    branch_id: Option<String>,
    assistant_message_id: String,
    model_binding: Option<ChatModelBinding>,
) -> Result<(), String> {
    runtime
        .inner()
        .facade()
        .resume_interrupt(ResumeInterruptRequest {
            conv_id,
            interrupt_id,
            response,
            branch_id,
            assistant_message_id,
            model_binding,
        })
        .await
}

#[tauri::command]
pub(crate) async fn submit_interrupt_response(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    interrupt_id: String,
    response: String,
) -> Result<(), String> {
    runtime
        .inner()
        .facade()
        .submit_interrupt_response(SubmitInterruptResponseRequest {
            conv_id,
            interrupt_id,
            response,
        })
        .await
}
