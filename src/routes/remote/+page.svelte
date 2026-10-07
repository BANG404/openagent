<script lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import { onMount } from "svelte";
  import ChatQueue from "$lib/components/ChatQueue.svelte";
  import ConversationList from "$lib/components/ConversationList.svelte";
  import FileChangeBanner from "$lib/components/FileChangeBanner.svelte";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import MessageInput from "$lib/components/MessageInput.svelte";
  import type { SlashCommand } from "$lib/composer/types";
  import MessageList from "$lib/components/MessageList.svelte";
  import NewConversationContext from "$lib/components/NewConversationContext.svelte";
  import RoleSelector from "$lib/components/RoleSelector.svelte";
  import SidebarCollapseButton from "$lib/components/SidebarCollapseButton.svelte";
  import SidebarPrimaryActions from "$lib/components/SidebarPrimaryActions.svelte";
  import SidebarResizeHandle from "$lib/components/SidebarResizeHandle.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import ToolApprovalActions from "$lib/components/ToolApprovalActions.svelte";
  import UserInputForm from "$lib/components/UserInputForm.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import ScrollArea from "$lib/components/ui/ScrollArea.svelte";
  import {
    checkpointRecordsToMessages,
    ckIdsAlongActivePath,
    computeActivePath,
  } from "$lib/checkpointTree";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import { setLocale, locale, t, tr, type Locale, type TranslationKeys } from "$lib/i18n";
  import { pluginCommandText } from "$lib/pluginI18n";
  import { renderMermaidToolResult } from "$lib/streamdown/mermaidRenderer";
  import { resolveUserInput } from "$lib/chatStream";
  import { encodeModelBinding } from "$lib/modelBinding";
  import {
    projectCurrentFileChanges,
    remoteConversationMetaToConversation,
  } from "$lib/remoteConversationProjection";
  import type {
    ChatAttachment,
    ChatMessage,
    StreamItem,
    UserInputRequest,
    UserMessageContext,
  } from "$lib/types";
  import {
    OpenAgentClient,
    type AgentCommandSpec,
    interruptRequest,
    provideOpenAgentUiCapabilities,
    type RemoteConversationState,
    type RemoteInterrupt,
    type RemoteModel,
    type RemoteWorkspace,
  } from "$lib/openagent";
  import { createRemoteExecutionController } from "$lib/remote/execution.svelte";
  import { createRemoteHistoryController } from "$lib/remote/history.svelte";
  import { createRemoteCatalogController } from "$lib/remote/catalog.svelte";
  import { createRemoteAttachmentController } from "$lib/remote/attachments";
  import { createRemoteConnectionController } from "$lib/remote/connection";
  import { HttpTransport } from "$lib/openagent/httpTransport";
  import {
    clampSidebarWidth,
    loadSidebarWidth,
    saveSidebarWidth,
    sidebarWidthForViewportRatio,
  } from "$lib/sidebarSizing";
  import { NEW_CONVERSATION_GREETING } from "$lib/newConversation";

  type Screen = "loading" | "pair" | "chat";
  const openAgentIconUrl = "/app-icon.png";
  const client = new OpenAgentClient(new HttpTransport());

  let screen = $state<Screen>("loading");
  let pairingCode = $state("");
  let workspaces = $state<RemoteWorkspace[]>([]);

  let remoteModels = $state<RemoteModel[]>([]);
  let agentCommandSpecs = $state<AgentCommandSpec[]>([]);
  let selectedModel = $state("");

  let conversationSearchQuery = $state("");
  let conversation = $state<RemoteConversationState | null>(null);

  let instruction = $state("");
  let attachments = $state<ChatAttachment[]>([]);
  let contexts = $state<UserMessageContext[]>([]);
  let composerFocusRequest = $state(0);
  let busy = $state(false);

  let error = $state("");
  let commandNotice = $state("");
  let inputAreaHeight = $state(120);
  let messagesEl = $state<HTMLElement | null>(null);
  let isDarkTheme = $state(false);
  let preferredTheme = $state<"system" | "light" | "dark">("system");
  let messageLayout = $state<"single" | "responsive_double">("single");
  let messageDoubleColumnMinWidth = $state(1200);
  let bookModeFontSize = $state(17);
  let sidebarCollapsed = $state(false);
  let sidebarWidth = $state(loadSidebarWidth());
  let viewportWidth = typeof window === "undefined" ? 1 : Math.max(window.innerWidth, 1);
  let sidebarWidthRatio = 0;
  let sidebarResizing = $state(false);
  const handledMermaidInterrupts = new Set<string>();
  const remoteExecution = createRemoteExecutionController({
    client,
    get conversation() {
      return conversation;
    },
    set conversation(next) {
      conversation = next;
    },
    get instruction() {
      return instruction;
    },
    set instruction(next) {
      instruction = next;
    },
    get attachments() {
      return attachments;
    },
    set attachments(next) {
      attachments = next;
    },
    get contexts() {
      return contexts;
    },
    set contexts(next) {
      contexts = next;
    },
    get selectedModel() {
      return selectedModel;
    },
    set selectedModel(next) {
      selectedModel = next;
    },
    get busy() {
      return busy;
    },
    set busy(next) {
      busy = next;
    },
    get error() {
      return error;
    },
    set error(next) {
      error = next;
    },
    get commandNotice() {
      return commandNotice;
    },
    set commandNotice(next) {
      commandNotice = next;
    },
    get activeInterrupt() {
      return activeInterrupt;
    },
    get running() {
      return running;
    },
    get projectedMessages() {
      return projectedMessages;
    },
    get remoteHistory() {
      return remoteHistory;
    },
    createConversation: () => createConversation(),
    loadConversationHistory: (convId) => loadConversationHistory(convId),
    perform: (action) => perform(action),
  });
  const sendInstruction = remoteExecution.sendInstruction;
  const sendNextQueuedMessage = remoteExecution.sendNextQueuedMessage;
  const removeQueuedMessage = remoteExecution.removeQueuedMessage;
  const clearQueuedMessages = remoteExecution.clearQueuedMessages;
  const commitEdit = remoteExecution.commitEdit;
  const reExecute = remoteExecution.reExecute;
  const stopMessage = remoteExecution.stopMessage;
  const setStreamPaused = remoteExecution.setStreamPaused;
  const answer = remoteExecution.answer;
  const cancelAnswer = remoteExecution.cancelAnswer;
  const cancelInlineInterrupt = remoteExecution.cancelInlineInterrupt;
  const approve = remoteExecution.approve;

  function addQuote(context: UserMessageContext) {
    if (
      contexts.some(
        (item) => item.text === context.text && item.sourceMessageId === context.sourceMessageId,
      )
    ) {
      composerFocusRequest += 1;
      return;
    }
    if (contexts.length >= 8) {
      error = tr("quotedContextLimit");
      return;
    }
    contexts = [...contexts, context];
    composerFocusRequest += 1;
  }

  function resizeSidebar(width: number): void {
    sidebarWidth = clampSidebarWidth(width);
    sidebarWidthRatio = sidebarWidth / viewportWidth;
  }

  function resetConversation() {
    remoteConnection.reset();
    conversation = null;
    remoteHistory.reset();
    remoteExecution.optimisticUser = null;
    remoteExecution.pendingAssistantMessageId = null;
    remoteExecution.streamPaused = false;
    remoteExecution.forkDisplayMessages = null;
    remoteExecution.resolvingInterrupts = {};
    error = "";
  }
  const remoteHistory = createRemoteHistoryController({
    client,
    get conversation() {
      return conversation;
    },
    set conversation(next) {
      conversation = next;
    },
    get running() {
      return running;
    },
    get messagesEl() {
      return messagesEl;
    },
    perform,
  });
  const loadConversationHistory = remoteHistory.load;
  const switchBranch = remoteHistory.switchBranch;
  const revertFileChange = remoteHistory.revertFileChange;
  const remoteCatalog = createRemoteCatalogController({
    client,
    get running() {
      return running;
    },
    activeConversationId: () => conversation?.conv_id ?? null,
    resetConversation,
    connectConversation: (id) => remoteConnection.connect(id),
    newConversation,
    perform,
    onError(cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    },
  });
  const loadWorkspace = remoteCatalog.loadWorkspace;
  const refreshConversations = remoteCatalog.refreshConversations;
  const loadRemoteMentionItems = remoteCatalog.loadMentionItems;
  const createConversation = remoteCatalog.createConversation;
  const selectConversation = remoteCatalog.selectConversation;
  const togglePin = remoteCatalog.togglePin;
  const deleteConversation = remoteCatalog.deleteConversation;
  const changeRole = remoteCatalog.changeRole;

  const remoteAttachments = createRemoteAttachmentController({ client, activeConversationId });
  const uploadAttachments = remoteAttachments.uploadAttachments;
  provideOpenAgentUiCapabilities(remoteAttachments.capabilities);

  function activeConversationId(): string {
    if (!conversation) throw new Error(tr("remoteSelectConversationFirst"));
    return conversation.conv_id;
  }

  const activeInterrupt = $derived(conversation?.interrupts[0] ?? null);
  const running = $derived(
    conversation?.phase === "before_completion" ||
      remoteExecution.pendingAssistantMessageId !== null ||
      Object.keys(remoteExecution.resolvingInterrupts).length > 0,
  );
  const projectedMessages = $derived.by(() => {
    let projected: ChatMessage[];
    if (remoteExecution.forkDisplayMessages) projected = remoteExecution.forkDisplayMessages;
    else if (!running && remoteHistory.activeTree) {
      const path = computeActivePath(remoteHistory.activeTree);
      projected =
        path.length > 0
          ? path
          : conversation
            ? checkpointRecordsToMessages(
                conversation.messages,
                conversation.checkpoint_id ?? "remote-live",
                conversation.conv_id,
              )
            : [];
    } else {
      projected = conversation
        ? checkpointRecordsToMessages(
            conversation.messages,
            conversation.checkpoint_id ?? "remote-live",
            conversation.conv_id,
          )
        : [];
    }
    return Object.entries(remoteExecution.resolvingInterrupts).reduce(
      (messages, [requestId, resolution]) =>
        messages.map((message) =>
          message.items?.some(
            (item) =>
              (item.type === "user_input" && item.request.request_id === requestId) ||
              (item.type === "tool_call" && item.approval?.request.request_id === requestId),
          )
            ? {
                ...message,
                items: resolveUserInput(
                  message.items,
                  requestId,
                  resolution.state,
                  resolution.response,
                ),
              }
            : message,
        ),
      projected,
    );
  });
  const liveAssistant = $derived.by(() => {
    if (!running) return null;
    if (remoteExecution.pendingAssistantMessageId) {
      return (
        projectedMessages.find(
          (message) => message.id === remoteExecution.pendingAssistantMessageId,
        ) ?? null
      );
    }
    return [...projectedMessages].reverse().find((message) => message.role === "assistant") ?? null;
  });
  const messages = $derived.by(() => {
    const durable = liveAssistant
      ? projectedMessages.filter((message) => message.id !== liveAssistant.id)
      : projectedMessages;
    return remoteExecution.optimisticUser &&
      !durable.some((message) => message.id === remoteExecution.optimisticUser?.id)
      ? [...durable, remoteExecution.optimisticUser]
      : durable;
  });
  const currentStreamMessageId = $derived(
    running ? (liveAssistant?.id ?? remoteExecution.pendingAssistantMessageId) : null,
  );
  const currentStreamItems = $derived.by<StreamItem[]>(() => {
    if (!liveAssistant) return [];
    return liveAssistant.items?.length
      ? liveAssistant.items
      : liveAssistant.content
        ? [{ type: "text", content: liveAssistant.content }]
        : [];
  });
  const newConversationLayout = $derived(
    Boolean(remoteCatalog.workspaceId) &&
      !remoteCatalog.loadingWorkspace &&
      !remoteCatalog.loadingConversationId &&
      !conversation &&
      messages.length === 0,
  );
  const selectedConversationId = $derived(
    remoteCatalog.loadingConversationId ?? conversation?.conv_id ?? null,
  );
  const hasInlineInterrupt = $derived.by(() =>
    projectedMessages.some((message) =>
      message.items?.some(
        (item) =>
          (item.type === "user_input" &&
            item.state === "pending" &&
            item.request.request_id === activeInterrupt?.id) ||
          (item.type === "tool_call" &&
            item.approval?.state === "pending" &&
            item.approval.request.request_id === activeInterrupt?.id),
      ),
    ),
  );
  const conversations = $derived(
    remoteCatalog.remoteConversationMetas.map(remoteConversationMetaToConversation),
  );
  const currentFileChanges = $derived.by(() => {
    const activeCheckpoints = remoteHistory.activeTree
      ? ckIdsAlongActivePath(remoteHistory.activeTree)
      : new Set<string>();
    return projectCurrentFileChanges(remoteHistory.fileChanges, activeCheckpoints);
  });
  const streamingConvIds = $derived(
    conversation && running ? { [conversation.conv_id]: true } : {},
  );
  const modelOptions = $derived(
    remoteModels.map((item) => ({
      value: encodeModelBinding(item.provider_id, item.model),
      label: `${item.provider_name} · ${item.model}`,
      selectedLabel: item.model,
    })),
  );
  const slashCommands = $derived.by<SlashCommand[]>(() => {
    const seen = new Set<string>();
    return agentCommandSpecs.flatMap((spec) => {
      // A package command whose id equals its package id has both a short
      // route and a fully-qualified route. The catalog exposes one palette
      // entry, just like the desktop surface.
      const normalizedName = spec.name.replace(/^\/+/, "");
      const catalogKey =
        spec.plugin_id &&
        (normalizedName === spec.plugin_id ||
          normalizedName === `${spec.plugin_id}:${spec.plugin_id}`)
          ? spec.plugin_id
          : normalizedName;
      if (seen.has(catalogKey)) return [];
      seen.add(catalogKey);
      const run = remoteSlashCommandRun(spec.name);
      const insertText = spec.plugin_id ? `/${catalogKey}` : undefined;
      if (!run && !insertText) return [];
      return [
        {
          id: catalogKey,
          name: catalogKey,
          label: pluginCommandText(
            spec,
            $locale,
            "label",
            spec.label ?? tr(spec.label_key as TranslationKeys),
          ),
          description: pluginCommandText(
            spec,
            $locale,
            "description",
            spec.description ?? tr(spec.description_key as TranslationKeys),
          ),
          insertText,
          run: run ?? undefined,
        },
      ];
    });
  });
  const shikiTheme = $derived(isDarkTheme ? "github-dark" : "github-light");
  const mermaidConfig = $derived(mermaidConfigFor(isDarkTheme));

  $effect(() => {
    const interrupt = activeInterrupt;
    if (
      !interrupt ||
      interrupt.kind !== "render_mermaid" ||
      handledMermaidInterrupts.has(interrupt.id) ||
      !conversation
    )
      return;
    const source = typeof interrupt.arguments.source === "string" ? interrupt.arguments.source : "";
    handledMermaidInterrupts.add(interrupt.id);
    void renderMermaidToolResult(source, mermaidConfig)
      .then((result) =>
        client.submitInterruptResponse({
          convId: conversation!.conv_id,
          interruptId: interrupt.id,
          response: JSON.stringify(result),
        }),
      )
      .catch((cause) => {
        handledMermaidInterrupts.delete(interrupt.id);
        error = cause instanceof Error ? cause.message : String(cause);
      });
  });

  onMount(() => {
    sidebarWidthRatio = sidebarWidth / viewportWidth;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => applyRemoteTheme(preferredTheme);
    const updateSidebarForViewport = () => {
      const nextViewportWidth = Math.max(
        document.documentElement.clientWidth || window.innerWidth,
        1,
      );
      if (nextViewportWidth === viewportWidth) return;
      sidebarWidth = sidebarWidthForViewportRatio(sidebarWidthRatio, nextViewportWidth);
      viewportWidth = nextViewportWidth;
    };
    const sidebarObserver = new ResizeObserver(updateSidebarForViewport);
    sidebarObserver.observe(document.documentElement);
    window.addEventListener("resize", updateSidebarForViewport);
    syncTheme();
    sidebarCollapsed = window.matchMedia("(max-width: 760px)").matches;
    media.addEventListener("change", syncTheme);
    void bootstrap();
    return () => {
      media.removeEventListener("change", syncTheme);
      sidebarObserver.disconnect();
      window.removeEventListener("resize", updateSidebarForViewport);
      remoteConnection.dispose();
      remoteCatalog.dispose();
      remoteHistory.reset();
      remoteAttachments.dispose();
    };
  });

  function applyRemoteTheme(theme: "system" | "light" | "dark") {
    preferredTheme = theme;
    const resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(resolved);
    isDarkTheme = resolved === "dark";
  }

  function remoteSlashCommandRun(name: string): (() => void) | null {
    switch (name) {
      case "new":
        return () => {
          void newConversation();
        };
      case "compact":
        return () => {
          instruction = "/compact";
          void sendInstruction();
        };
      default:
        return null;
    }
  }

  async function bootstrap() {
    if (!(await client.restoreRemoteSession())) {
      screen = "pair";
      return;
    }
    await loadGateway();
  }

  async function pair() {
    const code = pairingCode.replace(/\s/g, "").toUpperCase();
    if (code.length !== 8) return;
    await perform(async () => {
      await client.pairRemoteGateway(code);
      pairingCode = "";
      await loadGateway();
    });
  }

  async function loadGateway() {
    const [nextWorkspaces, nextModels, nextCommands, preferences] = await Promise.all([
      client.listRemoteWorkspaces(),
      client.listRemoteModels(),
      client.listAgentCommands(),
      client.getRemotePreferences(),
    ]);
    workspaces = nextWorkspaces;
    remoteModels = nextModels;
    agentCommandSpecs = nextCommands;
    applyRemoteTheme(preferences.theme);
    setLocale(preferences.language as Locale);
    messageLayout = preferences.message_layout ?? "single";
    messageDoubleColumnMinWidth = preferences.message_double_column_min_width ?? 1200;
    bookModeFontSize = preferences.book_mode_font_size ?? 17;
    const defaultModel = remoteModels.find((model) => model.is_default) ?? remoteModels[0];
    selectedModel = defaultModel
      ? encodeModelBinding(defaultModel.provider_id, defaultModel.model)
      : "";
    remoteCatalog.workspaceId = workspaces[0]?.id ?? "";
    screen = "chat";
    if (remoteCatalog.workspaceId) await loadWorkspace(remoteCatalog.workspaceId);
  }

  async function newConversation() {
    if (running) return;
    resetConversation();
    if (window.matchMedia("(max-width: 760px)").matches) sidebarCollapsed = true;
  }

  function applyConversationState(state: RemoteConversationState) {
    if (!conversation) return;
    const convId = state.conv_id;
    const previousPhase = conversation.phase;
    const previousCheckpointId = conversation.checkpoint_id;
    conversation = state;
    remoteCatalog.updateTitle(convId, state.title);
    const stillPending = Object.fromEntries(
      Object.entries(remoteExecution.resolvingInterrupts).filter(([requestId]) =>
        state.interrupts.some((interrupt) => interrupt.id === requestId),
      ),
    );
    if (
      Object.keys(stillPending).length !== Object.keys(remoteExecution.resolvingInterrupts).length
    ) {
      remoteExecution.resolvingInterrupts = stillPending;
    }
    if (
      remoteExecution.optimisticUser &&
      state.messages.some((message) => message.id === remoteExecution.optimisticUser?.id)
    ) {
      remoteExecution.optimisticUser = null;
      remoteExecution.forkDisplayMessages = null;
    }
    if (remoteExecution.pendingAssistantMessageId && state.phase !== "before_completion") {
      remoteExecution.pendingAssistantMessageId = null;
    }
    if (
      state.phase !== "before_completion" &&
      (previousPhase === "before_completion" || previousCheckpointId !== state.checkpoint_id)
    ) {
      remoteExecution.streamPaused = false;
      void refreshConversations();
      void loadConversationHistory(convId);
      if (
        previousPhase === "before_completion" &&
        (state.phase === "final_completed" ||
          state.phase === "final_cancelled" ||
          state.phase === "final_failed")
      ) {
        queueMicrotask(() => void sendNextQueuedMessage(convId));
      }
    }
    error = "";
  }

  const remoteConnection = createRemoteConnectionController({
    client,
    activeConversationId: () => conversation?.conv_id ?? null,
    prepare(preservePendingTurn) {
      if (!preservePendingTurn) {
        remoteExecution.optimisticUser = null;
        remoteExecution.pendingAssistantMessageId = null;
      }
      remoteExecution.streamPaused = false;
      remoteExecution.forkDisplayMessages = null;
      remoteHistory.reset();
    },
    loadHistory: loadConversationHistory,
    applyInitialState(state) {
      conversation = state;
    },
    applyState: applyConversationState,
    onConnected() {
      if (window.matchMedia("(max-width: 760px)").matches) sidebarCollapsed = true;
    },
    onReconnecting() {
      error = tr("remoteReconnect");
    },
    onError(cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    },
  });

  async function perform(action: () => Promise<void>) {
    busy = true;
    error = "";
    try {
      await action();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  function approvalRequest(interrupt: RemoteInterrupt): UserInputRequest {
    return {
      request_id: interrupt.id,
      conv_id: conversation?.conv_id ?? null,
      kind: "tool_approval",
      title: tr("toolApprovalRequired"),
      description: interrupt.tool_name,
      fields: [],
      submit_label: tr("toolApprovalApprove"),
      cancel_label: tr("toolApprovalDeny"),
    };
  }
</script>

<svelte:head>
  <title>OpenAgent Remote</title>
  <meta name="description" content="Securely control OpenAgent from a paired device" />
</svelte:head>

<Toast />

<TooltipPrimitive.Provider delayDuration={500} skipDelayDuration={300}>
  {#if screen === "loading"}
    <main class="center-state">
      <img class="loading-logo" src={openAgentIconUrl} alt="OpenAgent" />
      <span class="loading-indicator" aria-hidden="true"></span>
      <span>{$t("remoteConnecting")}</span>
    </main>
  {:else if screen === "pair"}
    <main class="gate-layout">
      <div class="gate-aurora" aria-hidden="true"></div>
      <section class="gate-card">
        <div class="brand-lockup">
          <img class="brand-logo" src={openAgentIconUrl} alt="OpenAgent" />
          <span class="remote-chip">Remote</span>
        </div>
        <h1>{$t("remoteConnectTitle")}</h1>
        <p class="gate-subtitle">{$t("remoteSecureControl")}</p>
        <label for="pairing-code">{$t("remoteGatewayPairingCode")}</label>
        <input
          id="pairing-code"
          class="pairing-input"
          maxlength="8"
          autocomplete="one-time-code"
          bind:value={pairingCode}
          onkeydown={(event) => event.key === "Enter" && pair()}
          placeholder="XXXXXXXX"
          spellcheck="false"
        />
        <p class="field-hint">{$t("remotePairingHint")}</p>
        <button
          class="primary-action"
          disabled={busy || pairingCode.replace(/\s/g, "").length !== 8}
          onclick={pair}
        >
          {#if busy}<span class="button-spinner" aria-hidden="true"></span>{/if}
          {busy ? $t("remoteConnecting") : $t("remotePairDevice")}
        </button>
        {#if error}<p class="error-note" role="alert">{error}</p>{/if}
      </section>
    </main>
  {:else}
    <div
      class="app"
      class:sidebar-collapsed={sidebarCollapsed}
      style:--sidebar-width={`${sidebarWidth}px`}
    >
      <aside class="sidebar" class:collapsed={sidebarCollapsed} class:resizing={sidebarResizing}>
        <div class="sidebar-top">
          {#if !sidebarCollapsed}
            <RoleSelector
              value={remoteCatalog.selectedRoleKey}
              roles={remoteCatalog.roles}
              header
              onChange={(role) => void changeRole(role)}
            />
          {/if}
          <SidebarCollapseButton
            collapsed={sidebarCollapsed}
            onToggle={() => (sidebarCollapsed = !sidebarCollapsed)}
          />
        </div>
        {#if !sidebarCollapsed}
          <SidebarPrimaryActions
            searchQuery={conversationSearchQuery}
            onNew={() => void newConversation()}
            onSearch={(query) => (conversationSearchQuery = query)}
          />
          {#if remoteCatalog.loadingWorkspace}
            <LoadingSkeleton variant="sidebar" rows={8} label={$t("remoteLoadingConversations")} />
          {:else}
            <ConversationList
              {conversations}
              searchQuery={conversationSearchQuery}
              activeConvId={selectedConversationId}
              {streamingConvIds}
              hasMore={false}
              loadingMore={false}
              onLoadMore={() => {}}
              onSelect={(id) => void selectConversation(id)}
              onTogglePin={(id) => void togglePin(id)}
              onDelete={(id) => void deleteConversation(id)}
            />
          {/if}
          <div class="remote-security">{$t("remotePairedScope")}</div>
          <SidebarResizeHandle
            width={sidebarWidth}
            ariaLabel={$t("resizeSidebar")}
            onResize={resizeSidebar}
            onResizeStateChange={(resizing) => (sidebarResizing = resizing)}
            onResizeEnd={saveSidebarWidth}
          />
        {/if}
      </aside>

      <section class="main bg-conversation-surface" class:sidebar-collapsed={sidebarCollapsed}>
        <header class="title-bar">
          <div class="title-bar-left">
            <Select
              bind:value={remoteCatalog.workspaceId}
              items={workspaces.map((workspace) => ({
                value: workspace.id,
                label: workspace.name,
              }))}
              ariaLabel={$t("remoteWorkspaceLabel")}
              triggerClass="remote-workspace-trigger"
              onValueChange={(id) => id && void loadWorkspace(id)}
            />
            {#if sidebarCollapsed}
              <Tooltip text={$t("remoteNewConversation")} side="bottom">
                <button
                  class="title-new-conversation"
                  type="button"
                  aria-label={$t("remoteNewConversation")}
                  onclick={() => void newConversation()}
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    ><path
                      d="M11.75 4.25H5.5A1.75 1.75 0 0 0 3.75 6v8.5a1.75 1.75 0 0 0 1.75 1.75H14a1.75 1.75 0 0 0 1.75-1.75V8.25"
                    /><path d="m9 11 6.35-6.35M12.75 4.25h3v3" /></svg
                  >
                </button>
              </Tooltip>
              <RoleSelector
                value={remoteCatalog.selectedRoleKey}
                roles={remoteCatalog.roles}
                compact
                onChange={(role) => void changeRole(role)}
              />
            {/if}
          </div>
          <span class="connection-status" class:working={running} role="status" aria-live="polite">
            <span></span>{running ? $t("awaitingStreamOutput") : $t("remoteHttpConnected")}
          </span>
        </header>

        <ScrollArea height="100%" class="messages" bind:viewport={messagesEl} scrollHideDelay={350}>
          <main class="messages-content">
            {#if remoteCatalog.loadingWorkspace}
              <LoadingSkeleton variant="new-conversation" label={$t("remoteLoadingWorkspace")} />
            {:else if remoteCatalog.loadingConversationId}
              <LoadingSkeleton variant="conversation" label={$t("loadingContent")} />
            {:else if !remoteCatalog.workspaceId}
              <div class="empty-chat">
                <strong>{$t("remoteNoWorkspaceTitle")}</strong><span
                  >{$t("remoteNoWorkspaceHint")}</span
                >
              </div>
            {:else}
              <MessageList
                {messages}
                scrollElement={messagesEl}
                isStreaming={running}
                isAwaitingStreamOutput={running && currentStreamItems.length === 0}
                {currentStreamItems}
                {currentStreamMessageId}
                activeConvId={conversation?.conv_id ?? null}
                activeBranchId={remoteHistory.activeBranchId}
                debugMode={false}
                fileChanges={currentFileChanges}
                activeTree={remoteHistory.activeTree}
                paddingBottom={inputAreaHeight + 24}
                showApiKeyWarn={remoteModels.length === 0}
                {shikiTheme}
                {mermaidConfig}
                {messageLayout}
                {messageDoubleColumnMinWidth}
                {bookModeFontSize}
                newConversationGreeting={NEW_CONVERSATION_GREETING}
                newConversationGreetingLoading={false}
                showNewConversationContext={!newConversationLayout}
                editable={!running}
                attachmentPreviewLoader={(locator, name) =>
                  client.getRemoteAttachmentPreview(locator, name)}
                onCommitEdit={(convId, userMessageIndex, text, editedAttachments, editedContexts) =>
                  void commitEdit(
                    convId,
                    userMessageIndex,
                    text,
                    editedAttachments,
                    editedContexts,
                  )}
                onAddQuote={addQuote}
                onReExecute={(convId, assistantMessageIndex) =>
                  void reExecute(convId, assistantMessageIndex)}
                onSwitchBranch={(convId, parentKey, targetIdx) =>
                  void switchBranch(convId, parentKey, targetIdx)}
                onSubmitUserInput={answer}
                onCancelUserInput={cancelInlineInterrupt}
              />
            {/if}
          </main>
        </ScrollArea>

        <div
          class="input-area"
          class:input-area-streaming={running}
          class:input-area-new-conversation={newConversationLayout}
          bind:clientHeight={inputAreaHeight}
        >
          {#if newConversationLayout}
            <NewConversationContext
              prompt={NEW_CONVERSATION_GREETING}
              loading={false}
              showApiKeyWarn={remoteModels.length === 0}
              placement="stack"
            />
          {/if}
          <div class="input-inner">
            {#if remoteCatalog.loadingWorkspace || remoteCatalog.loadingConversationId}
              <LoadingSkeleton
                variant="composer"
                label={$t(
                  remoteCatalog.loadingWorkspace ? "remoteLoadingWorkspace" : "loadingContent",
                )}
              />
            {:else}
              {#if currentFileChanges.length > 0 && !activeInterrupt}
                <FileChangeBanner changes={currentFileChanges} onRevert={revertFileChange} />
              {/if}
              {#if conversation}
                <ChatQueue
                  items={remoteExecution.queuedChatMessages[conversation.conv_id] ?? []}
                  onRemove={(index) => removeQueuedMessage(conversation!.conv_id, index)}
                  onClear={() => clearQueuedMessages(conversation!.conv_id)}
                />
              {/if}
              {#if activeInterrupt && hasInlineInterrupt}
                <p class="inline-interrupt-hint">{$t("remoteCompleteInlineInterrupt")}</p>
              {:else if activeInterrupt?.kind === "render_mermaid"}
                <p class="inline-interrupt-hint">{$t("remoteRenderingMermaid")}</p>
              {:else if activeInterrupt?.kind === "ask_user" && conversation}
                {@const request = interruptRequest(activeInterrupt, conversation.conv_id)}
                {#key request.request_id}<UserInputForm
                    {request}
                    onSubmit={answer}
                    onCancel={cancelAnswer}
                  />{/key}
              {:else if activeInterrupt}
                <div class="approval-card">
                  <div class="approval-copy">
                    <p>{activeInterrupt.tool_name}</p>
                    <pre>{JSON.stringify(activeInterrupt.arguments, null, 2)}</pre>
                  </div>
                  <ToolApprovalActions
                    request={approvalRequest(activeInterrupt)}
                    disabled={busy}
                    onApprove={(id) => approve(id, true)}
                    onDeny={(id) => approve(id, false)}
                  />
                </div>
              {:else}
                <MessageInput
                  bind:value={instruction}
                  bind:attachments
                  bind:contexts
                  bind:selectedModel
                  {modelOptions}
                  {slashCommands}
                  loadMentionItems={loadRemoteMentionItems}
                  placeholder={remoteModels.length
                    ? $t("remoteComposerPlaceholder")
                    : $t("remoteNoModelsPlaceholder")}
                  disabled={!remoteCatalog.workspaceId || remoteCatalog.loadingWorkspace}
                  isStreaming={running}
                  isPaused={remoteExecution.streamPaused}
                  sendDisabled={(!instruction.trim() &&
                    attachments.length === 0 &&
                    contexts.length === 0) ||
                    !remoteCatalog.workspaceId ||
                    remoteModels.length === 0 ||
                    busy}
                  sendTitle={running ? $t("remoteQueueInstruction") : $t("send")}
                  pauseTitle={$t("pauseOutput")}
                  resumeTitle={$t("resumeOutput")}
                  stopTitle={$t("stopOutput")}
                  showAttachments
                  showModelSelector
                  showStopButton
                  onUploadAttachments={uploadAttachments}
                  attachmentPreviewLoader={(locator, name) =>
                    client.getRemoteAttachmentPreview(locator, name)}
                  focusRequest={composerFocusRequest}
                  onSend={sendInstruction}
                  onStop={stopMessage}
                  onPause={() => setStreamPaused(true)}
                  onResume={() => setStreamPaused(false)}
                />
              {/if}
              {#if error}<p class="composer-error">{error}</p>{/if}
              {#if commandNotice}<p class="composer-notice">{commandNotice}</p>{/if}
            {/if}
          </div>
        </div>
      </section>
    </div>
  {/if}
</TooltipPrimitive.Provider>

<style>
  .center-state,
  .gate-layout {
    position: relative;
    display: grid;
    min-height: 100dvh;
    place-items: center;
    overflow: hidden;
    padding: 40px 20px;
    background: var(--bg);
    color: var(--text-muted);
  }
  .center-state {
    align-content: center;
    gap: 12px;
    font-size: 12px;
  }
  .loading-logo {
    width: 68px;
    height: 68px;
    padding: 5px;
    border-radius: var(--app-radius);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: var(--control-shadow);
    object-fit: contain;
  }
  .loading-indicator {
    width: 18px;
    height: 18px;
    margin-top: 8px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 800ms linear infinite;
  }
  .gate-aurora {
    position: absolute;
    left: 50%;
    top: 50%;
    width: min(880px, 115vw);
    height: min(620px, 82vh);
    background:
      radial-gradient(ellipse at 22% 46%, rgba(66, 133, 244, 0.2), transparent 54%),
      radial-gradient(ellipse at 50% 58%, rgba(52, 168, 83, 0.1), transparent 52%),
      radial-gradient(ellipse at 76% 40%, rgba(161, 66, 244, 0.15), transparent 54%);
    filter: blur(68px) saturate(1.14);
    opacity: 0.9;
    transform: translate(-50%, -50%);
    animation: gate-aurora 9s ease-in-out infinite alternate;
    pointer-events: none;
  }
  .gate-card {
    position: relative;
    z-index: 1;
    width: min(100%, 440px);
    padding: 34px;
    border-radius: var(--app-radius);
    background: var(--control-surface);
    box-shadow: var(--raised-shadow);
    backdrop-filter: blur(20px) saturate(1.12);
  }
  .gate-card h1 {
    margin: 0;
    color: var(--text);
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .gate-subtitle {
    margin: 3px 0 28px;
    color: var(--text-muted);
    font-size: 13px;
  }
  .brand-lockup {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 30px;
  }
  .brand-logo {
    width: 44px;
    height: 44px;
    padding: 3px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: var(--control-shadow);
    object-fit: contain;
  }
  .remote-chip {
    padding: 3px 8px;
    border-radius: 9999px;
    background: var(--item-selected-bg);
    color: var(--primary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .gate-card > label {
    display: grid;
    gap: 8px;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }
  .pairing-input {
    box-sizing: border-box;
    width: 100%;
    margin-top: 8px;
    padding: 12px 18px 12px 24px;
    border: 0;
    border-radius: 9999px;
    outline: 0;
    background: var(--control-surface);
    box-shadow: var(--control-shadow);
    color: var(--text);
    font:
      600 20px/1.4 "SFMono-Regular",
      Consolas,
      monospace;
    letter-spacing: 0.3em;
    text-align: center;
    text-transform: uppercase;
  }
  .pairing-input:focus {
    box-shadow: var(--control-shadow), var(--focus-ring);
  }
  .field-hint {
    margin: 8px 4px 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .primary-action {
    display: flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 24px;
    padding: 11px 22px;
    border: 0;
    border-radius: 9999px;
    background: var(--primary);
    color: white;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard);
  }
  .primary-action:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  .primary-action:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }
  .primary-action:active:not(:disabled) {
    transform: scale(0.985);
  }
  .primary-action:disabled {
    cursor: default;
    opacity: 0.4;
  }
  .button-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.42);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 800ms linear infinite;
  }
  .error-note,
  .composer-error {
    margin-bottom: 0;
    color: var(--danger, #dc2626);
    font-size: 12px;
  }

  .app {
    --sidebar-width: 220px;
    display: flex;
    height: 100dvh;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
  }
  .sidebar {
    position: relative;
    width: var(--sidebar-width);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: visible;
    border-right: 1px solid var(--border);
    background: var(--sidebar-bg);
    transition: width var(--motion-layout) var(--ease-enter);
    user-select: none;
  }
  .sidebar.collapsed {
    width: 0;
    overflow: visible;
    border-right: 0;
    background: transparent;
  }
  .sidebar.resizing {
    transition: none;
  }
  .sidebar-top {
    display: flex;
    box-sizing: border-box;
    min-height: 50px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 4px 5px 8px;
  }
  .sidebar.collapsed .sidebar-top {
    position: relative;
    z-index: 11;
    width: 48px;
    justify-content: center;
    padding-left: 4px;
  }
  .remote-security {
    margin-top: auto;
    padding: 10px 12px 14px;
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.45;
  }
  .main {
    position: relative;
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
  }
  .title-bar {
    position: absolute;
    inset: 0 0 auto;
    z-index: 10;
    display: flex;
    height: 48px;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 55%, transparent 100%);
    user-select: none;
  }
  .main.sidebar-collapsed .title-bar {
    padding-left: 56px;
  }
  .title-bar-left {
    display: flex;
    min-width: 0;
    flex: 0 1 auto;
    align-items: center;
    gap: 6px;
  }
  :global(.remote-workspace-trigger) {
    max-width: min(280px, 42vw);
    border: 0;
    background: transparent;
    box-shadow: none;
    font-weight: 600;
  }
  .connection-status {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 9999px;
    background: var(--item-selected-bg);
    color: var(--primary);
    font-size: 11px;
    font-weight: 600;
  }
  .connection-status > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .connection-status.working > span {
    animation: status-pulse 1.2s ease-in-out infinite;
  }
  .title-new-conversation {
    display: grid;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);
  }
  .title-new-conversation:hover,
  .title-new-conversation:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }
  .title-new-conversation:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .title-new-conversation svg {
    width: 18px;
    height: 18px;
  }
  :global(.messages) {
    position: relative;
    z-index: 1;
    flex: 1;
  }
  :global(.messages .ui-scroll-area-viewport) {
    overflow-x: clip;
    overscroll-behavior-y: contain;
  }
  .messages-content {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .empty-chat {
    display: grid;
    min-height: 100%;
    place-content: center;
    gap: 6px;
    color: var(--text-muted);
    text-align: center;
  }
  .empty-chat strong {
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
  }
  .empty-chat span {
    font-size: 13px;
  }
  .input-area {
    position: absolute;
    inset: auto 0 0;
    z-index: 10;
    padding-bottom: 16px;
    pointer-events: none;
  }
  .input-area-new-conversation {
    top: calc(50% - 10px);
    bottom: auto;
    padding-bottom: 0;
    transform: translateY(-50%);
  }
  .input-inner {
    position: relative;
    z-index: 2;
    box-sizing: border-box;
    max-width: 900px;
    margin: 0 auto;
    padding: 0 32px;
    pointer-events: auto;
  }
  .input-area-new-conversation .input-inner :global(.composer-compact .input) {
    min-height: 66px;
  }
  .composer-error {
    margin: 7px 0 0;
    text-align: center;
  }
  .composer-notice {
    margin: 7px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }
  .inline-interrupt-hint {
    margin: 0;
    padding: 10px;
    color: var(--text-muted);
    text-align: center;
  }
  .approval-card {
    overflow: hidden;
    border-radius: var(--app-radius);
    background: var(--control-surface);
    box-shadow: var(--control-shadow);
  }
  .approval-copy {
    padding: 14px 16px;
  }
  .approval-copy p {
    margin: 0;
    font-weight: 600;
  }
  .approval-copy pre {
    max-height: 144px;
    margin: 8px 0 0;
    overflow: auto;
    white-space: pre-wrap;
    color: var(--text-muted);
    font-size: 12px;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes status-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
  @keyframes gate-aurora {
    from {
      transform: translate3d(-53%, -47%, 0) scale(1.02);
    }
    to {
      transform: translate3d(-47%, -53%, 0) scale(1.1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sidebar,
    .gate-aurora {
      transition: none;
      animation: none;
    }
  }
  @media (max-width: 760px) {
    .sidebar:not(.collapsed) {
      position: absolute;
      z-index: 30;
      inset: 0 auto 0 0;
      box-shadow: var(--raised-shadow);
    }
    .connection-status {
      max-width: 128px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .input-inner {
      padding: 0 10px;
    }
    .gate-card {
      padding: 28px 24px;
    }
  }
</style>
