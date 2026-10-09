export const CAPTURE_EVENTS = new Set([
  "chat.run_started",
  "chat.response_started",
  "chat.model_usage",
  "chat.memory_retrieval",
  "chat.chunk",
  "chat.thinking_chunk",
  "chat.tool_call",
  "chat.tool_result",
  "chat.checkpoint",
  "chat.done",
  "chat.cancelled",
]);
export const CAPTURE_OPERATIONS = new Set([
  "get_renderable_checkpoints",
  "get_active_branch_tip",
  "get_branches",
  "restore_agent_history",
]);

/** Explicitly outside the transcript projection, never reissued by its target. */
export const TRANSCRIPT_AFFORDANCES = new Set([
  "get_chat_task_usages",
  "get_conversation_meta",
  "get_file_changes",
  "set_chat_queue_pending",
  "cancel_chat_message",
]);
