// Generated from openagent-protocol. Run bun run generate:protocol; do not edit.
export const OPENAGENT_PROTOCOL_VERSION = 3;
export const PLUGIN_PROTOCOL_VERSION = 1;
export type AgentCommand = "compact";
export type AgentInputRequest = {
  convId: string;
  text: string;
  parentCheckpointId?: string | null;
  branchId?: string | null;
  attachments?: Array<string>;
  contexts?: Array<UserMessageContext>;
  modelBinding?: ChatModelBinding | null;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
};
export type ChatRunStartedEvent = {
  conv_id: string;
  message: string;
  msg_id: string;
  asst_msg_id: string;
  workspace: string;
  title: string;
  created_at: number;
  updated_at: number;
  pinned: boolean;
  parent_conv_id?: string | null;
  compacted_from_conv_id?: string | null;
  flow_kind?: string | null;
  flow_status?: string | null;
  role_id?: string | null;
  source: string;
  is_new: boolean;
  user_visible: boolean;
};
export type ChatModelUsageEvent<Usage> = { conv_id: string; turn: number; usage: Usage };
export type ChatMemoryRetrievalStage =
  "query_rewrite" | "embedding" | "searching" | "completed" | "skipped";
export type ContextCompactionStage =
  "checking" | "summarizing" | "creating" | "done" | "skipped" | "failed";
export type OpenAgentWireEvent<Message, Usage, Change, Invocation, Image, Install, State> =
  | { name: "chat.input_consumed"; payload: { conv_id: string; run_id: string; message: Message } }
  | { name: "chat.input_queue_changed"; payload: { conv_id: string } }
  | { name: "plugin.install_progress"; payload: Install }
  | { name: "conversation.state"; payload: State }
  | { name: "chat.run_started"; payload: ChatRunStartedEvent }
  | { name: "chat.response_started"; payload: { conv_id: string } }
  | { name: "chat.model_usage"; payload: ChatModelUsageEvent<Usage> }
  | { name: "chat.memory_retrieval"; payload: { conv_id: string; stage: ChatMemoryRetrievalStage } }
  | { name: "chat.chunk"; payload: { conv_id: string; text: string } }
  | { name: "chat.thinking_chunk"; payload: { conv_id: string; text: string } }
  | {
      name: "chat.tool_call";
      payload: {
        conv_id: string;
        name: string;
        args: unknown;
        tool_use_id?: string | null;
        mcp_ui?: Invocation | null;
      };
    }
  | {
      name: "chat.tool_result";
      payload: {
        conv_id: string;
        result: string;
        tool_use_id?: string | null;
        mcp_ui?: Invocation | null;
        image_attachments?: Array<Image> | null;
      };
    }
  | {
      name: "chat.file_change";
      payload: { conv_id: string; change: Change; branch_id?: string | null };
    }
  | {
      name: "chat.checkpoint";
      payload: { conv_id: string; checkpoint_id: string; branch_id?: string | null };
    }
  | {
      name: "chat.retry";
      payload: {
        conv_id: string;
        attempt: number;
        max_attempts: number;
        model?: string | null;
        error?: string | null;
        restored_checkpoint?: boolean | null;
      };
    }
  | {
      name: "chat.compaction_progress";
      payload: { conv_id: string; stage: ContextCompactionStage; error?: string | null };
    }
  | {
      name: "chat.done";
      payload: {
        conv_id: string;
        asst_msg_id?: string | null;
        turn_id?: string | null;
        error?: string | null;
      };
    }
  | {
      name: "chat.follow_up_suggestions";
      payload: { conv_id: string; asst_msg_id: string; suggestions: Array<string> };
    }
  | {
      name: "conversation.new_suggestions";
      payload: { workspace: string; language: SuggestionLanguage; suggestions: Array<string> };
    }
  | {
      name: "chat.interrupted";
      payload: {
        conv_id: string;
        request_id: string;
        asst_msg_id?: string | null;
        turn_id?: string | null;
      };
    }
  | {
      name: "chat.cancelled";
      payload: { conv_id: string; asst_msg_id?: string | null; turn_id?: string | null };
    };
export type SuggestionLanguage = "zh" | "en";
export type ChatModelBinding = { providerId: string; model: string };
export type ClientAction =
  | "new_conversation"
  | "open_model_settings"
  | "open_drafts"
  | "open_memory"
  | "open_skills"
  | "open_settings";
export type CommandArgument = "none" | "required_text" | "optional_text";
export type CommandOwner = "runtime" | "client";
export type CommandSpec = {
  plugin_i18n?: PluginI18n | null;
  name: string;
  owner: CommandOwner;
  argument: CommandArgument;
  label_key: string;
  description_key: string;
  plugin_id?: string | null;
  /**
   * Literal labels supplied by portable plugins. Builtin commands keep
   * using localized translation keys for compatibility.
   */
  label?: string | null;
  description?: string | null;
};
export type CreateConversationRequest = {
  id: string;
  title: string;
  workspace: string;
  parentConvId?: string | null;
  roleId?: string | null;
};
export type EmbeddingResourceProgress = {
  downloaded_bytes: number;
  total_bytes: number;
  current_file: string;
};
export type EmbeddingResourceState = "ready" | "missing" | "corrupt";
export type EmbeddingResourceStatus = {
  state: EmbeddingResourceState;
  model_id: string;
  version: string;
  total_bytes: number;
};
export type InputDelivery = "next_turn" | "steer";
export type InputError = { code: InputErrorCode; command: string | null; message: string };
export type InputErrorCode = "empty_input" | "missing_argument" | "unexpected_argument";
export type InputQueueAction =
  | {
      type: "add";
      input: AgentInputRequest;
      delivery: InputDelivery;
      expectedRunId?: string | null;
    }
  | { type: "update"; id: string; input: AgentInputRequest; expectedRevision: number }
  | { type: "delete"; id: string }
  | { type: "clear" }
  | { type: "reorder"; ids: Array<string>; expectedRevision: number }
  | { type: "set_paused"; paused: boolean }
  | { type: "retry"; id: string };
export type InputQueueRequest = { convId: string; action: InputQueueAction };
export type InputQueueSnapshot = {
  convId: string;
  revision: number;
  paused: boolean;
  activeRunId: string | null;
  items: Array<QueuedInput>;
};
export type PluginEmbeddingRequest = { texts: Array<string> };
export type PluginEmbeddingResponse = {
  version: number;
  model_id: string;
  model_version: string;
  dimensions: number;
  vectors: Array<Array<number>>;
};
export type PluginEmbeddingStatus = {
  version: number;
  supported: boolean;
  ready: boolean;
  model_id: string;
  model_version: string;
  dimensions: number;
  max_texts: number;
  max_text_bytes: number;
  max_total_bytes: number;
};
export type PluginI18n = {
  supported_locales: Array<string>;
  default_locale: string;
  translations: { [key in string]: { [key in string]: string } };
};
export type QueuedInput = {
  id: string;
  input: AgentInputRequest;
  delivery: InputDelivery;
  status: QueuedInputStatus;
  runId: string | null;
  error: string | null;
};
export type QueuedInputStatus =
  "queued" | "starting" | "running" | "completed" | "failed" | "cancelled";
export type RuntimeTransportStatus = "starting" | "ready" | "unavailable";
export type ResolvedInput =
  | { type: "chat"; text: string }
  | { type: "agent_command"; command: AgentCommand; argument: string; original_text: string }
  | { type: "client_action"; action: ClientAction; original_text: string };
export type ResumeInterruptRequest = {
  convId: string;
  interruptId: string;
  response: string;
  branchId?: string | null;
  assistantMessageId: string;
  modelBinding?: ChatModelBinding | null;
};
export type SubmissionOutcome =
  | { type: "run_accepted" }
  | { type: "run_completed" }
  | { type: "immediate_command"; command: AgentCommand; changed: boolean };
export type SubmitInterruptResponseRequest = {
  convId: string;
  interruptId: string;
  response: string;
};
export type UserMessageContext = { type: "quote"; text: string; sourceMessageId?: string | null };
