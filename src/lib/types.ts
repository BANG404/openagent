export interface ToolCallRecord {
  name: string;
  args: string;
  result?: string;
}

export interface ChatAttachment {
  path: string;
  name: string;
  kind: "image" | "document";
  mimeType?: string;
  /** Browser-local preview used before an uploaded attachment becomes durable. */
  previewUrl?: string;
}

export interface ChatToolImage {
  src: string;
  mimeType: string;
}

export type UserMessageContext = {
  type: "quote";
  text: string;
  sourceMessageId?: string | null;
};

export type ContextCompactionStage =
  "checking" | "summarizing" | "creating" | "done" | "skipped" | "failed";

export type UserInputState = "pending" | "answered" | "cancelled" | "unanswered";

export type StreamItem =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | {
      type: "tool_call";
      name: string;
      args: string;
      result?: string;
      images?: ChatToolImage[];
      /** Provider tool-use id, retained so restored checkpoints can join results. */
      toolUseId?: string;
      approval?: {
        request: UserInputRequest;
        state: UserInputState;
        response?: unknown;
      };
    }
  /** Transient progress for an in-flight context compaction. */
  | { type: "compaction"; stage: ContextCompactionStage; error?: string | null }
  /** A completed compaction boundary retained in the transcript at its actual position. */
  | { type: "compaction_boundary" }
  | {
      type: "retry";
      /** Complete stream state from the failed attempt. */
      items: StreamItem[];
      attempt: number;
      maxAttempts: number;
      model?: string;
      error?: string | null;
    }
  | { type: "attachment"; attachment: ChatAttachment }
  | { type: "quote"; context: UserMessageContext }
  | {
      type: "runtime_notice";
      kind: "error" | "interrupted";
      reason: string;
    }
  | {
      type: "user_input";
      request: UserInputRequest;
      state: UserInputState;
      response?: unknown;
    };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: ToolCallRecord[];
  items?: StreamItem[];
  aborted?: boolean;
  checkpointId?: string;
  /** Client-side timings for a completed streamed response. */
  firstTokenAt?: number;
  completedAt?: number;
  /** UI-only lifecycle status retained until durable Turn metadata reconciles. */
  transientTurnStatus?: CheckpointTurnStatus;
  /** Durable logical-turn metadata reduced from checkpoints on the selected branch. */
  turn?: CheckpointTurnMetadata;
  /** Durable checkpoint semantics such as hidden flow prompts or compaction boundaries. */
  tags?: string[];
  /** OpenAgent metadata read from the provider-compatible checkpoint message. */
  agentTag?: AgentMessageTag;
}

export type AgentMessageTag =
  | "context_compaction"
  | "terminal_poll"
  | "goal_bootstrap"
  | "graph_bootstrap"
  | "goal_continuation"
  | "graph_continuation"
  | "graph_node_bootstrap"
  | "graph_node_continuation";

export type SerializableAgentMessage =
  | { role: "system"; content: string; tag?: AgentMessageTag }
  | {
      role: "user" | "assistant";
      content: Array<Record<string, unknown>>;
      id?: string | null;
      tag?: AgentMessageTag;
    };

export interface Conversation {
  id: string;
  title: string;
  /** Durable workspace owner, when the conversation came from metadata. */
  workspace?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  parentConvId?: string;
  compactedFromConvId?: string;
  flowKind?: string;
  flowStatus?: string;
  roleId?: string;
}

// ─── SQLite-backed types (checkpoint system) ──────────────────────────────────

export interface ConversationMeta {
  id: string;
  title: string;
  workspace: string;
  created_at: number;
  updated_at: number;
  pinned: boolean;
  is_last_active: boolean;
  parent_conv_id?: string;
  compacted_from_conv_id?: string;
  flow_kind?: string;
  flow_status?: string;
  role_id?: string;
}

export interface ConversationPageCursor {
  pinned: boolean;
  updated_at: number;
  id: string;
}

export interface ConversationPage {
  items: ConversationMeta[];
  next_cursor: ConversationPageCursor | null;
}

export interface BranchMeta {
  id: string;
  conv_id: string;
  parent_branch_id: string | null;
  forked_from_checkpoint_id: string | null;
  forked_from_message_id: string | null;
  head_checkpoint_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface StartupConversationBundle {
  checkpoints: RenderableCheckpoint[];
  active_branch_tip: string | null;
  branches: BranchMeta[];
  file_changes: FileChange[];
}

export interface StartupBootstrap {
  config: AppConfig;
  workspace_path: string;
  workspace: WorkspaceContext;
  launch_context: {
    workspace: string | null;
    conversation_id: string | null;
    message_id: string | null;
    new_conversation: boolean;
  };
  conversations: ConversationMeta[];
  conversation_next_cursor: ConversationPageCursor | null;
  active_conv_id: string | null;
  active_conversation: StartupConversationBundle | null;
  new_conversation_suggestions: string[];
}

export interface RecentWorkspace {
  path: string;
  name: string;
}

export interface ConvPatch {
  title?: string;
  title_source?: "fallback" | "manual";
  pinned?: boolean;
  updated_at?: number;
}

export interface ChatMessageRecord {
  id: string;
  conv_id: string;
  checkpoint_id: string | null;
  role: string;
  content: string;
  /** JSON-serialized StreamItem[] */
  items: string | null;
  aborted: boolean;
  timestamp: number;
  first_token_at: number | null;
  completed_at: number | null;
  system_prompt: string | null;
  /** JSON-serialized complete tool definitions available for this turn. */
  tools: string | null;
}

export interface TaskTrace {
  id: string;
  conv_id: string | null;
  session_id: string | null;
  checkpoint_id: string | null;
  task_kind: string;
  model: string;
  system_prompt: string;
  /** JSON-serialized complete tool definitions available to the task agent. */
  tools: string;
  prompt: string;
  completion: string | null;
  status: "requested" | "completed" | "failed" | "cancelled" | "interrupted";
  error: string | null;
  usage: TaskTokenUsage | null;
  created_at: number;
}

export interface TaskTokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  tool_use_prompt_tokens: number;
  reasoning_tokens: number;
}

export interface ChatTaskUsage {
  checkpoint_id: string | null;
  usage: TaskTokenUsage;
  created_at: number;
}

export interface CheckpointMeta {
  thread_id: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  metadata: string;
  created_at: number;
}

export type CheckpointTurnStatus = "running" | "interrupted" | "completed" | "cancelled" | "failed";

export interface CheckpointTurnMetadata {
  id: string;
  input_message_id: string;
  response_message_id: string;
  status: CheckpointTurnStatus;
  started_at: number;
  first_token_at?: number | null;
  completed_at?: number | null;
  duration_ms?: number | null;
}

export interface CheckpointMetadataFields {
  step: number;
  tools_used: string[];
  turn?: CheckpointTurnMetadata | null;
}

export interface CheckpointMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: Array<Record<string, unknown>>;
  /** JSON-serialized UI-only StreamItem[] metadata. */
  items?: string | null;
  status: "completed" | "aborted";
  timestamp: number;
  first_token_at: number | null;
  completed_at: number | null;
  tags: AgentMessageTag[];
  system_prompt: string | null;
  tools: string | null;
}

export interface CheckpointData {
  messages: CheckpointMessage[];
  file_change_ids: string[];
  phase:
    | "before_completion"
    | "interrupted"
    | "final_completed"
    | "final_cancelled"
    | "final_failed"
    | null;
  flow?: {
    kind: "goal" | "graph";
    state: Record<string, unknown>;
  };
}

export interface GoalRunUpdatedEvent {
  conv_id: string;
  kind: string;
  status: string;
  flow?: {
    kind: "goal" | "graph";
    state: unknown;
  };
}

export interface RenderableCheckpoint {
  meta: CheckpointMeta;
  data: CheckpointData;
  follow_up_suggestions?: string[];
}

export interface FileChange {
  id: string;
  conv_id: string;
  checkpoint_id: string;
  path: string;
  operation: string;
  old_patch: string | null;
  old_content_z: number[] | null;
  new_content_z: number[] | null;
  new_hash: string | null;
  seq: number;
  created_at: number;
}

export interface WorkspaceContext {
  path: string | null;
  git_branch: string | null;
  has_agent_dir: boolean;
  environment: { kind: "local" } | { kind: "wsl"; distribution: string; linux_path: string };
}

export interface WslDistribution {
  name: string;
}

export interface WslWorkspaceTarget {
  path: string;
  distribution: string;
  linux_path: string;
}

export interface AgentMemoryEntry {
  id: string;
  scope: string;
  content: string;
  created_at: number;
  updated_at: number;
  source_conv_id: string | null;
  source_message_id: string | null;
}

export interface AgentRole {
  id: string;
  scope: string;
  name: string;
  description: string;
  skill_ids: string[];
  mcp_server_ids: string[];
  usage_count: number;
  created_at: number;
  updated_at: number;
  last_used_at: number;
}

// ─── ask_user interactive tool ────────────────────────────────────────────────

export type AskUserField =
  | {
      type: "text";
      name: string;
      label: string;
      placeholder?: string;
      default?: string;
      required?: boolean;
    }
  | {
      type: "textarea";
      name: string;
      label: string;
      placeholder?: string;
      default?: string;
      required?: boolean;
    }
  | {
      type: "select";
      name: string;
      label: string;
      options: string[];
      default?: string;
      required?: boolean;
    }
  | { type: "checkbox"; name: string; label: string; default?: boolean }
  | { type: "checkbox_group"; name: string; label: string; options: string[]; default?: string[] }
  | { type: "date"; name: string; label: string; default?: string; required?: boolean }
  | { type: "confirm"; name: string; label: string; default?: boolean };

export interface UserInputRequest {
  request_id: string;
  conv_id: string | null;
  kind?: "ask_user" | "tool_approval";
  title?: string;
  description?: string;
  fields: AskUserField[];
  submit_label?: string;
  cancel_label?: string;
}

export type ProviderType =
  | "anthropic"
  | "openai"
  | "azure"
  | "gemini"
  | "mistral"
  | "cohere"
  | "xai"
  | "perplexity"
  | "deepseek"
  | "groq"
  | "together"
  | "openrouter"
  | "hyperbolic"
  | "moonshot"
  | "minimax"
  | "zai"
  | "xiaomimimo"
  | "mira"
  | "doubleword"
  | "ollama"
  | "llamafile"
  | "huggingface"
  | "chatgpt";

export interface ProviderAuthDeviceCodeEvent {
  provider: "chatgpt";
  verification_uri: string;
  user_code: string;
}

export interface AgentConfig {
  provider: ProviderType;
  model: string;
  api_key: string;
  base_url: string;
  reasoning_effort?: ReasoningEffort | null;
}

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ProviderConfig {
  id: string;
  name: string;
  provider: ProviderType;
  api_key: string;
  base_url: string;
  enabled: boolean;
  models: string[];
  /** Optional per-model thresholds; missing entries inherit the global value. */
  model_context_compaction_thresholds: Record<string, number>;
  /** Optional reasoning effort per model. */
  model_reasoning_efforts: Record<string, ReasoningEffort>;
  /** Models explicitly configured to accept OpenAI-compatible reasoning effort. */
  model_reasoning_effort_enabled?: Record<string, boolean>;
}

export interface DefaultModelBinding {
  provider_id: string;
  model: string;
}

export interface DefaultModelsConfig {
  chat_model: DefaultModelBinding;
  flash_model: DefaultModelBinding;
}

export interface ModelRetryConfig {
  retry_count: number;
  retry_delay_ms: number;
  chat_queue: DefaultModelBinding[];
  flash_queue: DefaultModelBinding[];
}

export interface FlashAgentConfig {
  enabled: boolean;
  prompt: string;
}

export interface FlashAgentsConfig {
  title: FlashAgentConfig;
  memory: FlashAgentConfig;
  skill_category: FlashAgentConfig;
  suggestions: FlashAgentConfig;
  hook: FlashAgentConfig;
  tool_approval: FlashAgentConfig;
}

export type ApprovalMode = "manual" | "auto" | "off";

export type FileSystemAccess = "read" | "write" | "deny";
export type NetworkAccess = "restricted" | "enabled";

export type FileSystemPermissionPath =
  | { kind: "host_root" }
  | { kind: "workspace"; subpath?: string }
  | { kind: "absolute"; path: string };

export interface FileSystemPermissionEntry {
  path: FileSystemPermissionPath;
  access: FileSystemAccess;
}

export interface ManagedFileSystemPermissions {
  entries: FileSystemPermissionEntry[];
}

export type PermissionProfile =
  | {
      enforcement: "managed";
      file_system: ManagedFileSystemPermissions;
      network: NetworkAccess;
    }
  | { enforcement: "disabled" };

export type McpTransport = "http" | "stdio";

export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransport;
  // HTTP
  url: string;
  bearer_token: string;
  headers: Record<string, string>;
  // Stdio
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  disabled_tools?: string[];
}

export interface McpSettings {
  servers: McpServerConfig[];
}

export interface SkillMetadata {
  name: string;
  description: string;
  category?: string | null;
  dir_name: string;
  path: string;
  scope: "global" | "local" | `plugin:${string}`;
}

export interface AgentPluginSummary {
  id: string;
  name: string;
  version: string | null;
  description: string | null;
  path: string;
  skills: { name: string; description: string }[];
  mcp_servers: { name: string; transport: "stdio" | "streamable-http" }[];
  warnings: string[];
  error: string | null;
}

export interface HtmlPreviewConfig {
  fixed_height: number;
}

export interface RemoteGatewayConfig {
  enabled: boolean;
  allow_lan_access: boolean;
  allowed_workspaces: string[];
}

export interface WechatChannelConfig {
  enabled: boolean;
  allowed_user_ids: string[];
}

export interface FeishuChannelConfig {
  enabled: boolean;
  app_id: string;
  app_secret: string;
  domain: "feishu" | "lark";
  allowed_chat_ids: string[];
}

export interface TelegramChannelConfig {
  enabled: boolean;
  bot_token: string;
  allowed_chat_ids: string[];
}

export interface QqChannelConfig {
  enabled: boolean;
  app_id: string;
  client_secret: string;
  allowed_user_ids: string[];
}

export interface DiscordChannelConfig {
  enabled: boolean;
  bot_token: string;
  allowed_channel_ids: string[];
}

export interface SlackChannelConfig {
  enabled: boolean;
  bot_token: string;
  app_token: string;
  allowed_channel_ids: string[];
}

export interface ChannelConfig {
  wechat: WechatChannelConfig;
  feishu?: FeishuChannelConfig;
  telegram?: TelegramChannelConfig;
  qq?: QqChannelConfig;
  discord?: DiscordChannelConfig;
  slack?: SlackChannelConfig;
}

export interface AppConfig {
  config_version?: number;
  agent_turn_limit_enabled: boolean;
  agent_max_turns: number;
  context_compaction_enabled: boolean;
  context_compaction_threshold: number;
  context_compaction_prompt: string;
  context_compaction_recent_message_count: number;
  memory_retrieval_enabled: boolean;
  providers: ProviderConfig[];
  defaults: DefaultModelsConfig;
  model_retry: ModelRetryConfig;
  flash_agents: FlashAgentsConfig;
  approval_mode: ApprovalMode;
  permission_profile?: PermissionProfile;
  mcp: McpSettings;
  theme: "system" | "light" | "dark";
  language: "zh" | "en";
  html_preview: HtmlPreviewConfig;
  launch_on_startup: boolean;
  onboarding_completed?: boolean;
  diagnostic_log_collection_enabled: boolean;
  quick_chat_shortcut: string;
  mention_palette_show_global_drafts: boolean;
  message_layout: "single" | "responsive_double";
  message_double_column_min_width: number;
  book_mode_font_size: number;
  workspace_open_mode: "ask" | "new_window" | "current_window";
  workspace?: string;
  recent_workspaces?: RecentWorkspace[];
  remote_gateway: RemoteGatewayConfig;
  channels?: ChannelConfig;
}
