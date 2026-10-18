import type {
  AgentRole,
  PluginConfigurationStatus,
  PluginOAuthStatus,
  PluginOAuthStart,
  PluginConnectorProbe,
  AgentPluginSummary,
  AgentPluginInstallProgress,
  AgentPluginUpdateReport,
  AgentPluginMarketplaceSummary,
  AgentMemoryEntry,
  AskUserField,
  CheckpointMessage,
  ChatTaskUsage,
  ChatAttachment,
  BranchMeta,
  ConvPatch,
  ContextCompactionStage,
  FileChange,
  RenderableCheckpoint,
  TaskTokenUsage,
  TaskTraceSummary,
  ToolImageAttachment,
} from "./types";

export const OPENAGENT_PROTOCOL_VERSION = 3;

export interface ChatModelBinding {
  providerId: string;
  model: string;
}

export type UserMessageContext = {
  type: "quote";
  text: string;
  sourceMessageId?: string | null;
};

export interface AgentCommandSpec {
  plugin_i18n?: import("./types").AgentPluginI18n | null;
  name: string;
  owner: "runtime" | "client";
  argument: "none" | "required_text" | "optional_text";
  label_key: string;
  description_key: string;
  plugin_id: string | null;
  label?: string | null;
  description?: string | null;
}

export interface SubmitAgentInputRequest {
  convId: string;
  text: string;
  parentCheckpointId?: string | null;
  branchId?: string | null;
  attachments?: string[];
  contexts?: UserMessageContext[];
  modelBinding?: ChatModelBinding | null;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
}

export type InputDelivery = "next_turn" | "steer";

export interface QueuedInput {
  id: string;
  input: SubmitAgentInputRequest;
  delivery: InputDelivery;
  status: "queued" | "starting" | "running" | "completed" | "failed" | "cancelled";
  runId: string | null;
  error: string | null;
}

export interface InputQueueSnapshot {
  convId: string;
  revision: number;
  paused: boolean;
  activeRunId: string | null;
  items: QueuedInput[];
}

export type InputQueueAction =
  | {
      type: "add";
      input: SubmitAgentInputRequest;
      delivery: InputDelivery;
      expectedRunId?: string | null;
    }
  | { type: "update"; id: string; input: SubmitAgentInputRequest; expectedRevision: number }
  | { type: "delete"; id: string }
  | { type: "clear" }
  | { type: "reorder"; ids: string[]; expectedRevision: number }
  | { type: "set_paused"; paused: boolean }
  | { type: "retry"; id: string };

export type SubmitAgentInputOutcome =
  | { type: "run_completed" }
  | { type: "run_accepted" }
  | {
      type: "immediate_command";
      command: "compact";
      changed: boolean;
    };

export interface ResumeInterruptedChatRequest {
  convId: string;
  interruptId: string;
  response: string;
  branchId?: string | null;
  assistantMessageId: string;
  modelBinding?: ChatModelBinding | null;
}

export interface SubmitInterruptResponseRequest {
  convId: string;
  interruptId: string;
  response: string;
}

export type ChatMemoryRetrievalStage =
  "query_rewrite" | "embedding" | "searching" | "completed" | "skipped";

export interface RemoteWorkspace {
  id: string;
  name: string;
}

export interface RemotePreferences {
  theme: "system" | "light" | "dark";
  language: "zh" | "en";
  message_layout?: "single" | "responsive_double";
  message_double_column_min_width?: number;
  book_mode_font_size?: number;
}

export interface RemoteInterrupt {
  id: string;
  kind: "ask_user" | "tool_approval" | "render_mermaid";
  tool_name: string;
  arguments: Record<string, unknown>;
  fields: AskUserField[];
}

export interface RemoteConversationState {
  input_queue?: InputQueueSnapshot | null;
  conv_id: string;
  title: string | null;
  phase:
    | "before_completion"
    | "interrupted"
    | "final_completed"
    | "final_cancelled"
    | "final_failed"
    | null;
  checkpoint_id: string | null;
  messages: CheckpointMessage[];
  interrupts: RemoteInterrupt[];
}

export interface RemoteConversation {
  conv_id: string;
  branch_id: string;
}

export interface RemoteConversationMeta {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  pinned: boolean;
  parent_conv_id?: string;
  compacted_from_conv_id?: string;
  flow_kind?: string;
  flow_status?: string;
  role_id?: string;
}

export interface RemoteConversationHistory {
  checkpoints: RenderableCheckpoint[];
  branches: BranchMeta[];
  active_branch_tip: string | null;
  file_changes: FileChange[];
}

export interface RemoteModel {
  provider_id: string;
  provider_name: string;
  model: string;
  is_default: boolean;
}

export interface BackgroundTerminalSession {
  session_id: string;
  command: string;
  cwd: string;
  started_at: number;
  status: string;
  /**
   * Conversation that spawned the session, or `null` when it was started
   * outside a scoped turn.
   */
  conv_id: string | null;
  /**
   * Branch that spawned the session, or `null` when the owner is unknown.
   * Callers must treat `null` as unattributed and keep the session visible
   * rather than assigning it to a branch.
   */
  branch_id: string | null;
}

export interface BackgroundTerminalReadResult {
  output: string;
  next_cursor: number;
  truncated: boolean;
  status: string;
}

export interface BackgroundTerminalWriteResult {
  bytes_written: number;
  status: string;
}

export interface BackgroundTerminalKillResult {
  status: string;
}

export interface UploadRemoteAttachmentRequest {
  name: string;
  contentBase64: string;
}

export interface RepairAttachmentBlobRequest {
  blobId: string;
  name: string;
  contentBase64: string;
}

export interface ForkRemoteRunRequest {
  convId: string;
  text: string;
  sourceCheckpointId: string;
  parentCheckpointId: string | null;
  forkedFromMessageId: string;
  attachments: Array<{ locator: string; name: string }>;
  contexts?: UserMessageContext[];
  modelBinding?: ChatModelBinding | null;
  userMessageId: string;
  assistantMessageId: string;
}

export interface AttachmentPreviewPayload {
  kind: "image" | "text" | "file";
  data_url?: string;
  text?: string;
}

export interface WorkspaceTextSnippet {
  startLine: number;
  lines: string[];
}

export interface WorkspaceMediaSource {
  url: string;
  mimeType: string;
}

export type ResolvedAgentInput =
  | { type: "chat"; text: string }
  | {
      type: "agent_command";
      command: "compact";
      argument: string;
      original_text: string;
    }
  | {
      type: "client_action";
      action:
        | "new_conversation"
        | "open_model_settings"
        | "open_memory"
        | "open_skills"
        | "open_settings";
      original_text: string;
    };

/** Privacy-filtered desktop diagnostic. Raw messages and stack traces are excluded. */
export interface FrontendDiagnosticRequest {
  eventName: string;
  component: string;
  errorKind: string;
}

export interface EmbeddingResourceStatus {
  state: "ready" | "missing" | "corrupt";
  model_id: string;
  version: string;
  total_bytes: number;
}

export interface EmbeddingResourceProgress {
  downloaded_bytes: number;
  total_bytes: number;
  current_file: string;
}

export interface DesktopProductCommandMap {
  report_frontend_diagnostic: { request: FrontendDiagnosticRequest; response: void };
  get_embedding_resource_status: {
    request: Record<string, never>;
    response: EmbeddingResourceStatus;
  };
  prepare_embedding_resource: {
    request: Record<string, never>;
    response: EmbeddingResourceStatus;
  };
  resolve_agent_input: { request: { text: string }; response: ResolvedAgentInput };
  get_conversations: { request: { workspace?: string | null }; response: unknown };
  get_conversation_page: {
    request: {
      workspace?: string | null;
      cursor?: unknown;
      limit: number;
      searchQuery?: string | null;
      filterByRole?: boolean | null;
      roleId?: string | null;
    };
    response: unknown;
  };
  get_conversation_meta: { request: { convId: string }; response: unknown };
  get_child_conversations: {
    request: { parentConvId: string; workspace?: string | null };
    response: unknown;
  };
  create_conversation: {
    request: {
      id: string;
      title: string;
      workspace: string;
      parentConvId?: string | null;
      roleId?: string | null;
    };
    response: void;
  };
  update_conversation: { request: { convId: string; patch: ConvPatch }; response: void };
  create_branch: {
    request: {
      id: string;
      convId: string;
      parentBranchId?: string | null;
      forkedFromCheckpointId?: string | null;
      forkedFromMessageId?: string | null;
    };
    response: void;
  };
  get_branches: { request: { convId: string }; response: BranchMeta[] };
  set_active_branch_tip: {
    request: { convId: string; checkpointId: string };
    response: void;
  };
  get_active_branch_tip: { request: { convId: string }; response: string | null };
  delete_conversation: { request: { convId: string }; response: void };
  export_conversation_trace: { request: { convId: string }; response: string };
  submit_problem_report: {
    request: { description: string; convId: string | null };
    response: { reportId: string };
  };
  get_task_traces: {
    request: { cursor?: { created_at: number; id: string } | null; limit?: number | null };
    response: { items: TaskTraceSummary[]; next_cursor: { created_at: number; id: string } | null };
  };
  get_task_trace: { request: { id: string }; response: unknown | null };
  debug_disconnect_model_requests: {
    request: Record<string, never>;
    response: string[];
  };
  debug_create_context_compaction_diagnostic: {
    request: Record<string, never>;
    response: string;
  };
  inspector_database_overview: {
    request: Record<string, never>;
    response: unknown;
  };
  inspector_table_data: {
    request: {
      tableName: string;
      search?: string | null;
      sortColumn?: string | null;
      sortDirection?: string | null;
      offset?: number | null;
      limit?: number | null;
    };
    response: unknown;
  };
  get_chat_task_usages: { request: { convId: string }; response: ChatTaskUsage[] };
  get_renderable_checkpoints: {
    request: { convId: string };
    response: RenderableCheckpoint[];
  };
  get_checkpoint_view: {
    request: { convId: string; checkpointId?: string | null };
    response: RenderableCheckpoint[];
  };
  rollback_to_checkpoint: {
    request: { convId: string; checkpointId: string };
    response: void;
  };
  restore_agent_history: {
    request: { convId: string; checkpointId?: string | null };
    response: void;
  };
  get_file_changes: { request: { convId: string }; response: FileChange[] };
  cancel_chat_message: { request: { convId: string }; response: void };
  save_workspace_prefs: {
    request: { workspace: string; recentWorkspaces: unknown[] };
    response: void;
  };
  set_active_conversation: {
    request: { convId?: string | null; workspace: string };
    response: void;
  };
  get_active_conv_id: { request: { workspace: string }; response: string | null };
  get_new_conversation_suggestions: {
    request: { workspace: string; language: "zh" | "en" };
    response: string[];
  };
  set_workspace: { request: { path?: string | null }; response: void };
  get_workspace_context: { request: Record<string, never>; response: unknown };
  list_background_terminals: {
    request: Record<string, never>;
    response: BackgroundTerminalSession[];
  };
  read_background_terminal: {
    request: { sessionId: string; fromByte?: number | null };
    response: BackgroundTerminalReadResult;
  };
  write_background_terminal: {
    request: { sessionId: string; data: string; appendNewline?: boolean | null };
    response: BackgroundTerminalWriteResult;
  };
  kill_background_terminal: {
    request: { sessionId: string };
    response: BackgroundTerminalKillResult;
  };
  get_workspace_launch_context: { request: Record<string, never>; response: unknown };
  get_settings: { request: Record<string, never>; response: unknown };
  save_settings: {
    request: { config: unknown; baseConfig?: unknown };
    response: unknown;
  };
  set_default_chat_model: { request: { binding: unknown }; response: unknown };
  set_model_reasoning_effort: {
    request: { providerId: string; model: string; effort: unknown };
    response: unknown;
  };
  test_provider_connection: { request: { request: unknown }; response: unknown };
  fetch_provider_models: { request: { request: unknown }; response: string[] };
  get_chatgpt_auth_status: { request: Record<string, never>; response: boolean };
  logout_chatgpt: { request: Record<string, never>; response: boolean };
  get_channel_statuses: { request: Record<string, never>; response: unknown };
  get_wechat_channel_status: { request: Record<string, never>; response: unknown };
  reset_wechat_channel: { request: Record<string, never>; response: void };
  get_remote_gateway_status: { request: Record<string, never>; response: unknown };
  rotate_remote_gateway_pairing_code: {
    request: Record<string, never>;
    response: string;
  };
  list_scheduled_chat_hooks: { request: Record<string, never>; response: unknown };
  cancel_scheduled_chat_hook: { request: { id: string }; response: void };
  schedule_chat_hook: { request: { args: unknown }; response: string };
  update_scheduled_chat_hook: {
    request: { id: string; args: unknown };
    response: string;
  };
  list_agent_roles: { request: Record<string, never>; response: AgentRole[] };
  list_agent_roles_for_workspace: {
    request: { workspace: string };
    response: AgentRole[];
  };
  list_skills: { request: Record<string, never>; response: unknown[] };
  list_agent_plugins: {
    request: Record<string, never>;
    response: AgentPluginSummary[];
  };
  refresh_local_agent_plugins: {
    request: { id?: string };
    response: import("./types").LocalPluginRefreshReport;
  };
  complete_local_plugin_refresh_preparation: {
    request: { token: string; error?: string };
    response: void;
  };
  get_agent_plugin_configuration: {
    request: { plugin_id: string };
    response: PluginConfigurationStatus;
  };
  save_agent_plugin_configuration: {
    request: {
      plugin_id: string;
      values: Record<string, string | boolean | number | null>;
      revision: string;
    };
    response: PluginConfigurationStatus;
  };
  test_agent_plugin_connector: {
    request: { plugin_id: string; server_name: string };
    response: PluginConnectorProbe;
  };
  begin_agent_plugin_oauth: {
    request: { plugin_id: string; server_name: string };
    response: PluginOAuthStart;
  };
  get_agent_plugin_oauth_status: {
    request: { plugin_id: string; server_name: string };
    response: PluginOAuthStatus;
  };
  revoke_agent_plugin_oauth: {
    request: { plugin_id: string; server_name: string };
    response: void;
  };
  list_agent_plugin_marketplaces: {
    request: Record<string, never>;
    response: AgentPluginMarketplaceSummary[];
  };
  install_marketplace_agent_plugin: {
    request: { marketplace_path: string; plugin_name: string };
    response: AgentPluginSummary;
  };
  install_official_agent_plugin: {
    request: { plugin_id: string; display_name: string; source_url: string };
    response: AgentPluginSummary;
  };
  check_agent_plugin_updates: {
    request: Record<string, never>;
    response: AgentPluginUpdateReport;
  };
  update_agent_plugin: {
    request: { id: string };
    response: AgentPluginSummary;
  };
  install_agent_plugin: {
    request: { source: string };
    response: AgentPluginSummary;
  };
  uninstall_agent_plugin: { request: { id: string }; response: void };
  read_agent_plugin_asset: {
    request: { plugin_id: string; entry: string };
    response: { content: string; mime: string; encoding?: "base64" };
  };
  set_conversation_ui_props: {
    request: {
      convId: string;
      branchId: string;
      messageId: string;
      props: Record<string, unknown>;
    };
    response: { id: string; checkpoint_id: string };
  };
  save_agent_role: {
    request: {
      id: string | null;
      name: string;
      description: string;
      skillIds: string[];
      mcpServerIds: string[];
    };
    response: AgentRole;
  };
  delete_agent_role: { request: { id: string }; response: void };
  trigger_memory_agent: { request: { convId?: string | null }; response: void };
  get_memory_status: { request: Record<string, never>; response: boolean };
  get_memory: { request: { scope: string }; response: string };
  save_memory: { request: { scope: string; content: string }; response: void };
  get_agent_memories: {
    request: { scope: string; query?: string | null };
    response: AgentMemoryEntry[];
  };
  delete_agent_memory: { request: { id: string }; response: void };
  export_memory_backup: { request: { scope: string }; response: string };
  import_memory_backup: {
    request: { scope: string; content: string; replace: boolean };
    response: { user_memory_imported: boolean; agent_memories_imported: number };
  };
  clear_memory: { request: { scope: string }; response: void };
  list_project_drafts: { request: { scope: string }; response: unknown };
  list_workspace_files: { request: { query?: string | null }; response: string[] };
  test_mcp_server: { request: { server: unknown }; response: unknown };
  begin_mcp_oauth: { request: { server: unknown }; response: unknown };
  get_mcp_oauth_status: { request: { server_id: string }; response: unknown };
  refresh_mcp_servers: { request: Record<string, never>; response: void };
  call_mcp_tool: {
    request: { server_id: string; tool_name: string; arguments: unknown };
    response: unknown;
  };
  call_agent_plugin_tool: {
    request: { plugin_id: string; tool_name: string; arguments: unknown };
    response: unknown;
  };
  read_mcp_resource: {
    request: { server_id: string; uri: string };
    response: unknown;
  };
  list_mcp_prompts: {
    request: { server_id: string };
    response: unknown;
  };
  get_mcp_prompt: {
    request: { server_id: string; name: string; arguments?: unknown };
    response: unknown;
  };
  list_mcp_resources: {
    request: { server_id: string };
    response: unknown;
  };
  list_mcp_resource_templates: {
    request: { server_id: string };
    response: unknown;
  };
  get_mcp_app_state: {
    request: {
      conversation_id?: string | null;
      server_id: string;
      resource_uri: string;
    };
    response: unknown;
  };
  set_mcp_app_state: {
    request: {
      conversation_id?: string | null;
      server_id: string;
      resource_uri: string;
      widget_state: unknown;
    };
    response: void;
  };
  update_mcp_app_model_context: {
    request: {
      conversation_id: string;
      content?: unknown;
      structured_content?: unknown;
    };
    response: void;
  };
  mcp_app_import_file: {
    request: { path: string };
    response: { fileId: string; fileName: string; mimeType: string };
  };
  mcp_app_upload_file: {
    request: { name: string; mime_type: string; content_base64: string };
    response: { fileId: string; fileName: string; mimeType: string };
  };
  mcp_app_get_file_download_url: {
    request: { file_id: string };
    response: { fileId: string; downloadUrl: string; mimeType: string };
  };
  save_pasted_attachment: {
    request: { name: string; contentBase64: string };
    response: string;
  };
  materialize_attachment_blob: {
    request: { blobId: string; name: string };
    response: string;
  };
  repair_attachment_blob: {
    request: { blobId: string; name: string; path: string };
    response: void;
  };
  read_attachment_preview: {
    request: { locator: string; name: string };
    response: AttachmentPreviewPayload;
  };
  submit_quick_chat: { request: { request: unknown }; response: string };
}

export type DesktopProductCommand = keyof DesktopProductCommandMap;

export const DESKTOP_PRODUCT_COMMANDS = [
  "report_frontend_diagnostic",
  "get_embedding_resource_status",
  "prepare_embedding_resource",
  "resolve_agent_input",
  "get_conversations",
  "get_conversation_page",
  "get_conversation_meta",
  "get_child_conversations",
  "create_conversation",
  "update_conversation",
  "create_branch",
  "get_branches",
  "set_active_branch_tip",
  "get_active_branch_tip",
  "delete_conversation",
  "export_conversation_trace",
  "submit_problem_report",
  "get_task_traces",
  "get_task_trace",
  "debug_disconnect_model_requests",
  "debug_create_context_compaction_diagnostic",
  "inspector_database_overview",
  "inspector_table_data",
  "get_chat_task_usages",
  "get_renderable_checkpoints",
  "get_checkpoint_view",
  "rollback_to_checkpoint",
  "restore_agent_history",
  "get_file_changes",
  "cancel_chat_message",
  "save_workspace_prefs",
  "set_active_conversation",
  "get_active_conv_id",
  "get_new_conversation_suggestions",
  "set_workspace",
  "get_workspace_context",
  "list_background_terminals",
  "read_background_terminal",
  "write_background_terminal",
  "kill_background_terminal",
  "get_workspace_launch_context",
  "get_settings",
  "save_settings",
  "set_default_chat_model",
  "set_model_reasoning_effort",
  "test_provider_connection",
  "fetch_provider_models",
  "get_chatgpt_auth_status",
  "logout_chatgpt",
  "get_channel_statuses",
  "get_wechat_channel_status",
  "reset_wechat_channel",
  "get_remote_gateway_status",
  "rotate_remote_gateway_pairing_code",
  "list_scheduled_chat_hooks",
  "cancel_scheduled_chat_hook",
  "schedule_chat_hook",
  "update_scheduled_chat_hook",
  "list_agent_roles",
  "list_agent_roles_for_workspace",
  "list_skills",
  "list_agent_plugins",
  "refresh_local_agent_plugins",
  "complete_local_plugin_refresh_preparation",
  "get_agent_plugin_configuration",
  "save_agent_plugin_configuration",
  "test_agent_plugin_connector",
  "begin_agent_plugin_oauth",
  "get_agent_plugin_oauth_status",
  "revoke_agent_plugin_oauth",
  "list_agent_plugin_marketplaces",
  "check_agent_plugin_updates",
  "update_agent_plugin",
  "install_agent_plugin",
  "install_marketplace_agent_plugin",
  "install_official_agent_plugin",
  "uninstall_agent_plugin",
  "read_agent_plugin_asset",
  "set_conversation_ui_props",
  "save_agent_role",
  "delete_agent_role",
  "trigger_memory_agent",
  "get_memory_status",
  "get_memory",
  "save_memory",
  "get_agent_memories",
  "delete_agent_memory",
  "export_memory_backup",
  "import_memory_backup",
  "clear_memory",
  "list_project_drafts",
  "list_workspace_files",
  "test_mcp_server",
  "begin_mcp_oauth",
  "get_mcp_oauth_status",
  "refresh_mcp_servers",
  "call_mcp_tool",
  "call_agent_plugin_tool",
  "read_mcp_resource",
  "list_mcp_prompts",
  "get_mcp_prompt",
  "list_mcp_resources",
  "list_mcp_resource_templates",
  "get_mcp_app_state",
  "set_mcp_app_state",
  "update_mcp_app_model_context",
  "mcp_app_import_file",
  "mcp_app_upload_file",
  "mcp_app_get_file_download_url",
  "save_pasted_attachment",
  "materialize_attachment_blob",
  "repair_attachment_blob",
  "read_attachment_preview",
  "submit_quick_chat",
] as const satisfies readonly DesktopProductCommand[];

export function isDesktopProductCommand(command: string): command is DesktopProductCommand {
  return (DESKTOP_PRODUCT_COMMANDS as readonly string[]).includes(command);
}

export interface OpenAgentOperationMap {
  "conversation.get_input_queue": {
    request: { convId: string };
    response: InputQueueSnapshot;
  };
  "conversation.mutate_input_queue": {
    request: { convId: string; action: InputQueueAction };
    response: InputQueueSnapshot;
  };
  "product.get_startup_bootstrap": {
    request: Record<string, never>;
    response: unknown;
  };
  "product.invoke_desktop": {
    request: { operation: DesktopProductCommand; args: Record<string, unknown> };
    response: unknown;
  };
  "agent.submit_input": {
    request: SubmitAgentInputRequest;
    response: SubmitAgentInputOutcome;
  };
  "agent.resume_interrupt": {
    request: ResumeInterruptedChatRequest;
    response: void;
  };
  "agent.submit_interrupt_response": {
    request: SubmitInterruptResponseRequest;
    response: void;
  };
  "gateway.restore_session": {
    request: Record<string, never>;
    response: boolean;
  };
  "gateway.pair": {
    request: { code: string };
    response: void;
  };
  "gateway.list_workspaces": {
    request: Record<string, never>;
    response: RemoteWorkspace[];
  };
  "gateway.list_roles": {
    request: { workspaceId: string };
    response: AgentRole[];
  };
  "gateway.list_workspace_files": {
    request: { workspaceId: string; query?: string };
    response: string[];
  };
  "gateway.list_models": {
    request: Record<string, never>;
    response: RemoteModel[];
  };
  "gateway.list_commands": {
    request: Record<string, never>;
    response: AgentCommandSpec[];
  };
  "gateway.get_preferences": {
    request: Record<string, never>;
    response: RemotePreferences;
  };
  "conversation.list_remote": {
    request: { workspaceId: string };
    response: RemoteConversationMeta[];
  };
  "conversation.create_remote": {
    request: { workspaceId: string; roleId: string | null };
    response: RemoteConversation;
  };
  "conversation.get_remote_state": {
    request: { convId: string };
    response: RemoteConversationState;
  };
  "conversation.get_remote_history": {
    request: { convId: string };
    response: RemoteConversationHistory;
  };
  "conversation.read_ui_asset": {
    request: { convId: string; plugin_id: string; entry: string };
    response: { content: string; mime: string; document_url?: string };
  };
  "conversation.set_ui_props": {
    request: DesktopProductCommandMap["set_conversation_ui_props"]["request"];
    response: DesktopProductCommandMap["set_conversation_ui_props"]["response"];
  };
  "conversation.switch_remote_branch": {
    request: { convId: string; checkpointId: string };
    response: void;
  };
  "conversation.fork_remote_run": {
    request: ForkRemoteRunRequest;
    response: SubmitAgentInputOutcome;
  };
  "conversation.update_remote": {
    request: { convId: string; patch: ConvPatch };
    response: void;
  };
  "conversation.delete_remote": {
    request: { convId: string };
    response: void;
  };
  "conversation.skip_memory_retrieval": {
    request: { convId: string };
    response: void;
  };
  "conversation.cancel_remote": {
    request: { convId: string };
    response: void;
  };
  "conversation.set_stream_paused": {
    request: { convId: string; paused: boolean };
    response: void;
  };
  "attachment.upload_remote": {
    request: UploadRemoteAttachmentRequest;
    response: ChatAttachment;
  };
  "attachment.get_remote_preview": {
    request: { blobId: string; name: string };
    response: AttachmentPreviewPayload;
  };
  "attachment.repair_blob": {
    request: RepairAttachmentBlobRequest;
    response: void;
  };
  "workspace.open_path": {
    request: { convId?: string; path: string };
    response: void;
  };
  "workspace.read_text_snippet": {
    request: {
      convId?: string;
      path: string;
      startLine: number;
      endLine: number;
    };
    response: WorkspaceTextSnippet;
  };
  "workspace.resolve_media": {
    request: { convId?: string; path: string; kind: "image" | "video" };
    response: WorkspaceMediaSource;
  };
}

export interface OpenAgentEventMap {
  "chat.input_consumed": { conv_id: string; run_id: string; message: CheckpointMessage };
  "chat.input_queue_changed": { conv_id: string };
  "plugin.install_progress": AgentPluginInstallProgress;
  "conversation.state": RemoteConversationState;
  "chat.run_started": ChatRunStartedEvent;
  "chat.response_started": { conv_id: string };
  "chat.model_usage": ChatModelUsageEvent;
  "chat.memory_retrieval": { conv_id: string; stage: ChatMemoryRetrievalStage };
  "chat.chunk": { conv_id: string; text: string };
  "chat.thinking_chunk": { conv_id: string; text: string };
  "chat.tool_call": {
    conv_id: string;
    name: string;
    args: unknown;
    tool_use_id?: string;
    mcp_ui?: McpUiInvocation;
  };
  "chat.tool_result": {
    conv_id: string;
    result: string;
    tool_use_id?: string;
    mcp_ui?: McpUiInvocation;
    image_attachments?: ToolImageAttachment[];
  };
  "chat.file_change": { conv_id: string; change: FileChange; branch_id?: string | null };
  "chat.checkpoint": {
    conv_id: string;
    checkpoint_id: string;
    branch_id?: string | null;
  };
  "chat.retry": {
    conv_id: string;
    attempt: number;
    max_attempts: number;
    model?: string;
    error?: string | null;
    restored_checkpoint?: boolean;
  };
  "chat.compaction_progress": {
    conv_id: string;
    stage: ContextCompactionStage;
    error?: string | null;
  };
  "chat.done": {
    conv_id: string;
    asst_msg_id?: string | null;
    turn_id?: string | null;
    error?: string | null;
  };
  "chat.follow_up_suggestions": {
    conv_id: string;
    asst_msg_id: string;
    suggestions: string[];
  };
  "conversation.new_suggestions": {
    workspace: string;
    language: "zh" | "en";
    suggestions: string[];
  };
  "chat.interrupted": {
    conv_id: string;
    request_id: string;
    asst_msg_id?: string | null;
    turn_id?: string | null;
  };
  "chat.cancelled": {
    conv_id: string;
    asst_msg_id?: string | null;
    turn_id?: string | null;
  };
}

export interface ChatRunStartedEvent {
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
  user_visible?: boolean;
}

export interface ChatModelUsageEvent {
  conv_id: string;
  turn: number;
  usage: TaskTokenUsage;
}

export interface McpUiToolDescriptor {
  server_id: string;
  tool_name: string;
  resource_uri: string;
  visibility: string[];
  meta?: unknown;
}

export interface McpUiResource {
  uri: string;
  mime_type: string;
  text?: string | null;
  blob?: string | null;
  meta?: unknown;
}

export interface McpUiInvocation {
  descriptor: McpUiToolDescriptor;
  resource?: McpUiResource | null;
  arguments: unknown;
  content: unknown[];
  structured_content?: unknown;
  meta?: unknown;
  result_meta?: unknown;
  tool_result?: unknown;
  is_error?: boolean;
  state_key?: string | null;
}

export interface ChatEventHandlers {
  onInputConsumed: (event: OpenAgentEventMap["chat.input_consumed"]) => void;
  onRunStarted: (event: ChatRunStartedEvent) => void;
  onResponseStarted: (convId: string) => void;
  onModelUsage: (convId: string, usage: TaskTokenUsage, turn: number) => void;
  onMemoryRetrieval: (convId: string, stage: ChatMemoryRetrievalStage) => void;
  onChunk: (convId: string, text: string) => void;
  onThinkingChunk: (convId: string, text: string) => void;
  onToolCall: (
    convId: string,
    name: string,
    args: unknown,
    toolUseId?: string,
    mcpUi?: McpUiInvocation,
  ) => void;
  onToolResult: (
    convId: string,
    result: string,
    toolUseId?: string,
    mcpUi?: McpUiInvocation,
    imageAttachments?: ToolImageAttachment[],
  ) => void;
  onFileChange: (convId: string, change: FileChange, branchId?: string | null) => void;
  onCheckpoint: (convId: string, checkpointId: string, branchId?: string | null) => void;
  onRetry: (
    convId: string,
    attempt: number,
    maxAttempts: number,
    model?: string,
    error?: string | null,
    restoredCheckpoint?: boolean,
  ) => void;
  onCompactionProgress: (
    convId: string,
    stage: ContextCompactionStage,
    error?: string | null,
  ) => void;
  onDone: (
    convId: string,
    assistantMessageId?: string,
    error?: string | null,
    turnId?: string,
  ) => void;
  onFollowUpSuggestions: (
    convId: string,
    assistantMessageId: string,
    suggestions: string[],
  ) => void;
  onNewConversationSuggestions: (
    workspace: string,
    language: "zh" | "en",
    suggestions: string[],
  ) => void;
  onInterrupted: (
    convId: string,
    requestId: string,
    assistantMessageId?: string,
    turnId?: string,
  ) => void;
  onCancelled: (convId: string, assistantMessageId?: string, turnId?: string) => void;
}
