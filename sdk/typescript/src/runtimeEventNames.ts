import type { OpenAgentEvent } from "./transport.js";

export const runtimeEventNames = {
  "chat.input_consumed": "chat-input-consumed",
  "chat.input_queue_changed": "chat-input-queue-changed",
  "plugin.install_progress": "agent-plugin-install-progress",
  "chat.run_started": "chat-run-started",
  "chat.response_started": "chat-response-started",
  "chat.model_usage": "chat-model-usage",
  "chat.memory_retrieval": "chat-memory-retrieval",
  "chat.chunk": "chat-chunk",
  "chat.thinking_chunk": "chat-thinking-chunk",
  "chat.tool_call": "chat-tool-call",
  "chat.tool_result": "chat-tool-result",
  "chat.file_change": "chat-file-change",
  "chat.checkpoint": "chat-checkpoint",
  "chat.retry": "chat-retry",
  "chat.compaction_progress": "context-compaction-progress",
  "chat.done": "chat-done",
  "chat.follow_up_suggestions": "chat-follow-up-suggestions",
  "conversation.new_suggestions": "new-conversation-suggestions-updated",
  "chat.interrupted": "chat-interrupted",
  "chat.cancelled": "chat-cancelled",
} as const satisfies Partial<Record<OpenAgentEvent, string>>;
