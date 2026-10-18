import type {
  AgentCommandSpec,
  InputQueueAction,
  InputQueueSnapshot,
  BackgroundTerminalKillResult,
  BackgroundTerminalReadResult,
  BackgroundTerminalSession,
  BackgroundTerminalWriteResult,
  ChatEventHandlers,
  DesktopProductCommand,
  DesktopProductCommandMap,
  AttachmentPreviewPayload,
  ForkRemoteRunRequest,
  RemoteConversation,
  RemoteConversationState,
  RemoteConversationMeta,
  RemoteConversationHistory,
  RemoteModel,
  RemotePreferences,
  RemoteWorkspace,
  ResumeInterruptedChatRequest,
  SubmitAgentInputOutcome,
  SubmitAgentInputRequest,
  SubmitInterruptResponseRequest,
  WorkspaceMediaSource,
  WorkspaceTextSnippet,
} from "./contracts";
import type { AgentRole, AgentPluginInstallProgress, ChatAttachment, ConvPatch } from "./types";
import type { OpenAgentTransport, Unsubscribe } from "./transport";

export class OpenAgentClient {
  constructor(private readonly transport: OpenAgentTransport) {}

  onAgentPluginInstallProgress(
    handler: (progress: AgentPluginInstallProgress) => void,
  ): Promise<Unsubscribe> {
    return this.transport.subscribe("plugin.install_progress", handler);
  }

  getStartupBootstrap<Response>(): Promise<Response> {
    return this.transport.request("product.get_startup_bootstrap", {}) as Promise<Response>;
  }

  invokeProduct<Command extends DesktopProductCommand>(
    operation: Command,
    args: DesktopProductCommandMap[Command]["request"],
  ): Promise<DesktopProductCommandMap[Command]["response"]> {
    return this.transport.request("product.invoke_desktop", {
      operation,
      args: args as Record<string, unknown>,
    }) as Promise<DesktopProductCommandMap[Command]["response"]>;
  }

  listBackgroundTerminals(): Promise<BackgroundTerminalSession[]> {
    return this.invokeProduct("list_background_terminals", {});
  }

  readBackgroundTerminal(
    sessionId: string,
    fromByte?: number,
  ): Promise<BackgroundTerminalReadResult> {
    return this.invokeProduct("read_background_terminal", { sessionId, fromByte });
  }

  writeBackgroundTerminal(
    sessionId: string,
    data: string,
    appendNewline = true,
  ): Promise<BackgroundTerminalWriteResult> {
    return this.invokeProduct("write_background_terminal", {
      sessionId,
      data,
      appendNewline,
    });
  }

  killBackgroundTerminal(sessionId: string): Promise<BackgroundTerminalKillResult> {
    return this.invokeProduct("kill_background_terminal", { sessionId });
  }

  submitInput(request: SubmitAgentInputRequest): Promise<SubmitAgentInputOutcome> {
    return this.transport.request("agent.submit_input", request);
  }

  getInputQueue(convId: string): Promise<InputQueueSnapshot> {
    return this.transport.request("conversation.get_input_queue", { convId });
  }

  onInputQueueChanged(handler: (convId: string) => void): Promise<Unsubscribe> {
    return this.transport.subscribe("chat.input_queue_changed", ({ conv_id }) => handler(conv_id));
  }

  mutateInputQueue(convId: string, action: InputQueueAction): Promise<InputQueueSnapshot> {
    return this.transport.request("conversation.mutate_input_queue", { convId, action });
  }

  invokeLocal<Response>(command: string, args?: Record<string, unknown>): Promise<Response> {
    if (!this.transport.invokeLocal) {
      return Promise.reject(
        new Error("This transport does not provide local desktop capabilities"),
      );
    }
    return this.transport.invokeLocal<Response>(command, args);
  }

  listenLocal<Payload>(
    event: string,
    handler: (event: { payload: Payload }) => void,
  ): Promise<Unsubscribe> {
    if (!this.transport.listenLocal) {
      return Promise.reject(new Error("This transport does not provide local desktop events"));
    }
    return this.transport.listenLocal<Payload>(event, handler);
  }

  emitLocal<Payload>(event: string, payload?: Payload): Promise<void> {
    if (!this.transport.emitLocal) {
      return Promise.reject(new Error("This transport does not provide local desktop events"));
    }
    return this.transport.emitLocal(event, payload);
  }

  resumeInterrupt(request: ResumeInterruptedChatRequest): Promise<void> {
    return this.transport.request("agent.resume_interrupt", request);
  }

  submitInterruptResponse(request: SubmitInterruptResponseRequest): Promise<void> {
    return this.transport.request("agent.submit_interrupt_response", request);
  }

  restoreRemoteSession(): Promise<boolean> {
    return this.transport.request("gateway.restore_session", {});
  }
  readConversationUiAsset(convId: string, plugin_id: string, entry: string) {
    return this.transport.request("conversation.read_ui_asset", { convId, plugin_id, entry });
  }

  setConversationUiProps(
    request: DesktopProductCommandMap["set_conversation_ui_props"]["request"],
  ) {
    return this.transport.request("conversation.set_ui_props", request);
  }

  pairRemoteGateway(code: string): Promise<void> {
    return this.transport.request("gateway.pair", { code });
  }

  listRemoteWorkspaces(): Promise<RemoteWorkspace[]> {
    return this.transport.request("gateway.list_workspaces", {});
  }

  listRemoteRoles(workspaceId: string): Promise<AgentRole[]> {
    return this.transport.request("gateway.list_roles", { workspaceId });
  }

  listRemoteWorkspaceFiles(workspaceId: string, query?: string): Promise<string[]> {
    return this.transport.request("gateway.list_workspace_files", { workspaceId, query });
  }

  listRemoteModels(): Promise<RemoteModel[]> {
    return this.transport.request("gateway.list_models", {});
  }

  listAgentCommands(): Promise<AgentCommandSpec[]> {
    return this.transport.request("gateway.list_commands", {});
  }

  /** Invoke a tool owned by an installed Agent Plugin through the generic
   * application/plugin boundary. The package's MCP result envelope is
   * returned unchanged so each package keeps its own result schema. */
  callAgentPluginTool(
    pluginId: string,
    toolName: string,
    arguments_: Record<string, unknown> = {},
  ): Promise<unknown> {
    return this.invokeProduct("call_agent_plugin_tool", {
      plugin_id: pluginId,
      tool_name: toolName,
      arguments: arguments_,
    });
  }

  listAgentPlugins(): Promise<import("./types").AgentPluginSummary[]> {
    return this.invokeProduct("list_agent_plugins", {});
  }

  refreshLocalAgentPlugins(id?: string): Promise<import("./types").LocalPluginRefreshReport> {
    return this.invokeProduct("refresh_local_agent_plugins", id ? { id } : {});
  }

  listAgentPluginMarketplaces(): Promise<import("./types").AgentPluginMarketplaceSummary[]> {
    return this.invokeProduct("list_agent_plugin_marketplaces", {});
  }

  installMarketplaceAgentPlugin(
    marketplacePath: string,
    pluginName: string,
  ): Promise<import("./types").AgentPluginSummary> {
    return this.invokeProduct("install_marketplace_agent_plugin", {
      marketplace_path: marketplacePath,
      plugin_name: pluginName,
    });
  }

  installOfficialAgentPlugin(
    pluginId: string,
    displayName: string,
    sourceUrl: string,
  ): Promise<import("./types").AgentPluginSummary> {
    return this.invokeProduct("install_official_agent_plugin", {
      plugin_id: pluginId,
      display_name: displayName,
      source_url: sourceUrl,
    });
  }

  checkAgentPluginUpdates(): Promise<import("./types").AgentPluginUpdateReport> {
    return this.invokeProduct("check_agent_plugin_updates", {});
  }

  updateAgentPlugin(id: string): Promise<import("./types").AgentPluginSummary> {
    return this.invokeProduct("update_agent_plugin", { id });
  }

  installAgentPlugin(source: string): Promise<import("./types").AgentPluginSummary> {
    return this.invokeProduct("install_agent_plugin", { source });
  }

  uninstallAgentPlugin(id: string): Promise<void> {
    return this.invokeProduct("uninstall_agent_plugin", { id });
  }

  readAgentPluginAsset(
    pluginId: string,
    entry: string,
  ): Promise<{ content: string; mime: string; encoding?: "base64" }> {
    return this.invokeProduct("read_agent_plugin_asset", { plugin_id: pluginId, entry });
  }

  getRemotePreferences(): Promise<RemotePreferences> {
    return this.transport.request("gateway.get_preferences", {});
  }

  listRemoteConversations(workspaceId: string): Promise<RemoteConversationMeta[]> {
    return this.transport.request("conversation.list_remote", { workspaceId });
  }

  createRemoteConversation(
    workspaceId: string,
    roleId: string | null,
  ): Promise<RemoteConversation> {
    return this.transport.request("conversation.create_remote", { workspaceId, roleId });
  }

  getRemoteConversationState(convId: string): Promise<RemoteConversationState> {
    return this.transport.request("conversation.get_remote_state", { convId });
  }

  getRemoteConversationHistory(convId: string): Promise<RemoteConversationHistory> {
    return this.transport.request("conversation.get_remote_history", { convId });
  }

  switchRemoteConversationBranch(convId: string, checkpointId: string): Promise<void> {
    return this.transport.request("conversation.switch_remote_branch", { convId, checkpointId });
  }

  forkRemoteConversationRun(request: ForkRemoteRunRequest): Promise<SubmitAgentInputOutcome> {
    return this.transport.request("conversation.fork_remote_run", request);
  }

  updateRemoteConversation(convId: string, patch: ConvPatch): Promise<void> {
    return this.transport.request("conversation.update_remote", { convId, patch });
  }

  deleteRemoteConversation(convId: string): Promise<void> {
    return this.transport.request("conversation.delete_remote", { convId });
  }

  cancelRemoteConversation(convId: string): Promise<void> {
    return this.transport.request("conversation.cancel_remote", { convId });
  }

  setConversationStreamPaused(convId: string, paused: boolean): Promise<void> {
    return this.transport.request("conversation.set_stream_paused", { convId, paused });
  }

  skipMemoryRetrieval(convId: string): Promise<void> {
    return this.transport.request("conversation.skip_memory_retrieval", { convId });
  }

  uploadRemoteAttachment(name: string, contentBase64: string): Promise<ChatAttachment> {
    return this.transport.request("attachment.upload_remote", { name, contentBase64 });
  }

  getRemoteAttachmentPreview(blobId: string, name: string): Promise<AttachmentPreviewPayload> {
    return this.transport.request("attachment.get_remote_preview", { blobId, name });
  }

  repairAttachmentBlob(blobId: string, name: string, contentBase64: string): Promise<void> {
    return this.transport.request("attachment.repair_blob", { blobId, name, contentBase64 });
  }

  openWorkspacePath(path: string, convId?: string): Promise<void> {
    return this.transport.request("workspace.open_path", { path, convId });
  }

  readWorkspaceTextSnippet(
    path: string,
    startLine: number,
    endLine: number,
    convId?: string,
  ): Promise<WorkspaceTextSnippet> {
    return this.transport.request("workspace.read_text_snippet", {
      path,
      startLine,
      endLine,
      convId,
    });
  }

  resolveWorkspaceMedia(
    path: string,
    kind: "image" | "video",
    convId?: string,
  ): Promise<WorkspaceMediaSource> {
    return this.transport.request("workspace.resolve_media", { path, kind, convId });
  }

  subscribeToConversationState(
    convId: string,
    onState: (state: RemoteConversationState) => void,
    onError?: () => void,
  ): Promise<Unsubscribe> {
    return this.transport.subscribe("conversation.state", onState, {
      conversationId: convId,
      onError,
    });
  }

  async subscribeToChatEvents(handlers: ChatEventHandlers): Promise<Unsubscribe> {
    const subscriptions = await Promise.all([
      this.transport.subscribe("chat.input_consumed", (event) => handlers.onInputConsumed(event)),
      this.transport.subscribe("chat.run_started", (event) => handlers.onRunStarted(event)),
      this.transport.subscribe("chat.response_started", ({ conv_id }) =>
        handlers.onResponseStarted(conv_id),
      ),
      this.transport.subscribe("chat.model_usage", ({ conv_id, usage, turn }) =>
        handlers.onModelUsage(conv_id, usage, turn),
      ),
      this.transport.subscribe("chat.memory_retrieval", ({ conv_id, stage }) =>
        handlers.onMemoryRetrieval(conv_id, stage),
      ),
      this.transport.subscribe("chat.chunk", ({ conv_id, text }) =>
        handlers.onChunk(conv_id, text),
      ),
      this.transport.subscribe("chat.thinking_chunk", ({ conv_id, text }) =>
        handlers.onThinkingChunk(conv_id, text),
      ),
      this.transport.subscribe("chat.tool_call", ({ conv_id, name, args, tool_use_id, mcp_ui }) =>
        handlers.onToolCall(conv_id, name, args, tool_use_id, mcp_ui),
      ),
      this.transport.subscribe(
        "chat.tool_result",
        ({ conv_id, result, tool_use_id, mcp_ui, image_attachments }) =>
          handlers.onToolResult(conv_id, result, tool_use_id, mcp_ui, image_attachments),
      ),
      this.transport.subscribe("chat.file_change", ({ conv_id, change, branch_id }) =>
        handlers.onFileChange(conv_id, change, branch_id),
      ),
      this.transport.subscribe("chat.checkpoint", ({ conv_id, checkpoint_id, branch_id }) =>
        handlers.onCheckpoint(conv_id, checkpoint_id, branch_id),
      ),
      this.transport.subscribe(
        "chat.retry",
        ({ conv_id, attempt, max_attempts, model, error, restored_checkpoint }) =>
          handlers.onRetry(conv_id, attempt, max_attempts, model, error, restored_checkpoint),
      ),
      this.transport.subscribe("chat.compaction_progress", ({ conv_id, stage, error }) =>
        handlers.onCompactionProgress(conv_id, stage, error),
      ),
      this.transport.subscribe("chat.done", ({ conv_id, asst_msg_id, turn_id, error }) =>
        handlers.onDone(conv_id, asst_msg_id ?? undefined, error, turn_id ?? undefined),
      ),
      this.transport.subscribe(
        "chat.follow_up_suggestions",
        ({ conv_id, asst_msg_id, suggestions }) =>
          handlers.onFollowUpSuggestions(conv_id, asst_msg_id, suggestions),
      ),
      this.transport.subscribe(
        "conversation.new_suggestions",
        ({ workspace, language, suggestions }) =>
          handlers.onNewConversationSuggestions(workspace, language, suggestions),
      ),
      this.transport.subscribe(
        "chat.interrupted",
        ({ conv_id, request_id, asst_msg_id, turn_id }) =>
          handlers.onInterrupted(
            conv_id,
            request_id,
            asst_msg_id ?? undefined,
            turn_id ?? undefined,
          ),
      ),
      this.transport.subscribe("chat.cancelled", ({ conv_id, asst_msg_id, turn_id }) =>
        handlers.onCancelled(conv_id, asst_msg_id ?? undefined, turn_id ?? undefined),
      ),
    ]);

    return () => {
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  }
}
