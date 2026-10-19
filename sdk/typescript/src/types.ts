export interface ChatAttachment {
  path: string;
  name: string;
  kind: "image" | "document";
  mimeType?: string;
  previewUrl?: string;
}

/** Content-addressed tool image; bytes are requested through attachment preview. */
export interface ToolImageAttachment {
  position: number;
  blob_id: string;
  mime_type: string;
  byte_length: number;
  source_kind: "base64" | "raw";
  media_type?: string | null;
  detail?: string | null;
  additional_params?: unknown;
}

export interface AgentPluginSkillSummary {
  name: string;
  description: string;
}

export interface AgentPluginMcpSummary {
  name: string;
  transport: "stdio" | "streamable-http";
  tool_mode?: "direct" | "relay";
}

export interface AgentPluginSidebarViewSummary {
  id: `plugin:${string}:${string}`;
  title: string;
  entry: string;
  scope: "global" | "workspace" | "conversation";
  icon?: string | null;
  capabilities: string[];
  /** Hidden until the selected branch contains one of these exact tool names. */
  activation_tools?: string[];
}

export interface AgentPluginAutomationHookSummary {
  id: string;
  event: string;
  matcher: string;
  timeout_secs: number;
  command: string;
}

export interface AgentPluginDaemonSummary {
  command: string;
  args: string[];
  transport: "stdio" | "socket";
  capabilities: string[];
}

export interface AgentPluginMessagePolicy {
  tag: string;
  user_visible: boolean;
  model_visible: boolean;
}

export interface AgentPluginCommandSummary {
  id: string;
  name: string;
  argument: "none" | "required_text" | "optional_text";
  label: string;
  description: string;
}

export interface AgentPluginOpenAiSummary {
  display_name: string | null;
  short_description: string | null;
  long_description: string | null;
  developer_name: string | null;
  category: string | null;
  capabilities: string[];
  website_url: string | null;
  privacy_policy_url: string | null;
  terms_of_service_url: string | null;
  default_prompt: string[];
  brand_color: string | null;
  composer_icon: string | null;
  logo: string | null;
  logo_dark: string | null;
  screenshots: string[];
  apps: string | null;
  app_connectors: AgentPluginAppConnectorSummary[];
  hooks: string | null;
}

export interface AgentPluginAppConnectorSummary {
  name: string;
  connector_id: string;
  category: string | null;
}

export interface AgentPluginAuthorSummary {
  name: string | null;
  email: string | null;
  url: string | null;
}

export interface AgentPluginInstallProgress {
  plugin_id: string;
  stage: "preparing" | "downloading" | "validating" | "installing" | "connecting" | "complete";
}

export interface AgentPluginTheme {
  version: 1;
  tokens: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
  fonts?: Array<{
    family: string;
    entry: string;
    weight?: string;
    style?: "normal" | "italic" | "oblique";
  }>;
}

export interface AgentPluginSummary {
  local_source?: string | null;
  plugin_type?: "agent" | "theme" | "integration";
  theme?: AgentPluginTheme | null;
  configuration?: PluginConfiguration | null;
  ui_components?: ConversationUiComponent[];
  mcp_tool_mode?: "direct" | "relay";
  i18n?: AgentPluginI18n | null;
  id: string;
  name: string;
  builtin: boolean;
  enabled: boolean;
  version: string | null;
  description: string | null;
  path: string;
  repository: string | null;
  homepage: string | null;
  license: string | null;
  author: AgentPluginAuthorSummary | null;
  category?:
    | "development"
    | "productivity"
    | "communication"
    | "automation"
    | "data"
    | "design"
    | "other"
    | null;
  keywords: string[];
  capabilities: string[];
  commands: string[];
  command_specs: AgentPluginCommandSummary[];
  message_policies: AgentPluginMessagePolicy[];
  skills: AgentPluginSkillSummary[];
  mcp_servers: AgentPluginMcpSummary[];
  sidebar_views: AgentPluginSidebarViewSummary[];
  automation_hooks: AgentPluginAutomationHookSummary[];
  daemon?: AgentPluginDaemonSummary | null;
  openai?: AgentPluginOpenAiSummary | null;
  warnings: string[];
  error: string | null;
}

export interface LocalPluginRefreshReport {
  updated: string[];
  deferred: string[];
  errors: Record<string, string>;
}

export interface PluginConfigurationField {
  key: string;
  label: string;
  description: string;
  type: "string" | "boolean" | "integer" | "enum";
  required: boolean;
  secret: boolean;
  default?: string | boolean | number;
  options: string[];
  minimum?: number;
  maximum?: number;
  env?: string;
  mcp?: { server: string; property: "oauth_client_id" | "oauth_scope" | "bearer_token" };
}
export interface PluginConfiguration {
  version: 1;
  fields: PluginConfigurationField[];
}
export interface PluginConfigurationStatus {
  schema: PluginConfiguration;
  values: Record<string, string | boolean | number>;
  secrets_set: string[];
  missing_required: string[];
  invalid_fields: string[];
  revision: string;
}
export interface PluginOAuthStatus {
  authorized: boolean;
  expires_at: number | null;
  error: string | null;
}
export interface PluginOAuthStart {
  authorization_url: string;
  redirect_uri: string;
  state: string;
  client_id: string;
}
export interface PluginConnectorProbe {
  probe?: { tools: string[]; resources: string[] } | null;
  error?: string | null;
  oauth: "not_applicable" | "not_required" | "required" | "unsupported" | "unknown";
}

export type AgentPluginI18n = import("./protocol.generated.js").PluginI18n;

/**
 * Why one plugin's release metadata could not be read.
 *
 * `rate_limited` and `network_failed` describe the machine's
 * access to GitHub rather than the plugin, so a surface must not present them as
 * a broken package. `repository_unsupported` and `release_unavailable` are
 * properties of that one plugin.
 */
export type AgentPluginUpdateErrorKind =
  "rate_limited" | "network_failed" | "repository_unsupported" | "release_unavailable";

/**
 * The worst condition one update check met.
 *
 * A rate limit or a network failure is machine-wide and is
 * reported on the check itself, because a quota can run out partway through the
 * loop and leave a mixture of per-plugin results that no single plugin explains.
 */
export type AgentPluginUpdateCheckStatus = "ok" | "partial" | "rate_limited" | "network_failed";

export interface AgentPluginUpdateSummary {
  id: string;
  current_version: string | null;
  latest_version: string | null;
  release_url: string | null;
  asset_name: string | null;
  asset_url: string | null;
  asset_digest: string | null;
  update_available: boolean;
  error: string | null;
  error_kind: AgentPluginUpdateErrorKind | null;
  /** The metadata could not be refreshed and this is the remembered value. */
  stale: boolean;
}

export interface AgentPluginUpdateCheck {
  status: AgentPluginUpdateCheckStatus;
  /** Plugins with a resolvable repository that were examined. */
  checked: number;
  /** The subset answered from the freshness cache with no request at all. */
  cached: number;
  /** Unix seconds when the GitHub rate limit resets, when GitHub reported it. */
  rate_limit_reset: number | null;
}

export interface AgentPluginUpdateReport {
  updates: AgentPluginUpdateSummary[];
  check: AgentPluginUpdateCheck;
}

export interface AgentPluginMarketplaceSource {
  kind: string;
  path: string | null;
  url: string | null;
  reference: string | null;
  package: string | null;
  version: string | null;
  registry: string | null;
}

export interface AgentPluginMarketplaceEntry {
  name: string;
  display_name: string | null;
  category: string | null;
  installation: string;
  authentication: string;
  products: string[];
  source: AgentPluginMarketplaceSource;
  installed: boolean;
  error: string | null;
}

export interface AgentPluginMarketplaceSummary {
  name: string;
  display_name: string | null;
  path: string;
  source: string;
  plugins: AgentPluginMarketplaceEntry[];
  warnings: string[];
  error: string | null;
}

export type ContextCompactionStage = import("./protocol.generated.js").ContextCompactionStage;

export type AgentMessageTag =
  | "context_compaction"
  | "plugin_command_input"
  | "queued_user_message"
  | "chat_group_mention"
  | "terminal_poll"
  | "terminal_wake"
  | "hook_wake"
  | "goal_bootstrap"
  | "graph_bootstrap"
  | "goal_continuation"
  | "graph_continuation"
  | "graph_node_bootstrap"
  | "graph_node_continuation";

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

export interface ConvPatch {
  title?: string;
  title_source?: "fallback" | "manual";
  pinned?: boolean;
  updated_at?: number;
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
  role: "user" | "assistant" | "system" | "ui";
  content: Array<Record<string, unknown>>;
  items?: string | null;
  status: "completed" | "aborted";
  timestamp: number;
  first_token_at: number | null;
  completed_at: number | null;
  tags: AgentMessageTag[];
  plugin_tags?: string[];
  plugin_user_visible?: boolean;
  plugin_model_visible?: boolean;
  system_prompt: string | null;
  tools: string | null;
}

export interface CheckpointData {
  format_version?: number;
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
    /** Legacy Goal/Graph values remain readable; new packages use `plugin`. */
    kind: "goal" | "graph" | "plugin";
    state: Record<string, unknown>;
  };
}

/** Durable conversation presentation, excluded from model input. */
export interface ConversationUi {
  version: number;
  component: string;
  props: Record<string, unknown>;
  fallback: string;
  plugin_id?: string | null;
  entry?: string | null;
}

export interface ConversationUiComponent {
  id: string;
  version: number;
  title: string;
  entry: string;
}

export interface RenderableCheckpoint {
  meta: CheckpointMeta;
  data: CheckpointData;
  data_loaded?: boolean;
  follow_up_suggestions?: string[];
}

export interface TaskTokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  /** Input-context size from the latest provider request in this task. */
  context_tokens?: number;
  active_context_tokens?: number;
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

export interface TaskTraceSummary {
  id: string;
  conv_id: string | null;
  session_id: string | null;
  checkpoint_id: string | null;
  task_kind: string;
  model: string;
  status: string;
  usage: TaskTokenUsage | null;
  created_at: number;
}

export interface FileChangeProjection {
  /** False: tool fragments whose actual file line numbers are unknown. */
  complete?: boolean;
  kind: "created" | "edited" | "deleted" | "unchanged";
  change_ids: string[];
  diff: string | null;
  content: string | null;
  available: boolean;
}

export interface FileChange {
  /** Runtime-owned estimate from this checkpoint's tool records. */
  projection?: FileChangeProjection | null;
  id: string;
  conv_id: string;
  checkpoint_id: string;
  path: string;
  operation: string;
  seq: number;
  created_at: number;
}

export interface AgentRole {
  id: string;
  scope: "global";
  name: string;
  description: string;
  skill_ids: string[];
  mcp_server_ids: string[];
  usage_count: number;
  created_at: number;
  updated_at: number;
  last_used_at: number;
}

export interface AgentMemoryEntry {
  id: string;
  scope: string;
  content: string;
  created_at: number;
  updated_at: number;
  last_accessed_at: number;
  last_confirmed_at: number;
  status: string;
  source_conv_id: string | null;
  source_message_id: string | null;
}

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
