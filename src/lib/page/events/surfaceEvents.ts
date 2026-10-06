import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  disable as disableAutostart,
  enable as enableAutostart,
} from "@tauri-apps/plugin-autostart";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { normalizeConfigShape } from "$lib/config";
import { conversationComposerDraftKey } from "$lib/composerDrafts";
import { tr, setLocale, type Locale } from "$lib/i18n";
import { showToast } from "$lib/toast";
import { DEFAULT_QUICK_CHAT_SHORTCUT, normalizeQuickChatShortcut } from "$lib/quickChatShortcut";
import { replaceQuickChatShortcut } from "$lib/quickChatWindow";
import { desktopOpenAgent as openAgent, invoke } from "$lib/openagent/tauriClient";
import { DEV_MAIN_DEBUG_VISIBILITY_EVENT } from "$lib/devDebugVisibility";
import { ONBOARDING_COMPLETE_EVENT } from "$lib/onboarding";
import { renderMermaidToolResult } from "$lib/streamdown/mermaidRenderer";
import { appendUserInput } from "$lib/chatStream";
import { shouldNotifyAgentPluginUpdates } from "$lib/agentPluginUpdateCheck";
import type { AgentRolesChangedEvent } from "$lib/roleEditorWindow";
import type {
  ChatMessage,
  Conversation,
  AppConfig,
  UserInputRequest,
  StartupBootstrap,
  ProviderAuthDeviceCodeEvent,
  PluginFlowUpdatedEvent,
} from "$lib/types";
import type { WorkspaceRouteResult } from "$lib/page/workspaceNavigation";
import type { PageEventOptions, RegisterPageEvent } from "./context";

/** Registers navigation, settings, plugin, and durable interrupt surface events. */
export function registerSurfaceEvents(options: PageEventOptions, register: RegisterPageEvent) {
  register("agent-plugins-changed", () => {
    void options.refreshAgentCommands();
    void openAgent
      .invokeProduct("list_agent_plugins", {})
      .then((plugins) => {
        options.agentPlugins = plugins;
        return options.checkAgentPluginUpdates();
      })
      .then((report) => {
        const available = report.updates.filter((update) => update.update_available);
        if (!shouldNotifyAgentPluginUpdates(report.updates)) return;
        showToast({
          title: tr("pluginUpdateAvailable"),
          description: tr("pluginUpdateDescription").replace("{count}", String(available.length)),
          durationMs: 6000,
        });
      })
      .catch((error) => console.warn("Failed to refresh Agent Plugins:", error));
  });
  let runtimeResyncInFlight = false;

  register<{ generation: number }>("runtime-resync-required", () => {
    if (runtimeResyncInFlight) return;
    runtimeResyncInFlight = true;
    void (async () => {
      const bootstrap = await openAgent.getStartupBootstrap<StartupBootstrap>();
      await options.applyStartupBootstrap(bootstrap);
      await invoke<number>("start_runtime_event_proxy");
    })()
      .catch((error) => {
        console.error("Failed to restore Runtime state after event resync:", error);
      })
      .finally(() => {
        runtimeResyncInFlight = false;
      });
  });

  register<{
    workspace: string | null;
    conversation_id: string | null;
    message_id: string | null;
    new_conversation: boolean;
  }>("workspace-window-open-request", (event) => {
    const { workspace, conversation_id, message_id, new_conversation } = event.payload;
    void (async () => {
      if (workspace && workspace !== options.workspacePath) {
        await options.routeWorkspace(workspace, {
          conversationId: conversation_id ?? undefined,
          messageId: message_id ?? undefined,
          newConversation: new_conversation,
        });
      } else if (new_conversation) {
        await options.activateNewConversationSurface();
      } else if (conversation_id) {
        await options.revealMemorySource(conversation_id, message_id ?? "");
      }
    })()
      .catch((error) => console.error("Failed to reveal the requested workspace target:", error))
      .finally(() => options.handleWindowFocusEvent(true));
  });

  register<{ visible: boolean }>(DEV_MAIN_DEBUG_VISIBILITY_EVENT, (event) => {
    options.showMainDebugComponents = event.payload.visible;
  });
  register<{ workspace_path: string }>(ONBOARDING_COMPLETE_EVENT, (event) => {
    void (async () => {
      let routeResult: WorkspaceRouteResult = "current";
      if (event.payload.workspace_path && event.payload.workspace_path !== options.workspacePath) {
        routeResult = await options.routeWorkspace(event.payload.workspace_path, {
          newConversation: true,
        });
      }
      if (routeResult !== "routed") await invoke("reveal_main_window");
    })().catch((error) => console.error("Failed to finish onboarding handoff:", error));
  });
  register("settings-changed", () => {
    void options.settingsRequests
      .resolve(() =>
        openAgent.invokeProduct("get_settings", {}).then((value) => value as AppConfig),
      )
      .then((reloaded) => {
        if (!reloaded) return;
        const previousAutostart = options.config?.launch_on_startup ?? false;
        const previousShortcut = normalizeQuickChatShortcut(
          options.config?.quick_chat_shortcut ?? DEFAULT_QUICK_CHAT_SHORTCUT,
        );
        const next = normalizeConfigShape(reloaded as AppConfig);
        const nextShortcut = normalizeQuickChatShortcut(next.quick_chat_shortcut);
        options.config = structuredClone(next);
        void options.refreshAgentCommands();
        options.applyTheme(options.config.theme ?? "system");
        const suggestionLanguage = (options.config.language ?? "zh") as Locale;
        const suggestionWorkspace = options.workspacePath;
        setLocale(suggestionLanguage);
        void options
          .loadNewConversationSuggestions(suggestionWorkspace, suggestionLanguage)
          .then((storedSuggestions) => {
            if (
              suggestionWorkspace === options.workspacePath &&
              suggestionLanguage === (options.config?.language ?? "zh")
            ) {
              options.newConversationSuggestions = storedSuggestions;
            }
          });
        if (previousShortcut !== nextShortcut && !options.launchContext?.workspace) {
          void replaceQuickChatShortcut(nextShortcut).catch((error) =>
            console.error("Failed to apply reloaded quick-chat shortcut:", error),
          );
        }
        if (previousAutostart !== next.launch_on_startup && !options.launchContext?.workspace) {
          const syncAutostart = next.launch_on_startup ? enableAutostart : disableAutostart;
          void syncAutostart().catch((error) =>
            console.error("Failed to apply reloaded autostart setting:", error),
          );
        }
        void openAgent
          .invokeProduct("list_agent_plugins", {})
          .then((plugins) => {
            options.agentPlugins = plugins;
          })
          .catch((error) => console.warn("Failed to refresh plugin lifecycle state:", error));
      })
      .catch((error) => console.error("Failed to apply reloaded settings:", error));
  });
  register<AgentRolesChangedEvent>("agent-roles-changed", (event) => {
    void options.loadAvailableRoles().then(async () => {
      if (event.payload.requesterLabel !== getCurrentWindow().label) return;
      if (
        event.payload.deleted &&
        options.roleController.selectedRoleKey === event.payload.roleId
      ) {
        await options.activateNewConversationSurface(options.defaultRoleKey);
      } else if (event.payload.created && event.payload.roleId) {
        await options.activateNewConversationSurface(event.payload.roleId);
      }
    });
  });
  register<{ conversationId: string }>("settings-open-conversation", (event) => {
    void options.openHookConversation(event.payload.conversationId);
  });
  register("settings-reload-failed", () => {
    showToast({
      title: tr("settingsReloadFailed"),
      description: tr("settingsReloadFailedHint"),
      variant: "error",
    });
  });

  register<{ conv_id: string; title: string }>("conversation-title-updated", (e) => {
    const { conv_id, title } = e.payload;
    void options.applyConversationTitleUpdate(conv_id, title);
  });

  register<{
    task_kind: "title" | "memory" | "hook" | string;
    conv_id?: string | null;
    error: string;
  }>("flash-task-failed", (e) => {
    const taskLabel = {
      title: tr("flashTaskTitle"),
      memory: tr("flashTaskMemory"),
      suggestions: tr("flashTaskSuggestions"),
      hook: tr("flashTaskHook"),
    }[e.payload.task_kind];
    showToast({
      title: taskLabel ? `${tr("flashTaskFailed")} · ${taskLabel}` : tr("flashTaskFailed"),
      description: e.payload.error,
      variant: "error",
    });
  });

  register<ProviderAuthDeviceCodeEvent>("provider-auth-device-code", (event) => {
    const verificationUri = event.payload.verification_uri.trim();
    const userCode = event.payload.user_code.trim();
    if (!verificationUri || !userCode) return;
    showToast({
      title: tr("chatgptOAuthRequired"),
      description: tr("chatgptOAuthCode").replace("{code}", userCode),
      variant: "info",
      durationMs: 0,
      action: {
        label: tr("chatgptOAuthOpen"),
        dismissOnClick: false,
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(userCode);
          } catch {
            // Keep the toast visible so the code can still be copied manually.
          }
          await openExternalUrl(verificationUri);
        },
      },
    });
  });

  register<{
    source_conv_id: string;
    conv_id: string;
    title: string;
    workspace: string;
    user_message_id?: string | null;
  }>("conversation-compacted", (e) => {
    const { source_conv_id, conv_id, title, workspace: ws, user_message_id } = e.payload;
    if (ws !== (options.workspacePath || "")) return;
    const sourceIdx = options.conversations.findIndex(
      (conversation) => conversation.id === source_conv_id,
    );
    if (
      sourceIdx === -1 ||
      options.conversations.some((conversation) => conversation.id === conv_id)
    )
      return;

    const source = options.conversations[sourceIdx];
    const movedMessages = user_message_id
      ? source.messages.filter((message) => message.id === user_message_id)
      : [];
    options.conversations[sourceIdx] = {
      ...source,
      messages: user_message_id
        ? source.messages.filter((message) => message.id !== user_message_id)
        : source.messages,
    };
    const derived: Conversation = {
      id: conv_id,
      title,
      messages: movedMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentConvId: source_conv_id,
      compactedFromConvId: source_conv_id,
    };
    options.conversations = [derived, ...options.conversations];
    options.loadedConvIds.add(conv_id);

    if (options.chatStreams.streamingConversationIds[source_conv_id]) {
      const { [source_conv_id]: _old, ...rest } = options.chatStreams.streamingConversationIds;
      options.chatStreams.streamingConversationIds = { ...rest, [conv_id]: true };
    }
    if (source_conv_id in options.chatStreams.itemsByConversation) {
      const { [source_conv_id]: old, ...rest } = options.chatStreams.itemsByConversation;
      options.chatStreams.itemsByConversation = { ...rest, [conv_id]: old };
    }
    if (source_conv_id in options.chatStreams.assistantMessageIds) {
      const { [source_conv_id]: old, ...rest } = options.chatStreams.assistantMessageIds;
      options.chatStreams.assistantMessageIds = { ...rest, [conv_id]: old };
    }
    if (source_conv_id in options.chatStreams.awaitingOutput) {
      const { [source_conv_id]: old, ...rest } = options.chatStreams.awaitingOutput;
      options.chatStreams.awaitingOutput = { ...rest, [conv_id]: old };
    }
    if (source_conv_id in options.chatStreams.memoryRetrievalStages) {
      const { [source_conv_id]: old, ...rest } = options.chatStreams.memoryRetrievalStages;
      options.chatStreams.memoryRetrievalStages = { ...rest, [conv_id]: old };
    }
    if (source_conv_id in options.chatStreams.memoryRetrievalSkippable) {
      const { [source_conv_id]: old, ...rest } = options.chatStreams.memoryRetrievalSkippable;
      options.chatStreams.memoryRetrievalSkippable = { ...rest, [conv_id]: old };
    }
    if (options.compactionOnlyConvIds.delete(source_conv_id)) {
      options.compactionOnlyConvIds.add(conv_id);
    }
    const compactionRevision = options.compactionProgressRevisions.get(source_conv_id);
    if (compactionRevision !== undefined) {
      options.compactionProgressRevisions.delete(source_conv_id);
      options.compactionProgressRevisions.set(conv_id, compactionRevision);
    }
    if (options.activeConvId === source_conv_id) {
      if (options.selectedComposerDraftKey === conversationComposerDraftKey(source_conv_id)) {
        options.composerDrafts.save(options.selectedComposerDraftKey, options.activeComposerDraft);
      }
      const remappedDraft = options.composerDrafts.remap(
        conversationComposerDraftKey(source_conv_id),
        conversationComposerDraftKey(conv_id),
      );
      if (options.selectedComposerDraftKey === conversationComposerDraftKey(source_conv_id)) {
        options.selectedComposerDraftKey = conversationComposerDraftKey(conv_id);
        options.activeComposerDraft = remappedDraft;
      }
      options.activeConvId = conv_id;
      options.cacheRestoreSurface("conversation", conv_id);
      openAgent
        .invokeProduct("set_active_conversation", {
          convId: conv_id,
          workspace: options.workspacePath || "",
        })
        .catch(() => {});
    }
  });

  // subagent-started: a delegated role or package scheduler created a child conversation
  register<{
    parent_conv_id: string | null;
    sub_conv_id: string;
    title: string;
    task: string;
    role_id?: string;
    task_msg_id: string;
    asst_msg_id?: string;
    branch_id?: string;
    workspace: string;
    hidden_task?: boolean;
    flow_kind?: string;
    started?: boolean;
  }>("subagent-started", (e) => {
    const {
      sub_conv_id,
      title,
      task,
      role_id,
      task_msg_id,
      asst_msg_id,
      branch_id,
      workspace: ws,
      parent_conv_id,
      hidden_task,
      flow_kind,
      started,
    } = e.payload;
    // Only show sub-convs that belong to the current workspace
    if (ws !== (options.workspacePath || "")) return;
    // Avoid duplicates (event can fire once per spawn)
    if (options.conversations.some((c) => c.id === sub_conv_id)) return;
    // Rust already persisted this message; reuse its ID for display
    const taskMsg: ChatMessage = {
      id: task_msg_id,
      role: "user",
      content: task,
      timestamp: Date.now(),
    };
    const subConv: Conversation = {
      id: sub_conv_id,
      title,
      messages: hidden_task ? [] : [taskMsg],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentConvId: parent_conv_id ?? undefined,
      roleId: role_id,
      flowKind: flow_kind,
      flowStatus: started === false ? "pending" : flow_kind ? "running" : undefined,
    };
    options.conversations = [subConv, ...options.conversations];
    options.loadedConvIds.add(sub_conv_id);
    if (started !== false) {
      options.chatStreams.streamingConversationIds = {
        ...options.chatStreams.streamingConversationIds,
        [sub_conv_id]: true,
      };
    }
    options.chatStreams.itemsByConversation = {
      ...options.chatStreams.itemsByConversation,
      [sub_conv_id]: [],
    };
    options.chatStreams.assistantMessageIds = {
      ...options.chatStreams.assistantMessageIds,
      [sub_conv_id]: asst_msg_id ?? crypto.randomUUID(),
    };
    if (branch_id) {
      options.activeBranchIds = { ...options.activeBranchIds, [sub_conv_id]: branch_id };
    }
    if (started !== false) options.chatStreams.startTiming(sub_conv_id, taskMsg.timestamp);
  });

  // ask_user tool: backend emits with conv_id + form schema; we stash it per-conv
  // so switching convs doesn't lose an in-flight form.
  register<UserInputRequest>("chat-user-input-request", (e) => {
    const req = e.payload;
    const key = req.conv_id ?? options.activeConvId;
    if (!key) return;
    options.pendingUserInputs = { ...options.pendingUserInputs, [key]: req };
    if (!options.attachPendingUserInputToMessages(key, req)) {
      options.chatStreams.itemsByConversation = {
        ...options.chatStreams.itemsByConversation,
        [key]: appendUserInput(options.chatStreams.itemsByConversation[key] ?? [], req),
      };
    }
    options.persistStreamDraft(key).catch(() => {});
  });
  if (!options.isDevInspectorWindow) {
    register<{
      request_id: string;
      conv_id: string;
      title?: string | null;
      source: string;
    }>("chat-mermaid-render-request", (e) => {
      const request = e.payload;
      const result = renderMermaidToolResult(request.source, options.mermaidConfig).then(
        JSON.stringify,
      );
      void result
        .then((renderResult) =>
          openAgent.submitInterruptResponse({
            convId: request.conv_id,
            interruptId: request.request_id,
            response: renderResult,
          }),
        )
        .catch((error) => {
          console.warn("Failed to return Mermaid render result", error);
        });
    });
  }
  register<{
    conv_id: string;
    flow_id: string;
    iteration: number;
    message: string;
    msg_id: string;
    asst_msg_id?: string;
    hidden_message?: boolean;
  }>("plugin-flow-iteration-started", (e) => {
    const { conv_id, flow_id, message, msg_id, asst_msg_id, hidden_message } = e.payload;
    const userMsg: ChatMessage = {
      id: msg_id,
      role: "user",
      content: message,
      timestamp: Date.now(),
    };
    const idx = options.conversations.findIndex((c) => c.id === conv_id);
    if (idx !== -1) {
      const existing = options.conversations[idx];
      const shouldAppendUser =
        !hidden_message && !existing.messages.some((message) => message.id === msg_id);
      options.conversations[idx] = {
        ...existing,
        flowKind: flow_id,
        flowStatus: "running",
        messages: shouldAppendUser ? [...existing.messages, userMsg] : existing.messages,
        updatedAt: Date.now(),
      };
    }
    options.chatStreams.streamingConversationIds = {
      ...options.chatStreams.streamingConversationIds,
      [conv_id]: true,
    };
    options.chatStreams.itemsByConversation = {
      ...options.chatStreams.itemsByConversation,
      [conv_id]: [],
    };
    options.chatStreams.assistantMessageIds = {
      ...options.chatStreams.assistantMessageIds,
      [conv_id]: asst_msg_id ?? crypto.randomUUID(),
    };
    options.chatStreams.startTiming(conv_id, Date.now());
  });

  register<PluginFlowUpdatedEvent>("plugin-flow-updated", (e) => {
    const { conv_id, flow_id, status } = e.payload;
    options.applyLiveCheckpointFlow(conv_id, e.payload);
    const eventBranchId = e.payload.branch_id ?? null;
    const activeBranchId = options.activeBranchIds[conv_id] ?? null;
    if (eventBranchId !== activeBranchId) return;
    const idx = options.conversations.findIndex((c) => c.id === conv_id);
    if (idx !== -1) {
      options.conversations[idx] = {
        ...options.conversations[idx],
        flowKind: flow_id,
        flowStatus: status,
        updatedAt: Date.now(),
      };
    }
  });
}
