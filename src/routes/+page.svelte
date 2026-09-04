<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { homeDir } from "@tauri-apps/api/path";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import {
    disable as disableAutostart,
    enable as enableAutostart,
  } from "@tauri-apps/plugin-autostart";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
  import { onMount, tick, untrack } from "svelte";
  import type { Component } from "svelte";
  import { detectWindowPlatform } from "$lib/windowPlatform";

  // Lazy-loaded feature views expose different prop contracts; each render site
  // below remains checked against the concrete component after loading.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type LazyViewComponent = Component<any>;

  import Toast from "$lib/components/Toast.svelte";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import { installDownloadHook } from "$lib/downloadHook";
  import { checkForAppUpdate } from "$lib/appUpdater";
  import { AgentCompletionNotifier } from "$lib/agentCompletionNotification";
  import { chatTaskUsagesByCheckpoint } from "$lib/cacheUsage";
  import { Dialog, Tooltip as TooltipPrimitive } from "bits-ui";
  import { normalizeConfigShape } from "$lib/config";
  import { applyDocumentTheme, createNativeThemeSynchronizer, type AppTheme } from "$lib/appTheme";
  import { ComposerPreferences } from "$lib/composerPreferences.svelte";
  import {
    ComposerDraftStore,
    conversationComposerDraftKey,
    newConversationComposerDraftKey,
  } from "$lib/composerDrafts";
  import { ChatStreamState } from "$lib/chatStreamState.svelte";
  import {
    InterruptResolutionTracker,
    InterruptTerminalHandoff,
  } from "$lib/interruptResolutionTracker";
  import { resolveStandaloneDevPreview } from "$lib/devPreview";
  import {
    addWorkspaceToPersistedOrder,
    mergeRecentConversationRefresh,
    parsePinnedProjectPaths,
    pinnedProjectsStorageKey,
    promoteRecentConversation,
    togglePinnedProjectPath,
  } from "$lib/sidebarProjects";
  import { t, tr, initI18n, setLocale, type Locale, type TranslationKeys } from "$lib/i18n";
  import { showToast } from "$lib/toast";
  import { decodeModelBinding } from "$lib/modelBinding";
  import { DEFAULT_QUICK_CHAT_SHORTCUT, normalizeQuickChatShortcut } from "$lib/quickChatShortcut";
  import {
    disposeQuickChatShortcut,
    initializeQuickChatShortcut,
    replaceQuickChatShortcut,
  } from "$lib/quickChatWindow";
  import { desktopOpenAgent as openAgent, emit, invoke, listen } from "$lib/openagent/tauriClient";
  import type { AgentCommandSpec, ChatRunStartedEvent } from "$lib/openagent";
  import {
    DEV_MAIN_DEBUG_VISIBILITY_EVENT,
    readMainDebugComponentsVisible,
  } from "$lib/devDebugVisibility";
  import { ONBOARDING_COMPLETE_EVENT } from "$lib/onboarding";
  import { NEW_CONVERSATION_GREETING } from "$lib/newConversation";
  import { durableFollowUpSuggestionsByMessageId } from "$lib/followUpSuggestions";
  import {
    clearQueuedChatMessages,
    dequeueChatMessage,
    enqueueChatMessage,
    removeQueuedChatMessage,
    type QueuedChatMessage,
  } from "$lib/chatQueue";
  import OnboardingFlow from "$lib/components/OnboardingFlow.svelte";
  import type { SlashCommand } from "$lib/components/MessageInput.svelte";
  import QuickChatSurface from "$lib/components/QuickChatSurface.svelte";
  import StandaloneDevPreview from "$lib/components/StandaloneDevPreview.svelte";
  import WorkspaceDialogs from "$lib/components/WorkspaceDialogs.svelte";
  import DesktopSidebar from "$lib/components/DesktopSidebar.svelte";
  import RoleEditorDialog from "$lib/components/RoleEditorDialog.svelte";
  import DesktopTitleBar from "$lib/components/DesktopTitleBar.svelte";
  import ConversationSurface from "$lib/components/ConversationSurface.svelte";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import {
    checkpointFlowPanelKey,
    shouldAutoOpenCheckpointFlowPanel,
    updateLiveCheckpointFlowProjection,
    type LiveCheckpointFlowProjection,
  } from "$lib/checkpointFlow";
  import {
    loadCheckpointFlowPanelCollapsed,
    saveCheckpointFlowPanelCollapsed,
  } from "$lib/checkpointFlowPanelSizing";
  import { retainUndurableFileChanges } from "$lib/fileChangeReconciliation";
  import { renderMermaidToolResult } from "$lib/streamdown/mermaidRenderer";
  import {
    ROOT_KEY,
    buildTreeFromCheckpoints,
    computeActivePath,
    getActiveTipNode,
    findForkParentCheckpointId,
    selectActivePathToCheckpoint,
    reconcileLiveCheckpointTip,
    ckIdsAlongActivePath,
    attachNewTurn,
    askUserRequestFromToolUse,
    isCompactionBoundary,
    preserveMessagesAddedDuringHydration,
    preserveStreamingMessagesDuringHydration,
    type ConvTree,
  } from "$lib/checkpointTree";
  import { prepareWorkspaceConversationSnapshot } from "$lib/workspaceConversationState";
  import {
    applyWindowFocusEvent,
    DESKTOP_WINDOW_ACTIVATED_EVENT,
    type WindowFocusState,
  } from "$lib/windowFocus";
  import {
    appendChunk,
    appendCompactionProgress,
    appendThinkingChunk,
    appendToolCall,
    appendUserInput,
    attachToolResult,
    collapseStreamText,
    resolveUserInput,
  } from "$lib/chatStream";
  import {
    fetchChildConversations,
    fetchConversationMeta,
    fetchConversationPage,
    fetchRenderableCheckpoints,
    fetchFileChanges,
    metaToConversation,
    revertFileChange,
  } from "$lib/conversationDb";
  import {
    readStartupRestoreHint,
    writeStartupRestoreHint,
    type CachedRestoreSurface,
  } from "$lib/startupRestoreCache";
  import {
    createNavigationHistory,
    moveNavigationHistory,
    recordNavigationLocation,
    removeNavigationLocations,
    type AppNavigationHistory,
    type AppNavigationLocation,
  } from "$lib/navigationHistory";
  import type {
    ChatMessage,
    Conversation,
    WorkspaceContext,
    AppConfig,
    StreamItem,
    ConversationPageCursor,
    FileChange,
    RecentWorkspace,
    UserInputRequest,
    ChatAttachment,
    AgentRole,
    SkillMetadata,
    StartupBootstrap,
    StartupConversationBundle,
    WslDistribution,
    WslWorkspaceTarget,
    ProviderAuthDeviceCodeEvent,
    GoalRunUpdatedEvent,
    UserMessageContext,
    CheckpointTurnStatus,
    ChatTaskUsage,
    TaskTokenUsage,
  } from "$lib/types";

  type EmbeddingResourceStatus = {
    state: "ready" | "missing" | "corrupt";
    model_id: string;
    version: string;
    total_bytes: number;
  };

  const runtimeQuery =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const frontendActivationVersion = runtimeQuery?.get("frontend-version") ?? null;
  const devQuery = import.meta.env.DEV ? runtimeQuery : null;
  const isDevInspectorWindow = devQuery?.has("dev-inspector") === true;
  const isOnboardingPreview = devQuery?.has("onboarding-preview") === true;
  const onboardingResourcePreview = devQuery?.get("onboarding-preview-resource") ?? null;
  const isQuickChatPreview = devQuery?.has("quick-chat-preview") === true;
  const standaloneDevPreview = resolveStandaloneDevPreview(runtimeQuery, import.meta.env.DEV);
  const isChannelsSettingsPreview = devQuery?.has("channels-settings-preview") === true;
  const isAgentsSettingsPreview = devQuery?.has("agents-settings-preview") === true;
  const isAgentPluginsSettingsPreview = devQuery?.has("agent-plugins-settings-preview") === true;
  const isMcpSettingsPreview = devQuery?.has("mcp-settings-preview") === true;
  const isQuickChatWindow = runtimeQuery?.has("quick-chat-window") === true;
  const isOnboardingWindow = runtimeQuery?.has("onboarding-window") === true;
  const isOnboardingSurface = isOnboardingWindow || isOnboardingPreview;
  const isQuickChatSurface = isQuickChatWindow || isQuickChatPreview;
  const onboardingPreviewTheme =
    devQuery?.get("onboarding-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("onboarding-preview-theme") === "light"
        ? "light"
        : null;
  const onboardingPreviewLocale: Locale | null =
    devQuery?.get("onboarding-preview-locale") === "en"
      ? "en"
      : devQuery?.get("onboarding-preview-locale") === "zh"
        ? "zh"
        : null;
  const channelsSettingsPreviewTheme =
    devQuery?.get("channels-settings-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("channels-settings-preview-theme") === "light"
        ? "light"
        : null;
  const channelsSettingsPreviewLocale: Locale | null =
    devQuery?.get("channels-settings-preview-locale") === "en"
      ? "en"
      : devQuery?.get("channels-settings-preview-locale") === "zh"
        ? "zh"
        : null;
  const agentsSettingsPreviewTheme =
    devQuery?.get("agents-settings-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("agents-settings-preview-theme") === "light"
        ? "light"
        : null;
  const agentsSettingsPreviewLocale: Locale | null =
    devQuery?.get("agents-settings-preview-locale") === "en"
      ? "en"
      : devQuery?.get("agents-settings-preview-locale") === "zh"
        ? "zh"
        : null;
  const agentPluginsSettingsPreviewTheme =
    devQuery?.get("agent-plugins-settings-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("agent-plugins-settings-preview-theme") === "light"
        ? "light"
        : null;
  const agentPluginsSettingsPreviewLocale: Locale | null =
    devQuery?.get("agent-plugins-settings-preview-locale") === "en"
      ? "en"
      : devQuery?.get("agent-plugins-settings-preview-locale") === "zh"
        ? "zh"
        : null;
  const mcpSettingsPreviewTheme =
    devQuery?.get("mcp-settings-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("mcp-settings-preview-theme") === "light"
        ? "light"
        : null;
  const mcpSettingsPreviewLocale: Locale | null =
    devQuery?.get("mcp-settings-preview-locale") === "en"
      ? "en"
      : devQuery?.get("mcp-settings-preview-locale") === "zh"
        ? "zh"
        : null;
  const isDebugBuild = import.meta.env.DEV;
  let showMainDebugComponents = $state(readMainDebugComponentsVisible());
  let isDebugMode = $derived(isDebugBuild && showMainDebugComponents);
  let DevInspector = $state<Component | null>(null);

  if (import.meta.env.DEV && isDevInspectorWindow) {
    void import("$lib/components/DevInspector.svelte").then((module) => {
      DevInspector = module.default;
    });
  }

  // ─── State ────────────────────────────────────────────────────────────────────
  const startupRestoreHint = readStartupRestoreHint();
  let conversations = $state<Conversation[]>([]);
  let recentConversations = $state<Conversation[]>([]);
  let loadingRecentConversations = $state(false);
  let recentConversationGeneration = 0;
  let recentConversationRoleKey: string | null = null;
  let conversationNextCursor = $state<ConversationPageCursor | null>(null);
  let loadingMoreConversations = $state(false);
  let searchConversations = $state<Conversation[]>([]);
  let searchConversationNextCursor = $state<ConversationPageCursor | null>(null);
  let loadingMoreSearchConversations = $state(false);
  let conversationSearchGeneration = 0;
  let conversationSearchTimer: ReturnType<typeof setTimeout> | null = null;
  let activeConvId = $state<string | null>(startupRestoreHint?.conversationId ?? null);
  const defaultRoleKey = "openagent";
  let agentRoles = $state<AgentRole[]>([]);
  let selectedRoleKey = $state(defaultRoleKey);
  let selectedRoleId = $derived(selectedRoleKey === defaultRoleKey ? null : selectedRoleKey);
  let initialLoading = $state(true);
  let workspaceLoading = $state(false);
  let workspaceSwitchTarget = $state<string | null>(null);
  let loadingConversationIds = $state<Record<string, boolean>>({});
  let restoringSurface = $state<CachedRestoreSurface>(
    startupRestoreHint?.surface ?? "new-conversation",
  );
  let agentCommandSpecs = $state<AgentCommandSpec[]>([]);
  let mainContentLoading = $derived(
    initialLoading || Boolean(activeConvId && loadingConversationIds[activeConvId]),
  );
  let newConversationLayout = $derived(
    mainContentLoading ? restoringSurface === "new-conversation" : activeConvId === null,
  );
  let conversationSearchQuery = $state("");
  let sidebarConversations = $derived.by(() => {
    if (conversationSearchQuery.trim()) return searchConversations;
    const source = conversations;
    const byId = new Map(source.map((conversation) => [conversation.id, conversation]));
    return source.filter((conversation) => {
      const visited = new Set<string>();
      let current: Conversation | undefined = conversation;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (current.roleId === selectedRoleKey) return true;
        if (!current.parentConvId) {
          return !current.roleId && selectedRoleKey === defaultRoleKey;
        }
        current = byId.get(current.parentConvId);
      }
      return false;
    });
  });
  let sidebarHasMoreConversations = $derived(
    conversationSearchQuery.trim()
      ? searchConversationNextCursor !== null
      : conversationNextCursor !== null,
  );
  let sidebarLoadingMoreConversations = $derived(
    conversationSearchQuery.trim() ? loadingMoreSearchConversations : loadingMoreConversations,
  );
  // Per-conversation transient stream state is owned independently from the
  // durable conversation/checkpoint projection.
  const chatStreams = new ChatStreamState();
  // Checkpoint IDs from chat-checkpoint events, pending assignment to assistant messages
  let pendingCheckpointIds = $state<Record<string, string>>({});
  // A checkpoint event is emitted only after its durable snapshot exists. Keep
  // Goal/Graph projection current without hydrating partial transcript records.
  const liveCheckpointRefreshVersions = new Map<string, number>();
  const pendingExternalUserRecoveries = new Set<string>();
  // Goal tools and Graph reducers mutate the canonical in-memory checkpoint
  // before that snapshot becomes durable. Render their complete event projection
  // until the matching persisted checkpoint has been reconciled.
  let liveCheckpointFlowProjections = $state<Record<string, LiveCheckpointFlowProjection>>({});
  // Tracks which conv_ids have had their messages loaded from SQLite
  const loadedConvIds = new Set<string>();
  // Workspace switches replace the visible metadata page. Retain the previous
  // page so an in-flight optimistic user turn can survive navigation and still
  // receive its terminal event while another workspace is selected.
  const workspaceConversationSnapshots = new Map<string, Conversation[]>();
  // File changes per conversation (loaded from SQLite)
  let fileChangesPerConv = $state<Record<string, FileChange[]>>({});
  // File changes reported by successful write tools before the turn reaches its
  // terminal checkpoint and is persisted to SQLite.
  let liveFileChangesPerConv = $state<Record<string, FileChange[]>>({});
  // Pending ask_user requests per conversation. Backend emits one when the
  // ask_user tool fires; the form clears on submit/cancel.
  let pendingUserInputs = $state<Record<string, UserInputRequest>>({});
  // Prevent duplicate responses for one durable request without blocking
  // sibling approval cards. Rust serializes their conversation transitions.
  const userInputResolutions = new InterruptResolutionTracker();
  // A live approval may be clicked before its run has emitted the terminal
  // interruption event. Resume only after that event has finalized the turn.
  const interruptTerminalHandoffs = new InterruptTerminalHandoff();
  // Height of the input-area for dynamic message padding
  let inputAreaHeight = $state(120);
  let checkpointFlowPanelCollapsed = $state(
    typeof window === "undefined" ? true : loadCheckpointFlowPanelCollapsed(window.localStorage),
  );
  let checkpointFlowPanelSelectionKey = $state<string | null>(null);
  let checkpointFlowPanelAutoOpenKey = $state<string | null>(null);
  let fileChangesPanelSelectionKey = $state<string | null>(null);
  let workspace = $state<WorkspaceContext | null>(null);
  let config = $state<AppConfig | null>(null);
  let isMemorySyncing = $state(false);
  let settingsOpen = $state(false);
  let roleEditorOpen = $state(false);
  let roleEditorRole = $state<AgentRole | null>(null);
  let roleEditorSkills = $state<SkillMetadata[]>([]);
  let roleEditorResourcesLoading = $state(false);
  let roleEditorSaving = $state(false);
  let settingsInitialNav = $state<
    | "general"
    | "channels"
    | "providers"
    | "defaults"
    | "agents"
    | "memory"
    | "hooks"
    | "plugins"
    | "extensions"
    | "about"
    | undefined
  >(undefined);
  let navigationHistory = $state<AppNavigationHistory>(createNavigationHistory());
  let navigationTransitioning = $state(false);
  let navigationCaptureDepth = $state(0);
  let SettingsView = $state<LazyViewComponent | null>(null);
  let workspacePath = $state("");
  let recentWorkspaces = $state<RecentWorkspace[]>([]);
  let pinnedProjectPaths = $state(
    typeof window === "undefined"
      ? []
      : parsePinnedProjectPaths(window.localStorage.getItem(pinnedProjectsStorageKey)),
  );
  let wslPickerOpen = $state(false);
  let wslPickerBusy = $state(false);
  let wslPickerError = $state("");
  let wslPickerStartsNewConversation = $state(false);
  let wslDistributions = $state<WslDistribution[]>([]);
  let wslDistribution = $state("");
  let wslLinuxPath = $state("");
  let launchContext = $state<{
    workspace: string | null;
    conversation_id: string | null;
    message_id: string | null;
    new_conversation: boolean;
  } | null>(null);
  let isDarkTheme = $state(false);
  let newConversationSuggestions = $state<string[]>([]);
  let followUpSuggestionsByMessageId = $state<Record<string, string[]>>({});
  const newConversationGreeting = NEW_CONVERSATION_GREETING;

  // ─── Branch / Re-execute state ────────────────────────────────────────────────
  // The conversation is a tree of checkpoints. Each tree node represents one turn
  // (user msg + assistant response) and carries its checkpoint_id. Siblings under a
  // common parent are alternate variants; the active path through the tree is what
  // the user sees. Nested branch arrows fall out naturally from rendering this path.
  let convTrees = $state<Record<string, ConvTree>>({});
  let taskUsagesByConversation = $state<Record<string, Record<string, TaskTokenUsage[]>>>({});
  const taskUsageRefreshVersions = new Map<string, number>();
  let checkpointLoadErrors = $state<Record<string, string>>({});
  // Per-conv: parent checkpoint id for the next finalized turn (used to attach a
  // re-execution as a sibling of the edited turn instead of as a tip-extension).
  // Value is null when the new sibling should sit at the root level.
  let pendingParentCk = $state<Record<string, string | null>>({});
  // The durable user-message identity at which a re-executed branch forks.
  let pendingForkMessageId = $state<Record<string, string | null>>({});
  // The selected branch head paired with the fork parent and message identity.
  let pendingForkSourceCheckpointId = $state<Record<string, string>>({});
  // Keep the optimistic fork transcript authoritative until its user message
  // appears in the durable selected branch.
  let pendingForkUserMessageIds = $state<Record<string, string>>({});
  // A branch is the user-visible linear history. A checkpoint is only a
  // recoverable provider-request snapshot and may advance several times while
  // this value remains unchanged.
  let activeBranchIds = $state<Record<string, string>>({});
  let shikiTheme = $derived(isDarkTheme ? "github-dark" : "github-light");
  let mermaidConfig = $derived(mermaidConfigFor(isDarkTheme));
  let messagesEl = $state<HTMLElement | null>(null);
  let followStreamToBottom = $state(true);
  let programmaticBottomScrollUntil = 0;
  let bottomScrollRunId = 0;
  let bottomScrollRaf: number | null = null;
  let streamCompletionTailAnchor = $state<{ convId: string; token: number } | null>(null);
  let streamCompletionTailAnchorSequence = 0;
  const tauriAvailable = isTauri();
  const externalRuntimeTransport = tauriAvailable
    ? invoke<"embedded" | "external">("runtime_transport_mode")
        .then((mode) => mode === "external")
        .catch(() => false)
    : Promise.resolve(false);

  async function refreshTaskUsagesForConversation(convId: string): Promise<void> {
    if (!tauriAvailable) return;
    const version = (taskUsageRefreshVersions.get(convId) ?? 0) + 1;
    taskUsageRefreshVersions.set(convId, version);
    try {
      const taskUsages = await invoke<ChatTaskUsage[]>("get_chat_task_usages", { convId });
      if (taskUsageRefreshVersions.get(convId) !== version) return;
      taskUsagesByConversation = {
        ...taskUsagesByConversation,
        [convId]: chatTaskUsagesByCheckpoint(
          taskUsages,
          Object.values(convTrees[convId]?.nodes ?? {}).map(({ ckId, turn }) => ({
            checkpointId: ckId,
            turn,
          })),
        ),
      };
    } catch (error) {
      console.warn("Failed to load task usage:", error);
    }
  }

  // Linux has no Rust-owned native material (only Windows uses Mica/Acrylic and macOS uses
  // NSVisualEffectMaterial), so applying the native-window-material class would turn the
  // body transparent and expose the WebView's default gray background.
  const usesNativeWindowMaterial =
    tauriAvailable &&
    detectWindowPlatform() !== "linux" &&
    !isQuickChatSurface &&
    !isDevInspectorWindow;
  const appWindow = tauriAvailable ? getCurrentWindow() : null;
  const completionWindowActivity = tauriAvailable
    ? { isFocused: () => invoke<boolean>("is_desktop_window_active") }
    : null;
  const agentCompletionNotifier = new AgentCompletionNotifier();
  const synchronizeNativeTheme =
    appWindow && usesNativeWindowMaterial
      ? createNativeThemeSynchronizer({
          applyWebTheme: applyDocumentTheme,
          setNativeTheme: (theme) => appWindow.setTheme(theme),
          onResolvedTheme: (dark) => (isDarkTheme = dark),
          afterNativeThemeChange: () => new Promise((resolve) => setTimeout(resolve, 0)),
          onError: (error) => console.warn("Failed to synchronize native window theme:", error),
        })
      : null;
  const browserModeNotice =
    "Desktop features require the Tauri runtime. Start this app with `bun tauri dev`, not `bun run dev`.";
  const fallbackConfig: AppConfig = {
    providers: [],
    defaults: {
      chat_model: { provider_id: "", model: "" },
      flash_model: { provider_id: "", model: "" },
    },
    model_retry: {
      retry_count: 3,
      retry_delay_ms: 30000,
      chat_queue: [],
      flash_queue: [],
    },
    flash_agents: {
      title: { enabled: true, prompt: "" },
      memory: { enabled: true, prompt: "" },
      skill_category: { enabled: true, prompt: "" },
      suggestions: { enabled: true, prompt: "" },
      hook: { enabled: true, prompt: "" },
      tool_approval: { enabled: false, prompt: "" },
    },
    approval_mode: "off",
    mcp: { servers: [] },
    theme: "system",
    language: "zh",
    agent_turn_limit_enabled: false,
    agent_max_turns: 10,
    context_compaction_enabled: true,
    context_compaction_threshold: 200000,
    context_compaction_prompt: "",
    html_preview: {
      fixed_height: 480,
    },
    launch_on_startup: false,
    onboarding_completed: false,
    diagnostic_log_collection_enabled: true,
    quick_chat_shortcut: DEFAULT_QUICK_CHAT_SHORTCUT,
    mention_palette_show_global_drafts: true,
    message_layout: "single",
    message_double_column_min_width: 1200,
    book_mode_font_size: 17,
    workspace_open_mode: "ask",
    memory_retrieval_enabled: false,
    remote_gateway: {
      enabled: false,
      allow_lan_access: false,
      allowed_workspaces: [],
    },
  };

  // Single source of truth: messages are derived from conversations[]
  let messages = $derived(conversations.find((c) => c.id === activeConvId)?.messages ?? []);

  const composerDrafts = new ComposerDraftStore();
  let selectedComposerDraftKey = untrack(() =>
    activeConvId
      ? conversationComposerDraftKey(activeConvId)
      : newConversationComposerDraftKey(workspacePath, selectedRoleKey),
  );
  let activeComposerDraft = $state(composerDrafts.activate(selectedComposerDraftKey));

  function composerDraftKey(conversationId = activeConvId): string {
    return conversationId
      ? conversationComposerDraftKey(conversationId)
      : newConversationComposerDraftKey(workspacePath, selectedRoleKey);
  }

  function selectComposerDraft(key = composerDraftKey()): void {
    if (key === selectedComposerDraftKey) return;
    activeComposerDraft = composerDrafts.switchDraft(
      selectedComposerDraftKey,
      activeComposerDraft,
      key,
    );
    selectedComposerDraftKey = key;
  }

  function clearComposerDraft(key = selectedComposerDraftKey): void {
    const cleared = composerDrafts.clear(key);
    if (key === selectedComposerDraftKey) activeComposerDraft = cleared;
  }

  $effect(() => {
    selectComposerDraft(composerDraftKey());
  });
  const composerPreferences = new ComposerPreferences({
    getConfig: () => config,
    setConfig: (next) => (config = next),
    loadSettings,
    saveSettings,
    tauriAvailable,
  });
  // Keep pending submissions scoped to their conversation so switching chats while
  // a response is streaming never sends a message to the wrong conversation.
  let queuedChatMessages = $state<Record<string, QueuedChatMessage[]>>({});

  async function syncChatQueuePending(convId: string) {
    if (!tauriAvailable) return;
    await invoke("set_chat_queue_pending", {
      convId,
      pending: (queuedChatMessages[convId]?.length ?? 0) > 0,
    }).catch(() => {});
  }

  function removeQueuedMessage(convId: string, index: number) {
    queuedChatMessages = removeQueuedChatMessage(queuedChatMessages, convId, index);
    void syncChatQueuePending(convId);
  }

  function clearQueuedMessages(convId: string) {
    queuedChatMessages = clearQueuedChatMessages(queuedChatMessages, convId);
    void syncChatQueuePending(convId);
  }

  let currentNavigationLocation = $derived.by<AppNavigationLocation>(() => ({
    workspacePath,
    surface: settingsOpen ? "settings" : "chat",
    conversationId: activeConvId,
    roleKey: selectedRoleKey,
  }));
  let canGoBack = $derived(
    !navigationTransitioning && navigationCaptureDepth === 0 && navigationHistory.index > 0,
  );
  let canGoForward = $derived(
    !navigationTransitioning &&
      navigationCaptureDepth === 0 &&
      navigationHistory.index < navigationHistory.entries.length - 1,
  );

  $effect(() => {
    if (
      isDevInspectorWindow ||
      isQuickChatSurface ||
      standaloneDevPreview !== null ||
      isChannelsSettingsPreview ||
      isAgentsSettingsPreview ||
      isAgentPluginsSettingsPreview ||
      isMcpSettingsPreview ||
      initialLoading ||
      workspaceLoading ||
      navigationTransitioning ||
      navigationCaptureDepth > 0
    ) {
      return;
    }
    const nextHistory = recordNavigationLocation(navigationHistory, currentNavigationLocation);
    if (nextHistory !== navigationHistory) navigationHistory = nextHistory;
  });

  $effect(() => {
    composerPreferences.syncFromConfig();
  });

  // Streaming state for the currently visible conversation
  let isCurrentStreaming = $derived(
    activeConvId ? !!chatStreams.streamingConversationIds[activeConvId] : false,
  );
  let isCurrentStreamPaused = $derived(
    activeConvId ? !!chatStreams.pausedConversationIds[activeConvId] : false,
  );
  let currentStreamItems = $derived(
    activeConvId ? (chatStreams.itemsByConversation[activeConvId] ?? []) : [],
  );
  let currentStreamMessageId = $derived(
    activeConvId ? (chatStreams.assistantMessageIds[activeConvId] ?? null) : null,
  );
  let isCurrentAwaitingStreamOutput = $derived(
    activeConvId ? !!chatStreams.awaitingOutput[activeConvId] : false,
  );
  let currentMemoryRetrievalStage = $derived(
    activeConvId ? (chatStreams.memoryRetrievalStages[activeConvId] ?? null) : null,
  );
  let currentMemoryRetrievalCanSkip = $derived(
    activeConvId ? !!chatStreams.memoryRetrievalSkippable[activeConvId] : false,
  );
  let currentCheckpointFlowNode = $derived(
    activeConvId ? getActiveTipNode(convTrees[activeConvId]) : undefined,
  );
  let currentCheckpointFlow = $derived(
    activeConvId
      ? (liveCheckpointFlowProjections[activeConvId]?.flow ?? currentCheckpointFlowNode?.flow)
      : undefined,
  );

  $effect(() => {
    const key = checkpointFlowPanelKey(
      activeConvId,
      activeConvId ? (activeBranchIds[activeConvId] ?? null) : null,
      currentCheckpointFlow,
    );
    if (key === checkpointFlowPanelSelectionKey) return;
    checkpointFlowPanelSelectionKey = key;
    if (key === checkpointFlowPanelAutoOpenKey) {
      checkpointFlowPanelCollapsed = false;
      checkpointFlowPanelAutoOpenKey = null;
    }
  });

  $effect(() => {
    saveCheckpointFlowPanelCollapsed(window.localStorage, checkpointFlowPanelCollapsed);
  });
  const compactionOnlyConvIds = new Set<string>();
  const compactionProgressRevisions = new Map<string, number>();
  let workspacePrefsSaveQueue: Promise<void> = Promise.resolve();

  function applyStreamMutation(convId: string, mutate: (items: StreamItem[]) => StreamItem[]) {
    const items = mutate(chatStreams.itemsByConversation[convId] ?? []);
    chatStreams.itemsByConversation = { ...chatStreams.itemsByConversation, [convId]: items };
    persistStreamDraft(convId).catch(() => {});
  }

  let currentFileChanges = $derived.by(() => {
    const persisted = activeConvId ? (fileChangesPerConv[activeConvId] ?? []) : [];
    const live = activeConvId ? (liveFileChangesPerConv[activeConvId] ?? []) : [];
    const all = [
      ...persisted,
      ...live.filter((change) => !persisted.some((saved) => saved.id === change.id)),
    ];
    // Restrict to checkpoints that belong to the currently active branch tail.
    // Without this filter, file changes from sibling branches would leak into the details panel.
    // A self-contained tip snapshot assigns its display records to the tip.
    // File changes still belong to every checkpoint on the selected branch,
    // so derive that set from the tree rather than rendered message IDs.
    const activeCheckpoints =
      activeConvId && convTrees[activeConvId]
        ? ckIdsAlongActivePath(convTrees[activeConvId])
        : new Set(
            messages
              .filter((m) => m.role === "assistant" && m.checkpointId)
              .map((m) => m.checkpointId!),
          );
    const liveChangeIds = new Set(live.map((change) => change.id));
    const branchScoped =
      activeCheckpoints.size === 0 && !isCurrentStreaming
        ? all
        : all.filter((c) => activeCheckpoints.has(c.checkpoint_id) || liveChangeIds.has(c.id));
    // Deduplicate per path: prefer "new file" (old_patch===null) over edits;
    // among multiple edits for the same path keep only the latest.
    const byPath = new Map<string, FileChange>();
    for (const c of branchScoped) {
      const existing = byPath.get(c.path);
      if (!existing) {
        byPath.set(c.path, c);
      } else if (existing.old_patch !== null && c.old_patch === null) {
        byPath.set(c.path, c);
      } else if (existing.old_patch !== null && c.old_patch !== null) {
        if (
          c.created_at > existing.created_at ||
          (c.created_at === existing.created_at && c.seq > existing.seq)
        ) {
          byPath.set(c.path, c);
        }
      }
    }
    return Array.from(byPath.values());
  });

  $effect(() => {
    const key =
      activeConvId && currentFileChanges.length > 0
        ? `${activeConvId}:${activeBranchIds[activeConvId] ?? "root"}`
        : null;
    if (key === fileChangesPanelSelectionKey) return;
    fileChangesPanelSelectionKey = key;
    if (!currentCheckpointFlow) checkpointFlowPanelCollapsed = !key;
  });

  async function loadMessagesForConv(
    convId: string,
    showLoadingState = true,
    forceRefresh = false,
  ): Promise<void> {
    if (loadedConvIds.has(convId) && !forceRefresh) return;
    loadedConvIds.add(convId);
    if (!tauriAvailable) return;
    const messageIdsAtStart = new Set(
      conversations
        .find((conversation) => conversation.id === convId)
        ?.messages.map((message) => message.id) ?? [],
    );
    if (showLoadingState) {
      loadingConversationIds = { ...loadingConversationIds, [convId]: true };
    }
    try {
      const [checkpoints, savedTip, branches] = await Promise.all([
        fetchRenderableCheckpoints(convId),
        invoke<string | null>("get_active_branch_tip", { convId }).catch(() => null),
        invoke<Array<{ id: string; head_checkpoint_id: string | null }>>("get_branches", {
          convId,
        }).catch(() => []),
      ]);
      await hydrateConversation(
        convId,
        checkpoints,
        savedTip,
        branches,
        showLoadingState,
        messageIdsAtStart,
      );
      void refreshTaskUsagesForConversation(convId);
      if (convId in checkpointLoadErrors) {
        const { [convId]: _cleared, ...rest } = checkpointLoadErrors;
        checkpointLoadErrors = rest;
      }
    } catch (error) {
      loadedConvIds.delete(convId);
      const detail = error instanceof Error ? error.message : String(error);
      checkpointLoadErrors = {
        ...checkpointLoadErrors,
        [convId]: `${tr("checkpointLoadFailed")} ${detail || "Unknown error"}`,
      };
    } finally {
      if (showLoadingState) {
        const { [convId]: _loading, ...rest } = loadingConversationIds;
        loadingConversationIds = rest;
      }
    }
  }

  async function refreshLiveCheckpointTip(convId: string, checkpointId: string): Promise<void> {
    if (!tauriAvailable) return;
    const version = (liveCheckpointRefreshVersions.get(convId) ?? 0) + 1;
    const flowVersion = liveCheckpointFlowProjections[convId]?.version ?? 0;
    liveCheckpointRefreshVersions.set(convId, version);
    try {
      const checkpoints = await fetchRenderableCheckpoints(convId);
      if (liveCheckpointRefreshVersions.get(convId) !== version) return;
      if (!checkpoints.some((checkpoint) => checkpoint.meta.checkpoint_id === checkpointId)) return;
      convTrees = {
        ...convTrees,
        [convId]: reconcileLiveCheckpointTip(checkpoints, convTrees[convId], checkpointId),
      };
      if ((liveCheckpointFlowProjections[convId]?.version ?? 0) === flowVersion) {
        const { [convId]: _durableFlow, ...rest } = liveCheckpointFlowProjections;
        liveCheckpointFlowProjections = rest;
      }
    } catch (error) {
      if (liveCheckpointRefreshVersions.get(convId) === version) {
        console.error(`Failed to refresh live checkpoint ${checkpointId}:`, error);
      }
    }
  }

  function applyLiveCheckpointFlow(convId: string, update: GoalRunUpdatedEvent): void {
    const current = liveCheckpointFlowProjections[convId];
    const next = updateLiveCheckpointFlowProjection(current, update);
    if (!next || next === current) return;
    const previous = current?.flow ?? getActiveTipNode(convTrees[convId])?.flow;
    if (convId === activeConvId && shouldAutoOpenCheckpointFlowPanel(previous, next.flow)) {
      checkpointFlowPanelAutoOpenKey = checkpointFlowPanelKey(
        convId,
        activeBranchIds[convId] ?? null,
        next.flow,
      );
      checkpointFlowPanelCollapsed = false;
    }
    liveCheckpointFlowProjections = { ...liveCheckpointFlowProjections, [convId]: next };
  }

  async function hydrateConversation(
    convId: string,
    checkpoints: StartupConversationBundle["checkpoints"],
    savedTip: string | null,
    branches: Array<{ id: string; head_checkpoint_id: string | null }>,
    syncBackendHistory: boolean,
    messageIdsAtStart?: ReadonlySet<string>,
  ): Promise<void> {
    mergeDurableFollowUpSuggestions(checkpoints);
    let tree = buildTreeFromCheckpoints(checkpoints, convTrees[convId]);
    if (savedTip) tree = selectActivePathToCheckpoint(tree, savedTip);
    const activeBranch = branches.find((branch) => branch.head_checkpoint_id === savedTip);
    const nextActiveBranchIds = { ...activeBranchIds };
    if (activeBranch) nextActiveBranchIds[convId] = activeBranch.id;
    else delete nextActiveBranchIds[convId];
    activeBranchIds = nextActiveBranchIds;
    convTrees = { ...convTrees, [convId]: tree };
    const pendingProjection = restorePendingUserInputFromCheckpoint(
      convId,
      computeActivePath(tree),
      checkpoints,
    );
    if (pendingProjection.pendingRequest) {
      pendingUserInputs = {
        ...pendingUserInputs,
        [convId]: pendingProjection.pendingRequest,
      };
    }
    const hydratedMessages = pendingProjection.messages;
    const idx = conversations.findIndex((conversation) => conversation.id === convId);
    if (idx !== -1) {
      const visible = conversations[idx].messages;
      const msgs = chatStreams.streamingConversationIds[convId]
        ? preserveStreamingMessagesDuringHydration(
            visible,
            hydratedMessages,
            pendingForkUserMessageIds[convId],
          )
        : preserveMessagesAddedDuringHydration(visible, hydratedMessages, messageIdsAtStart);
      // A normal completed turn is already represented by the client-side
      // stream finalizer. Keep those message instances when only checkpoint
      // metadata changed so the visible transcript does not remount.
      const sameVisibleStructure =
        visible.length === msgs.length &&
        visible.every((message, index) => {
          const restored = msgs[index];
          return (
            message.id === restored.id &&
            message.role === restored.role &&
            message.content === restored.content &&
            isCompactionBoundary(message) === isCompactionBoundary(restored)
          );
        });

      conversations[idx] = sameVisibleStructure
        ? {
            ...conversations[idx],
            messages: visible.map((message, index) => {
              const restored = msgs[index];
              return {
                ...message,
                items: restored.items ?? message.items,
                checkpointId: restored.checkpointId ?? message.checkpointId,
                turn: restored.turn ?? message.turn,
                tags: restored.tags ?? message.tags,
                agentTag: restored.agentTag ?? message.agentTag,
              };
            }),
          }
        : { ...conversations[idx], messages: msgs };
    }
    if (syncBackendHistory) await syncAgentHistoryToActivePath(convId, tree);
  }

  /**
   * `chat-user-input-request` is an ephemeral Tauri event. When the webview is
   * recreated, recover a still-pending form from the active checkpoint instead
   * of waiting for an event that has already been emitted.
   */
  function restorePendingUserInputFromCheckpoint(
    convId: string,
    messages: ChatMessage[],
    checkpoints: Awaited<ReturnType<typeof fetchRenderableCheckpoints>>,
  ): { messages: ChatMessage[]; pendingRequest?: UserInputRequest } {
    const assistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.checkpointId);
    if (!assistant?.checkpointId) return { messages };

    const checkpoint = checkpoints.find(
      ({ meta }) => meta.checkpoint_id === assistant.checkpointId,
    );
    if (!checkpoint) return { messages };
    const requests = pendingUserInputRequestsFromCheckpoint(convId, checkpoint);
    if (requests.length === 0) return { messages };
    // Each persisted tool use is rendered as its own assistant message. Attach
    // an approval across the complete timeline by toolUseId; limiting this to
    // the final assistant message turns earlier calls in a batch into detached
    // forms.
    let restored = messages;
    for (const request of requests) {
      let matched = false;
      restored = restored.map((message) => {
        const items = message.items;
        if (
          !items?.some((item) => item.type === "tool_call" && item.toolUseId === request.request_id)
        ) {
          return message;
        }
        matched = true;
        const withoutAskUserCard =
          request.kind === "ask_user"
            ? items.filter(
                (item) => item.type !== "tool_call" || item.toolUseId !== request.request_id,
              )
            : items;
        return { ...message, items: appendUserInput(withoutAskUserCard, request) };
      });
      // A legacy checkpoint can lack the provider ID on an ask_user card. Its
      // form is still safe to render independently; approvals never use this
      // fallback because that would risk authorizing the wrong tool.
      if (!matched && request.kind === "ask_user") {
        restored = restored.map((message) =>
          message.id === assistant.id
            ? { ...message, items: appendUserInput(message.items ?? [], request) }
            : message,
        );
      }
    }
    return { messages: restored, pendingRequest: requests[0] };
  }

  /**
   * Rebuild an interrupted ask_user form from the self-contained checkpoint.
   * Its phase says that input is pending; the final tool_use is the durable
   * form schema. No opaque checkpoint state is required.
   */
  function pendingUserInputRequestsFromCheckpoint(
    convId: string,
    checkpoint: Awaited<ReturnType<typeof fetchRenderableCheckpoints>>[number],
  ): UserInputRequest[] {
    if (checkpoint.data.phase !== "interrupted") return [];
    const resolved = new Set(
      checkpoint.data.messages
        .filter((message) => message.role === "user")
        .flatMap((message) => message.content)
        .filter((content) => content.type === "tool_result")
        .map((content) => String(content.tool_use_id)),
    );
    const pending = checkpoint.data.messages
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.content)
      .filter((content) => content.type === "tool_use" && !resolved.has(String(content.id)));
    return pending.flatMap((content) => {
      const toolUse = content as { id: string; name: string; input?: unknown };
      if (toolUse.name === "ask_user") {
        const request = askUserRequestFromToolUse(toolUse as Record<string, unknown>, convId);
        return request ? [request] : [];
      }
      return [
        {
          request_id: toolUse.id,
          conv_id: convId,
          kind: "tool_approval" as const,
          title: "Approve tool call",
          description: `Review the exact tool call before allowing it:\n\n${toolUse.name}\n${JSON.stringify(toolUse.input, null, 2)}`,
          fields: [
            {
              type: "confirm" as const,
              name: "approved",
              label: "Approve this tool call once",
              default: false,
            },
          ],
          submit_label: "Approve and continue",
          cancel_label: "Deny",
        },
      ];
    });
  }

  /** Attach a follow-up approval to the already-finalized interrupted turn.
   * Intermediate approvals do not re-emit their ToolCall, so restricting the
   * event to `chatStreams.itemsByConversation` loses the next form until a full refresh. */
  function attachPendingUserInputToMessages(convId: string, request: UserInputRequest): boolean {
    const convIdx = conversations.findIndex((conversation) => conversation.id === convId);
    if (convIdx === -1) return false;
    const conv = conversations[convIdx];
    let matched = false;
    const messages = conv.messages.map((message) => {
      if (message.role !== "assistant" || !message.items) return message;
      const ownsRequest = message.items.some(
        (item) =>
          item.type === "tool_call" &&
          (item.toolUseId === request.request_id ||
            item.approval?.request.request_id === request.request_id),
      );
      if (!ownsRequest) return message;
      matched = true;
      return { ...message, items: appendUserInput(message.items, request) };
    });
    if (matched) {
      conversations[convIdx] = { ...conv, messages, updatedAt: Date.now() };
    }
    return matched;
  }

  async function syncAgentHistoryToActivePath(
    convId: string,
    tree = convTrees[convId],
  ): Promise<void> {
    if (!tauriAvailable) return;
    const path = tree ? computeActivePath(tree) : [];
    const tipCheckpoint = [...path]
      .reverse()
      .find((m) => m.role === "assistant" && m.checkpointId)?.checkpointId;
    await invoke("restore_agent_history", {
      convId,
      checkpointId: tipCheckpoint ?? null,
    }).catch((e) => console.warn("restore_agent_history failed", e));
  }

  async function ensureActiveBranch(
    convId: string,
    forkedFromCheckpointId?: string | null,
    forkedFromMessageId?: string | null,
  ): Promise<string | null> {
    if (!tauriAvailable) return null;
    if (forkedFromCheckpointId === undefined && activeBranchIds[convId]) {
      return activeBranchIds[convId];
    }
    if (forkedFromCheckpointId === undefined) {
      const branches = await invoke<Array<{ id: string; head_checkpoint_id: string | null }>>(
        "get_branches",
        { convId },
      ).catch(() => []);
      const tip = [...(convTrees[convId] ? computeActivePath(convTrees[convId]) : [])]
        .reverse()
        .find((message) => message.role === "assistant" && message.checkpointId)?.checkpointId;
      const existing = branches.find((branch) => branch.head_checkpoint_id === tip);
      if (existing) {
        activeBranchIds = { ...activeBranchIds, [convId]: existing.id };
        return existing.id;
      }
    }
    const id = crypto.randomUUID();
    const parentBranchId = activeBranchIds[convId] ?? null;
    await invoke("create_branch", {
      id,
      convId,
      parentBranchId,
      forkedFromCheckpointId: forkedFromCheckpointId ?? null,
      forkedFromMessageId: forkedFromMessageId ?? null,
    });
    activeBranchIds = { ...activeBranchIds, [convId]: id };
    return id;
  }

  async function loadFileChangesForConv(convId: string): Promise<FileChange[] | null> {
    if (!tauriAvailable) return null;
    try {
      const changes = await fetchFileChanges(convId);
      fileChangesPerConv = { ...fileChangesPerConv, [convId]: changes };
      return changes;
    } catch {
      return null;
    }
  }

  function clearLiveFileChanges(convId: string, changeIds?: Set<string>) {
    const current = liveFileChangesPerConv[convId] ?? [];
    const remaining = changeIds ? current.filter((change) => !changeIds.has(change.id)) : [];
    if (remaining.length > 0) {
      liveFileChangesPerConv = { ...liveFileChangesPerConv, [convId]: remaining };
      return;
    }
    const { [convId]: _live, ...rest } = liveFileChangesPerConv;
    liveFileChangesPerConv = rest;
  }

  function reconcileLiveFileChanges(
    convId: string,
    durableChanges: FileChange[],
    finalizedIds: ReadonlySet<string>,
  ): void {
    const current = liveFileChangesPerConv[convId] ?? [];
    const remaining = retainUndurableFileChanges(current, durableChanges, finalizedIds);
    if (remaining.length === current.length) return;
    if (remaining.length > 0) {
      liveFileChangesPerConv = { ...liveFileChangesPerConv, [convId]: remaining };
      return;
    }
    clearLiveFileChanges(convId);
  }

  function clearPendingInput(convId: string, requestId?: string) {
    if (
      convId in pendingUserInputs &&
      (!requestId || pendingUserInputs[convId]?.request_id === requestId)
    ) {
      const { [convId]: _drop, ...rest } = pendingUserInputs;
      pendingUserInputs = rest;
    }
  }

  async function submitUserInput(requestId: string, values: Record<string, unknown>) {
    await resolvePendingUserInput(
      requestId,
      { values },
      "answered",
      "resume_interrupted_chat failed",
    );
  }

  async function cancelUserInput(requestId: string) {
    await resolvePendingUserInput(
      requestId,
      { cancelled: true },
      "cancelled",
      "cancel user input failed",
    );
  }

  async function resolvePendingUserInput(
    requestId: string,
    response: unknown,
    state: "answered" | "cancelled",
    errorLabel: string,
  ) {
    const convId = activeConvId;
    if (!convId) return;
    const resolution = userInputResolutions.begin(requestId, convId);
    if (!resolution) return;

    const requestIsInLiveTurn = (chatStreams.itemsByConversation[convId] ?? []).some((item) =>
      hasInputRequest(item, requestId),
    );
    const terminalHandoff = requestIsInLiveTurn
      ? interruptTerminalHandoffs.wait(convId)
      : Promise.resolve();

    const assistantMessageId = crypto.randomUUID();
    // Optimistically remove only the clicked form. Other approval cards remain
    // interactive while their exact request IDs wait on the runtime queue.
    markUserInputResolved(convId, requestId, state, response);
    try {
      // The approval request event precedes the run's terminal event. Preserve
      // the live assistant turn until `onInterrupted` has moved it into the
      // durable transcript; otherwise initializing the resumed stream here
      // erases the text and tool cards that the user just approved.
      await terminalHandoff;
      if (resolution.firstForConversation) {
        chatStreams.startTiming(convId);
        chatStreams.streamingConversationIds = {
          ...chatStreams.streamingConversationIds,
          [convId]: true,
        };
        // All approvals in this provider batch continue the same logical Turn.
        // Initialize its resumed stream once while sibling responses queue in Rust.
        chatStreams.itemsByConversation = { ...chatStreams.itemsByConversation, [convId]: [] };
        chatStreams.assistantMessageIds = {
          ...chatStreams.assistantMessageIds,
          [convId]: assistantMessageId,
        };
      }
      await openAgent.resumeInterrupt({
        convId,
        interruptId: requestId,
        response: JSON.stringify(response),
        branchId: activeBranchIds[convId] ?? null,
        assistantMessageId,
      });
      clearPendingInput(convId, requestId);
    } catch (err) {
      console.warn(errorLabel, err);
      markUserInputResolved(convId, requestId, "pending", undefined);
      if (!userInputResolutions.hasOtherInConversation(convId, requestId)) {
        chatStreams.cleanup(convId);
      }
    } finally {
      userInputResolutions.finish(requestId);
    }
  }

  function markUserInputResolved(
    convId: string,
    requestId: string,
    state: "pending" | "answered" | "cancelled",
    response: unknown,
  ) {
    const liveItems = chatStreams.itemsByConversation[convId];
    if (liveItems?.some((item) => hasInputRequest(item, requestId))) {
      chatStreams.itemsByConversation = {
        ...chatStreams.itemsByConversation,
        [convId]: resolveUserInput(liveItems, requestId, state, response),
      };
    }

    const convIdx = conversations.findIndex((c) => c.id === convId);
    if (convIdx === -1) return;
    const updatedMessages = conversations[convIdx].messages.map((msg) => {
      if (!msg.items?.some((i) => hasInputRequest(i, requestId))) {
        return msg;
      }
      const next = { ...msg, items: resolveUserInput(msg.items, requestId, state, response) };
      return next;
    });
    conversations[convIdx] = {
      ...conversations[convIdx],
      messages: updatedMessages,
      updatedAt: Date.now(),
    };
    const changedMsg = updatedMessages.find((msg) =>
      msg.items?.some((i) => hasInputRequest(i, requestId)),
    );
    if (changedMsg) saveAssistantMessage(convId, changedMsg, changedMsg.checkpointId ?? null);
  }

  function hasInputRequest(item: StreamItem, requestId: string): boolean {
    return (
      (item.type === "user_input" && item.request.request_id === requestId) ||
      (item.type === "tool_call" && item.approval?.request.request_id === requestId)
    );
  }

  function attachApprovedToolResult(convId: string, result: string, toolUseId?: string): boolean {
    const convIdx = conversations.findIndex((c) => c.id === convId);
    if (convIdx === -1) return false;

    const conv = conversations[convIdx];
    for (let messageIndex = conv.messages.length - 1; messageIndex >= 0; messageIndex--) {
      const message = conv.messages[messageIndex];
      if (message.role !== "assistant" || !message.items) continue;
      const itemIndex = message.items.findIndex(
        (item) =>
          item.type === "tool_call" &&
          item.result === undefined &&
          (toolUseId
            ? item.toolUseId === toolUseId || item.approval?.request.request_id === toolUseId
            : item.approval?.state === "answered"),
      );
      if (itemIndex === -1) continue;

      const items = [...message.items];
      const item = items[itemIndex];
      if (item.type !== "tool_call") continue;
      items[itemIndex] = {
        ...item,
        result,
        approval: item.approval ? { ...item.approval, state: "answered" } : item.approval,
      };
      const updated = { ...message, items };
      const messages = [...conv.messages];
      messages[messageIndex] = updated;
      conversations[convIdx] = { ...conv, messages, updatedAt: Date.now() };
      saveAssistantMessage(convId, updated, message.checkpointId ?? null);
      return true;
    }
    return false;
  }

  async function handleRevertFileChange(changeId: string): Promise<void> {
    const convId = activeConvId;
    if (!convId) return;
    try {
      await revertFileChange(changeId);
      fileChangesPerConv = {
        ...fileChangesPerConv,
        [convId]: (fileChangesPerConv[convId] ?? []).filter((c) => c.id !== changeId),
      };
    } catch (e) {
      alert(`撤回失败: ${e}`);
    }
  }

  // ─── Branch / Re-execute ─────────────────────────────────────────────────────

  async function reExecuteMsg(
    convId: string,
    assistantMsgIdx: number,
    newText?: string,
    newAttachments?: ChatAttachment[],
    newContexts?: UserMessageContext[],
  ) {
    if (chatStreams.streamingConversationIds[convId] || !tauriAvailable) return;
    const convIdx = conversations.findIndex((c) => c.id === convId);
    if (convIdx === -1) return;
    const conv = conversations[convIdx];
    const assistantMsg = conv.messages[assistantMsgIdx];
    if (!assistantMsg || assistantMsg.role !== "assistant") return;
    const checkpointId = assistantMsg.checkpointId;
    if (!checkpointId) return;
    // Tool calls and their results sit between the user prompt and the final
    // assistant reply, so the prior display message is not necessarily user.
    let userMsgIdx = -1;
    for (let index = assistantMsgIdx - 1; index >= 0; index -= 1) {
      const message = conv.messages[index];
      if (message.role === "user" && message.checkpointId === checkpointId) {
        userMsgIdx = index;
        break;
      }
    }
    const userMsg = conv.messages[userMsgIdx];
    if (!userMsg || userMsg.role !== "user") return;
    const sourceAttachments =
      newAttachments ??
      (userMsg.items ?? [])
        .filter(
          (item): item is Extract<StreamItem, { type: "attachment" }> => item.type === "attachment",
        )
        .map((item) => item.attachment);
    const sourceContexts =
      newContexts ??
      (userMsg.items ?? [])
        .filter((item): item is Extract<StreamItem, { type: "quote" }> => item.type === "quote")
        .map((item) => item.context);
    const text = (newText ?? userMsg.content).trim();
    if (!text && sourceAttachments.length === 0 && sourceContexts.length === 0) return;
    let resendAttachments: ChatAttachment[];
    try {
      resendAttachments = await Promise.all(
        sourceAttachments.map(async (attachment) => {
          if (!attachment.path.startsWith("sha256:")) return attachment;
          const path = await invoke<string>("materialize_attachment_blob", {
            blobId: attachment.path,
            name: attachment.name,
          });
          return { ...attachment, path };
        }),
      );
    } catch (error) {
      showToast({
        title: $t("attachmentRestoreFailed"),
        description: String(error),
        variant: "error",
      });
      return;
    }

    // A complete tip snapshot stamps every rendered message with the tip id,
    // even though older messages were introduced by earlier checkpoints. Find
    // the first checkpoint on the selected path that contains this stable user
    // id; its parent is the exact history prefix before the edited turn.
    const newSiblingParentCk = findForkParentCheckpointId(convTrees[convId], userMsg.id);
    if (newSiblingParentCk === undefined) return;
    const forkSourceCheckpointId = getActiveTipNode(convTrees[convId])?.ckId;
    if (!forkSourceCheckpointId) return;

    if (!(await externalRuntimeTransport)) {
      try {
        await invoke("rollback_to_checkpoint", { convId, checkpointId });
      } catch {
        return;
      }

      // Embedded diagnostics do not run through the Runtime HTTP branch operation.
      const cutMsgs = conv.messages.slice(userMsgIdx);
      const rolledBackCps = new Set(
        cutMsgs.filter((m) => m.role === "assistant" && m.checkpointId).map((m) => m.checkpointId!),
      );
      const allChanges = fileChangesPerConv[convId] ?? [];
      const toRevert = allChanges.filter((fc) => rolledBackCps.has(fc.checkpoint_id));
      for (const change of [...toRevert].reverse()) {
        await invoke("revert_file_change_keep", { changeId: change.id }).catch(() => {});
      }
    }

    conversations[convIdx] = {
      ...conv,
      messages: conv.messages.slice(0, userMsgIdx),
      updatedAt: Date.now(),
    };

    // Tell finalize: attach the new turn as a sibling under newSiblingParentCk.
    pendingParentCk = { ...pendingParentCk, [convId]: newSiblingParentCk };
    pendingForkMessageId = { ...pendingForkMessageId, [convId]: userMsg.id };
    pendingForkSourceCheckpointId = {
      ...pendingForkSourceCheckpointId,
      [convId]: forkSourceCheckpointId,
    };
    selectComposerDraft(conversationComposerDraftKey(convId));
    activeComposerDraft.text = text;
    activeComposerDraft.attachments = resendAttachments;
    activeComposerDraft.contexts = sourceContexts;
    if (activeConvId !== convId) {
      restoringSurface = "conversation";
      activeConvId = convId;
      cacheRestoreSurface("conversation", convId);
      invoke("set_active_conversation", {
        convId,
        workspace: workspacePath || "",
      }).catch(() => {});
    }
    await sendMessage();
  }

  // Switch the active child at a given parent (parentKey = ROOT_KEY for top-level forks).
  // Replays file changes so the disk matches the new path and restores agent history.
  async function switchBranchAt(convId: string, parentKey: string, targetIdx: number) {
    if (chatStreams.streamingConversationIds[convId]) return;
    const tree = convTrees[convId];
    if (!tree) return;
    const siblings =
      parentKey === ROOT_KEY ? tree.rootIds : (tree.nodes[parentKey]?.childIds ?? []);
    const currentIdx = tree.activeChild[parentKey];
    if (targetIdx === currentIdx) return;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;
    const convIdx = conversations.findIndex((c) => c.id === convId);
    if (convIdx === -1) return;

    const override = { ...tree.activeChild, [parentKey]: targetIdx };
    const updatedTree: ConvTree = { ...tree, activeChild: override };
    const targetTipCheckpoint = getActiveTipNode(updatedTree)?.ckId;
    if (!targetTipCheckpoint) return;

    if (tauriAvailable && (await externalRuntimeTransport)) {
      try {
        await openAgent.switchRemoteConversationBranch(convId, targetTipCheckpoint);
        convTrees = { ...convTrees, [convId]: updatedTree };
        await Promise.all([
          loadMessagesForConv(convId, false, true),
          loadFileChangesForConv(convId),
        ]);
        scrollToBottom();
      } catch (error) {
        checkpointLoadErrors = {
          ...checkpointLoadErrors,
          [convId]: `${tr("checkpointLoadFailed")} ${String(error)}`,
        };
      }
      return;
    }

    const sourceCps = ckIdsAlongActivePath(tree);
    const targetCps = ckIdsAlongActivePath(tree, override);

    if (tauriAvailable) {
      const allChanges = fileChangesPerConv[convId] ?? [];
      const sortByOrder = (a: FileChange, b: FileChange) =>
        a.created_at - b.created_at || a.seq - b.seq;
      const toRevert = allChanges
        .filter((fc) => sourceCps.has(fc.checkpoint_id) && !targetCps.has(fc.checkpoint_id))
        .sort(sortByOrder);
      const toApply = allChanges
        .filter((fc) => targetCps.has(fc.checkpoint_id) && !sourceCps.has(fc.checkpoint_id))
        .sort(sortByOrder);

      // Unwind source-only edits in reverse, then apply target-only edits forward.
      for (const change of [...toRevert].reverse()) {
        await invoke("revert_file_change_keep", { changeId: change.id }).catch((e) => {
          console.warn("revert_file_change_keep failed", change.path, e);
        });
      }
      for (const change of toApply) {
        await invoke("apply_file_change_forward", { changeId: change.id }).catch((e) => {
          console.warn("apply_file_change_forward failed", change.path, e);
        });
      }

      // Restore the agent's in-memory history to the tip of the newly-active path
      // so the next message continues from where the user is now looking.
      await invoke("restore_agent_history", {
        convId,
        checkpointId: targetTipCheckpoint,
      }).catch((e) => console.warn("restore_agent_history failed", e));
    }

    let branchMessages = computeActivePath(updatedTree);
    if (tauriAvailable) {
      // A branch switch rebuilds messages from checkpoint records. Re-project a
      // pending ask_user from the selected tip's tool_use plus interrupt state,
      // just as a full conversation load does.
      const checkpoints = await fetchRenderableCheckpoints(convId).catch(() => []);
      const pendingProjection = restorePendingUserInputFromCheckpoint(
        convId,
        branchMessages,
        checkpoints,
      );
      branchMessages = pendingProjection.messages;
      if (pendingProjection.pendingRequest) {
        pendingUserInputs = {
          ...pendingUserInputs,
          [convId]: pendingProjection.pendingRequest,
        };
      }
    }
    const savedTip = getActiveTipNode(updatedTree)?.ckId;
    if (tauriAvailable) {
      // Do not expose an approval card until its durable selected tip and
      // branch id are aligned. The resume command uses these values to reject
      // approvals aimed at a different branch.
      await invoke("set_active_branch_tip", { convId, checkpointId: savedTip });
      const branches = await invoke<Array<{ id: string; head_checkpoint_id: string | null }>>(
        "get_branches",
        { convId },
      ).catch(() => []);
      const branch = branches.find((item) => item.head_checkpoint_id === savedTip);
      const nextActiveBranchIds = { ...activeBranchIds };
      if (branch) nextActiveBranchIds[convId] = branch.id;
      else delete nextActiveBranchIds[convId];
      activeBranchIds = nextActiveBranchIds;
    }
    convTrees = { ...convTrees, [convId]: updatedTree };
    conversations[convIdx] = {
      ...conversations[convIdx],
      messages: branchMessages,
      flowKind: savedTip ? updatedTree.nodes[savedTip]?.flowKind : undefined,
      flowStatus: savedTip ? updatedTree.nodes[savedTip]?.flowStatus : undefined,
      updatedAt: Date.now(),
    };
    scrollToBottom();
  }

  async function commitEdit(
    convId: string,
    userMsgIdx: number,
    newText: string,
    attachments: ChatAttachment[],
    contexts: UserMessageContext[],
  ) {
    const text = newText.trim();
    if (!text && attachments.length === 0 && contexts.length === 0) return;
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return;
    const userMsg = conv.messages[userMsgIdx];
    if (!userMsg || userMsg.role !== "user") return;
    const assistantMsg = conv.messages[userMsgIdx + 1];
    if (!assistantMsg?.checkpointId) return;
    await reExecuteMsg(convId, userMsgIdx + 1, text, attachments, contexts);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  function mergeConversationMetadata(
    current: Conversation[],
    incoming: Conversation[],
  ): Conversation[] {
    const incomingById = new Map(incoming.map((conversation) => [conversation.id, conversation]));
    const merged = current.map((conversation) => {
      const replacement = incomingById.get(conversation.id);
      if (!replacement) return conversation;
      incomingById.delete(conversation.id);
      return { ...replacement, messages: conversation.messages };
    });
    return [...merged, ...incomingById.values()];
  }

  type ConversationLocation = {
    conversations: Conversation[];
    index: number;
    isCurrentWorkspace: boolean;
  };

  function findConversationLocation(convId: string): ConversationLocation | null {
    const currentIndex = conversations.findIndex((conversation) => conversation.id === convId);
    if (currentIndex !== -1) {
      return { conversations, index: currentIndex, isCurrentWorkspace: true };
    }
    for (const snapshot of workspaceConversationSnapshots.values()) {
      const index = snapshot.findIndex((conversation) => conversation.id === convId);
      if (index !== -1) {
        return { conversations: snapshot, index, isCurrentWorkspace: false };
      }
    }
    return null;
  }

  function promoteConversationInRecents(conversation: Conversation): void {
    const conversationRoleKey = conversation.roleId ?? defaultRoleKey;
    if (conversationRoleKey !== selectedRoleKey) return;
    recentConversations = promoteRecentConversation(
      recentConversations,
      conversation,
      workspacePath,
    );
  }

  async function applyConversationTitleUpdate(convId: string, title: string): Promise<void> {
    if (!title.trim()) return;
    const existing =
      conversations.find((conversation) => conversation.id === convId) ??
      recentConversations.find((conversation) => conversation.id === convId) ??
      searchConversations.find((conversation) => conversation.id === convId) ??
      (await fetchConversationMeta(convId).catch(() => null));
    if (!existing) return;

    const updated = { ...existing, title, updatedAt: Date.now() };
    conversations = conversations.map((conversation) =>
      conversation.id === convId
        ? { ...conversation, title: updated.title, updatedAt: updated.updatedAt }
        : conversation,
    );
    searchConversations = searchConversations.map((conversation) =>
      conversation.id === convId
        ? { ...conversation, title: updated.title, updatedAt: updated.updatedAt }
        : conversation,
    );
    promoteConversationInRecents(updated);
  }

  function roleSelectionStorageKey(currentWorkspace = workspacePath): string {
    return `openagent.active-role:${currentWorkspace || "global"}`;
  }

  function storedRoleSelection(currentWorkspace = workspacePath): string {
    if (typeof window === "undefined") return defaultRoleKey;
    return window.localStorage.getItem(roleSelectionStorageKey(currentWorkspace)) || defaultRoleKey;
  }

  async function loadAvailableRoles(): Promise<void> {
    if (!tauriAvailable) {
      agentRoles = [];
      selectedRoleKey = defaultRoleKey;
      return;
    }
    const [localRoles, globalRoles] = await Promise.all([
      invoke<AgentRole[]>("list_agent_roles", { scope: "local" }).catch(() => []),
      invoke<AgentRole[]>("list_agent_roles", { scope: "global" }).catch(() => []),
    ]);
    const seen = new Set<string>();
    agentRoles = [...localRoles, ...globalRoles].filter((role) => {
      if (seen.has(role.id)) return false;
      seen.add(role.id);
      return true;
    });
    if (selectedRoleKey !== defaultRoleKey && !seen.has(selectedRoleKey)) {
      selectedRoleKey = defaultRoleKey;
    }
  }

  async function openRoleEditor(role: AgentRole | null): Promise<void> {
    roleEditorRole = role;
    roleEditorOpen = true;
    roleEditorResourcesLoading = true;
    try {
      roleEditorSkills = tauriAvailable
        ? ((await openAgent.invokeProduct("list_skills", {}).catch(() => [])) as SkillMetadata[])
        : [];
    } finally {
      roleEditorResourcesLoading = false;
    }
  }

  async function saveRoleEditor(draft: {
    id: string | null;
    scope: "global" | "local";
    name: string;
    description: string;
    skillIds: string[];
    mcpServerIds: string[];
  }): Promise<void> {
    roleEditorSaving = true;
    try {
      const saved = await openAgent.invokeProduct("save_agent_role", {
        id: draft.id,
        scope: draft.scope,
        name: draft.name,
        description: draft.description,
        skillIds: draft.skillIds,
        mcpServerIds: draft.mcpServerIds,
      });
      await loadAvailableRoles();
      roleEditorOpen = false;
      if (!draft.id) await activateNewConversationSurface(saved.id);
      showToast({ title: $t("roleSaved"), variant: "success" });
    } catch (error) {
      showToast({ title: $t("settingsSaveFailed"), description: String(error), variant: "error" });
    } finally {
      roleEditorSaving = false;
    }
  }

  async function deleteRoleEditor(role: AgentRole): Promise<void> {
    const message = $t("deleteRoleConfirm").replace("{name}", role.name);
    if (!confirm(message)) return;
    roleEditorSaving = true;
    try {
      await openAgent.invokeProduct("delete_agent_role", { id: role.id });
      roleEditorOpen = false;
      await loadAvailableRoles();
      if (selectedRoleKey === role.id) await activateNewConversationSurface(defaultRoleKey);
    } catch (error) {
      showToast({ title: $t("settingsSaveFailed"), description: String(error), variant: "error" });
    } finally {
      roleEditorSaving = false;
    }
  }

  async function loadAvailableRolesForWorkspace(path: string): Promise<AgentRole[]> {
    if (!tauriAvailable) return [];
    const roles = await invoke<AgentRole[]>("list_agent_roles_for_workspace", {
      workspace: path,
    }).catch(() => []);
    const seen = new Set<string>();
    return [
      ...roles.filter((role) => role.scope !== "global"),
      ...roles.filter((role) => role.scope === "global"),
    ].filter((role) => {
      if (seen.has(role.id)) return false;
      seen.add(role.id);
      return true;
    });
  }

  async function reloadRoleConversations(preserveConversationId?: string | null): Promise<void> {
    if (!tauriAvailable) return;
    const preserved = preserveConversationId
      ? (conversations.find((conversation) => conversation.id === preserveConversationId) ??
        (await fetchConversationMeta(preserveConversationId).catch(() => null)))
      : null;
    const page = await fetchConversationPage(
      workspacePath || null,
      null,
      30,
      null,
      true,
      selectedRoleId,
    );
    const current =
      preserved && !conversations.some((item) => item.id === preserved.id)
        ? [...conversations, preserved]
        : conversations;
    conversations = mergeConversationMetadata(current, page.conversations);
    conversationNextCursor = page.nextCursor;
  }

  async function changeConversationRole(roleKey: string): Promise<void> {
    if (roleKey === selectedRoleKey) return;
    await activateNewConversationSurface(roleKey);
  }

  async function ensureConversationLineage(meta: Conversation): Promise<void> {
    const lineage: Conversation[] = [];
    const visited = new Set<string>();
    let current: Conversation | null = meta;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      lineage.push(current);
      const parentId: string | undefined = current.parentConvId;
      if (!parentId) break;
      current =
        conversations.find((conversation) => conversation.id === parentId) ??
        (await fetchConversationMeta(parentId).catch(() => null));
    }
    conversations = mergeConversationMetadata(conversations, lineage);
  }

  async function loadNextConversationPage(): Promise<void> {
    if (!tauriAvailable) return;
    const query = conversationSearchQuery.trim();
    if (query) {
      if (loadingMoreSearchConversations || !searchConversationNextCursor) return;
      const generation = conversationSearchGeneration;
      loadingMoreSearchConversations = true;
      try {
        const page = await fetchConversationPage(
          null,
          searchConversationNextCursor,
          30,
          query,
          false,
          null,
        );
        if (generation !== conversationSearchGeneration) return;
        searchConversations = mergeConversationMetadata(searchConversations, page.conversations);
        searchConversationNextCursor = page.nextCursor;
      } catch {
        // Keep the cursor so the observer can retry when it intersects again.
      } finally {
        if (generation === conversationSearchGeneration) {
          loadingMoreSearchConversations = false;
        }
      }
      return;
    }

    if (loadingMoreConversations || !conversationNextCursor) return;
    loadingMoreConversations = true;
    const requestedWorkspace = workspacePath;
    try {
      const page = await fetchConversationPage(
        requestedWorkspace || null,
        conversationNextCursor,
        30,
        null,
        true,
        selectedRoleId,
      );
      if (requestedWorkspace !== workspacePath) return;
      conversations = mergeConversationMetadata(conversations, page.conversations);
      conversationNextCursor = page.nextCursor;
    } catch {
      // Keep the cursor so the observer can retry when it intersects again.
    } finally {
      if (requestedWorkspace === workspacePath) loadingMoreConversations = false;
    }
  }

  async function refreshRecentConversations(): Promise<void> {
    if (!tauriAvailable) return;
    const generation = ++recentConversationGeneration;
    const roleKey = selectedRoleKey;
    const recentRoleId = roleKey === defaultRoleKey ? null : roleKey;
    const replacingRoleSnapshot = recentConversationRoleKey !== roleKey;
    if (replacingRoleSnapshot) recentConversations = [];
    loadingRecentConversations = replacingRoleSnapshot || recentConversations.length === 0;
    try {
      const page = await fetchConversationPage(null, null, 20, null, true, recentRoleId);
      if (generation !== recentConversationGeneration || roleKey !== selectedRoleKey) return;
      recentConversations = mergeRecentConversationRefresh(recentConversations, page.conversations);
      recentConversationRoleKey = roleKey;
    } catch (error) {
      console.warn("Failed to load recent conversations across workspaces:", error);
    } finally {
      if (generation === recentConversationGeneration && roleKey === selectedRoleKey) {
        loadingRecentConversations = false;
      }
    }
  }

  async function loadProjectConversations(path: string, roleKey: string): Promise<Conversation[]> {
    if (!tauriAvailable) return [];
    const roleId = roleKey === defaultRoleKey ? null : roleKey;
    const page = await fetchConversationPage(path, null, 30, null, true, roleId);
    return page.conversations;
  }

  function handleConversationSearch(query: string): void {
    conversationSearchQuery = query;
    conversationSearchGeneration += 1;
    if (conversationSearchTimer) clearTimeout(conversationSearchTimer);
    searchConversations = [];
    searchConversationNextCursor = null;
    loadingMoreSearchConversations = false;
    const normalized = query.trim();
    if (!normalized || !tauriAvailable) return;
    const generation = conversationSearchGeneration;
    conversationSearchTimer = setTimeout(async () => {
      loadingMoreSearchConversations = true;
      try {
        const page = await fetchConversationPage(null, null, 30, normalized, false, null);
        if (generation !== conversationSearchGeneration) return;
        searchConversations = page.conversations;
        searchConversationNextCursor = page.nextCursor;
      } catch {
        // Leave an empty result state; a new query or scroll can retry.
      } finally {
        if (generation === conversationSearchGeneration) {
          loadingMoreSearchConversations = false;
        }
      }
    }, 200);
  }

  async function selectSidebarConversation(id: string): Promise<void> {
    navigationCaptureDepth += 1;
    try {
      if (!conversations.some((conversation) => conversation.id === id)) {
        const meta = searchConversations.find((conversation) => conversation.id === id);
        if (meta) await ensureConversationLineage(meta);
      }
      const requestedWorkspace = workspacePath;
      const loadChildren = tauriAvailable
        ? fetchChildConversations(id, requestedWorkspace || null)
            .then((children) => {
              if (requestedWorkspace !== workspacePath) return;
              conversations = mergeConversationMetadata(conversations, children);
            })
            .catch((error) => {
              console.error(`Failed to load child conversations for ${id}:`, error);
            })
        : Promise.resolve();
      await Promise.all([switchConversation(id), loadChildren]);
    } finally {
      navigationCaptureDepth -= 1;
    }
  }

  onMount(() => {
    if (!usesNativeWindowMaterial) return;
    document.documentElement.classList.add("native-window-material");
    return () => document.documentElement.classList.remove("native-window-material");
  });

  onMount(() => {
    if (!tauriAvailable || !frontendActivationVersion) return;
    void invoke("confirm_frontend_activation", { version: frontendActivationVersion }).catch(
      (error) => console.error("Failed to confirm frontend activation:", error),
    );
  });

  onMount(() => {
    if (isDevInspectorWindow || standaloneDevPreview || isOnboardingSurface) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if ((config?.theme ?? "system") === "system") applyTheme("system");
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  });

  onMount(async () => {
    if (isDevInspectorWindow || standaloneDevPreview) return;
    if (isQuickChatSurface) {
      return;
    }
    if (isOnboardingSurface) {
      try {
        await loadSettings();
        await loadWorkspace();
      } catch (error) {
        console.error("Failed to load onboarding:", error);
      } finally {
        initialLoading = false;
      }
      return;
    }
    const mountedAt = performance.now();
    let bootstrapReadyAt = mountedAt;
    let startupApplied = false;
    let requiresOnboarding = false;
    try {
      // Seed isDarkTheme before settings load so shikiTheme is correct from first render
      isDarkTheme = window.matchMedia("(prefers-color-scheme: dark)").matches;

      if (tauriAvailable) {
        const bootstrap = await openAgent.getStartupBootstrap<StartupBootstrap>();
        bootstrapReadyAt = performance.now();
        await applyStartupBootstrap(bootstrap);
        // Live Runtime events are a lossy projection. Restore the complete
        // durable snapshot before subscribing so startup and resync never
        // reconstruct state from partial event delivery.
        await setupGlobalEventListeners();
        startupApplied = true;
        installDownloadHook();
        if (launchContext?.conversation_id) {
          await revealMemorySource(launchContext.conversation_id, launchContext.message_id ?? "");
        }
      } else {
        await loadSettings();
        await loadWorkspace();
        if (
          isChannelsSettingsPreview ||
          isAgentsSettingsPreview ||
          isAgentPluginsSettingsPreview ||
          isMcpSettingsPreview
        ) {
          SettingsView = (await import("$lib/components/SettingsView.svelte")).default;
          settingsInitialNav = isMcpSettingsPreview
            ? "extensions"
            : isAgentPluginsSettingsPreview
              ? "plugins"
              : isAgentsSettingsPreview
                ? "agents"
                : "channels";
          settingsOpen = true;
        }
        restoringSurface = "new-conversation";
        activeConvId = null;
      }
    } catch (error) {
      console.error("Failed to apply startup bootstrap:", error);
      if (tauriAvailable) {
        launchContext = await invoke<typeof launchContext>("get_workspace_launch_context").catch(
          () => null,
        );
        await loadSettings();
        if (launchContext?.workspace) workspacePath = launchContext.workspace;
        await loadWorkspace();
        selectedRoleKey = storedRoleSelection(workspacePath);
        await loadAvailableRoles();
        const page = await fetchConversationPage(
          workspacePath || null,
          null,
          30,
          null,
          true,
          selectedRoleId,
        );
        conversations = page.conversations;
        conversationNextCursor = page.nextCursor;
        await restoreWorkspaceConversation(workspacePath);
        void refreshRecentConversations();
      }
    } finally {
      let embeddingResourceReady = !tauriAvailable;
      if (tauriAvailable) {
        embeddingResourceReady = await invoke<EmbeddingResourceStatus>(
          "get_embedding_resource_status",
        )
          .then((resource) => resource.state === "ready")
          .catch(() => false);
      }
      if (
        config &&
        !isChannelsSettingsPreview &&
        !isAgentsSettingsPreview &&
        !isAgentPluginsSettingsPreview &&
        !isMcpSettingsPreview
      ) {
        requiresOnboarding = !config.onboarding_completed || !embeddingResourceReady;
      }
      const uiReadyAt = performance.now();
      initialLoading = false;
      await tick();
      if (tauriAvailable) {
        if (requiresOnboarding) {
          await invoke("reveal_onboarding_window").catch(async () => {
            await getCurrentWindow()
              .show()
              .catch(() => {});
          });
        } else {
          await invoke("reveal_main_window").catch(async () => {
            await getCurrentWindow()
              .show()
              .catch(() => {});
          });
        }
        const revealedAt = performance.now();
        console.info("[startup] initial window revealed", {
          surface: requiresOnboarding ? "onboarding" : "main",
          bootstrapMs: Math.round(bootstrapReadyAt - mountedAt),
          applyAndListenersMs: Math.round(uiReadyAt - bootstrapReadyAt),
          revealMs: Math.round(revealedAt - uiReadyAt),
          mountedToVisibleMs: Math.round(revealedAt - mountedAt),
        });
      }
    }

    if (tauriAvailable) {
      void openAgent
        .listAgentCommands()
        .then((commandSpecs) => {
          agentCommandSpecs = commandSpecs;
        })
        .catch(() => {});
      pollMemoryStatus();
      if (!launchContext?.workspace) {
        void initializeQuickChatShortcut(config?.quick_chat_shortcut).catch((error) => {
          console.warn("Failed to register quick chat shortcut", error);
        });
        void checkForAppUpdate();
      }
      if (!startupApplied && launchContext?.conversation_id) {
        void revealMemorySource(launchContext.conversation_id, launchContext.message_id ?? "");
      }
    }
  });

  // ─── Global event listeners (set up once, route by conv_id) ──────────────────

  async function applyStartupBootstrap(bootstrap: StartupBootstrap) {
    config = normalizeConfigShape(bootstrap.config);
    applyTheme(config.theme ?? "system");
    await initI18n(config.language);
    workspacePath = bootstrap.workspace_path;
    newConversationSuggestions = normalizeSuggestions(bootstrap.new_conversation_suggestions);
    workspace = bootstrap.workspace;
    launchContext = bootstrap.launch_context;
    recentWorkspaces = config.recent_workspaces ?? [];
    conversations = bootstrap.conversations.map(metaToConversation);
    conversationNextCursor = bootstrap.conversation_next_cursor;
    activeConvId = bootstrap.active_conv_id;
    const activeMeta = activeConvId
      ? conversations.find((conversation) => conversation.id === activeConvId)
      : null;
    selectedRoleKey = activeMeta?.roleId ?? storedRoleSelection(bootstrap.workspace_path);
    await loadAvailableRoles();
    await reloadRoleConversations(activeConvId);
    void refreshRecentConversations();

    if (activeConvId && bootstrap.active_conversation) {
      restoringSurface = "conversation";
      loadedConvIds.add(activeConvId);
      fileChangesPerConv = {
        ...fileChangesPerConv,
        [activeConvId]: bootstrap.active_conversation.file_changes,
      };
      await hydrateConversation(
        activeConvId,
        bootstrap.active_conversation.checkpoints,
        bootstrap.active_conversation.active_branch_tip,
        bootstrap.active_conversation.branches,
        false,
      );
    } else {
      restoringSurface = "new-conversation";
      activeConvId = null;
    }
    cacheRestoreSurface(restoringSurface, activeConvId, workspacePath);
  }

  function insertExternalUserMessage(
    convId: string,
    userMessage: ChatMessage,
    assistantMessageId: string,
  ): void {
    const index = conversations.findIndex((conversation) => conversation.id === convId);
    if (
      index === -1 ||
      conversations[index].messages.some((message) => message.id === userMessage.id)
    ) {
      return;
    }
    const existing = conversations[index];
    const assistantIndex = existing.messages.findIndex(
      (message) => message.id === assistantMessageId,
    );
    const messages = [...existing.messages];
    messages.splice(assistantIndex === -1 ? messages.length : assistantIndex, 0, userMessage);
    conversations[index] = { ...existing, messages, updatedAt: Date.now() };
  }

  function startProjectedChatStream(
    convId: string,
    assistantMessageId: string,
    startedAt: number,
  ): void {
    const isSameRun =
      chatStreams.streamingConversationIds[convId] &&
      chatStreams.assistantMessageIds[convId] === assistantMessageId;
    if (!isSameRun) {
      chatStreams.itemsByConversation = { ...chatStreams.itemsByConversation, [convId]: [] };
      chatStreams.assistantMessageIds = {
        ...chatStreams.assistantMessageIds,
        [convId]: assistantMessageId,
      };
      chatStreams.startTiming(convId, startedAt);
    }
    chatStreams.streamingConversationIds = {
      ...chatStreams.streamingConversationIds,
      [convId]: true,
    };
    chatStreams.awaitingOutput = { ...chatStreams.awaitingOutput, [convId]: true };
    if (config?.memory_retrieval_enabled) {
      chatStreams.memoryRetrievalStages = {
        ...chatStreams.memoryRetrievalStages,
        [convId]: "query_rewrite",
      };
    }
  }

  function applyExternalChatRunStarted(event: ChatRunStartedEvent): void {
    if (event.workspace !== (workspacePath || "")) return;
    const startedAt = Date.now();
    const userMessage: ChatMessage = {
      id: event.msg_id,
      role: "user",
      content: event.message,
      timestamp: startedAt,
    };
    const incoming: Conversation = {
      id: event.conv_id,
      title: event.title || $t("newConv"),
      messages: [userMessage],
      createdAt: event.created_at * 1000,
      updatedAt: startedAt,
      pinned: event.pinned,
      parentConvId: event.parent_conv_id ?? undefined,
      compactedFromConvId: event.compacted_from_conv_id ?? undefined,
      flowKind: event.flow_kind ?? undefined,
      flowStatus: event.flow_status ?? undefined,
      roleId: event.role_id ?? undefined,
    };
    const existingIndex = conversations.findIndex(
      (conversation) => conversation.id === event.conv_id,
    );
    if (existingIndex === -1) {
      conversations = [incoming, ...conversations];
    } else {
      const existing = conversations[existingIndex];
      conversations[existingIndex] = {
        ...existing,
        title: event.title || existing.title,
        pinned: event.pinned,
        parentConvId: event.parent_conv_id ?? undefined,
        compactedFromConvId: event.compacted_from_conv_id ?? undefined,
        flowKind: event.flow_kind ?? undefined,
        flowStatus: event.flow_status ?? undefined,
        roleId: event.role_id ?? undefined,
        updatedAt: startedAt,
      };
      insertExternalUserMessage(event.conv_id, userMessage, event.asst_msg_id);
    }
    const updatedConversation = conversations.find(
      (conversation) => conversation.id === event.conv_id,
    );
    if (updatedConversation) promoteConversationInRecents(updatedConversation);

    const eventRoleKey = event.role_id ?? defaultRoleKey;
    if (event.conv_id === activeConvId && eventRoleKey !== selectedRoleKey) {
      selectedRoleKey = eventRoleKey;
      window.localStorage.setItem(roleSelectionStorageKey(), eventRoleKey);
      void refreshRecentConversations();
    }
    startProjectedChatStream(event.conv_id, event.asst_msg_id, startedAt);

    if (event.is_new) {
      loadedConvIds.add(event.conv_id);
      return;
    }
    if (!loadedConvIds.has(event.conv_id)) {
      void loadMessagesForConv(event.conv_id, false).finally(() => {
        insertExternalUserMessage(event.conv_id, userMessage, event.asst_msg_id);
      });
    }
  }

  function recoverUnannouncedChatStream(convId: string): void {
    const startedAt = Date.now();
    const assistantMessageId = crypto.randomUUID();
    if (!conversations.some((conversation) => conversation.id === convId)) {
      conversations = [
        {
          id: convId,
          title: $t("newConv"),
          messages: [],
          createdAt: startedAt,
          updatedAt: startedAt,
        },
        ...conversations,
      ];
    }
    startProjectedChatStream(convId, assistantMessageId, startedAt);
    void fetchConversationMeta(convId)
      .then((conversation) => {
        if (conversation) conversations = mergeConversationMetadata(conversations, [conversation]);
        return loadMessagesForConv(convId, false);
      })
      .catch((error) => {
        console.error(`Failed to recover externally started conversation ${convId}:`, error);
      });
  }

  async function setupGlobalEventListeners() {
    if (!tauriAvailable) return;
    const registrations: Array<Promise<() => void>> = [];
    const register = <T,>(event: string, handler: (event: { payload: T }) => void) => {
      registrations.push(listen<T>(event, handler));
    };
    let runtimeResyncInFlight = false;

    register<{ generation: number }>("runtime-resync-required", () => {
      if (runtimeResyncInFlight) return;
      runtimeResyncInFlight = true;
      void (async () => {
        const bootstrap = await openAgent.getStartupBootstrap<StartupBootstrap>();
        await applyStartupBootstrap(bootstrap);
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
      const { conversation_id, message_id, new_conversation } = event.payload;
      void (async () => {
        if (new_conversation) {
          await activateNewConversationSurface();
        } else if (conversation_id) {
          await revealMemorySource(conversation_id, message_id ?? "");
        }
      })()
        .catch((error) => console.error("Failed to reveal the requested workspace target:", error))
        .finally(() => handleWindowFocusEvent(true));
    });

    register<{ visible: boolean }>(DEV_MAIN_DEBUG_VISIBILITY_EVENT, (event) => {
      showMainDebugComponents = event.payload.visible;
    });
    register<{ workspace_path: string }>(ONBOARDING_COMPLETE_EVENT, (event) => {
      void (async () => {
        let routeResult: WorkspaceRouteResult = "current";
        if (event.payload.workspace_path && event.payload.workspace_path !== workspacePath) {
          routeResult = await routeWorkspace(event.payload.workspace_path, {
            newConversation: true,
          });
        }
        if (routeResult !== "routed") await invoke("reveal_main_window");
      })().catch((error) => console.error("Failed to finish onboarding handoff:", error));
    });
    register("settings-changed", () => {
      void invoke<AppConfig>("get_settings")
        .then((reloaded) => {
          const previousAutostart = config?.launch_on_startup ?? false;
          const previousShortcut = normalizeQuickChatShortcut(
            config?.quick_chat_shortcut ?? DEFAULT_QUICK_CHAT_SHORTCUT,
          );
          const next = normalizeConfigShape(reloaded);
          const nextShortcut = normalizeQuickChatShortcut(next.quick_chat_shortcut);
          config = structuredClone(next);
          applyTheme(config.theme ?? "system");
          const suggestionLanguage = (config.language ?? "zh") as Locale;
          const suggestionWorkspace = workspacePath;
          setLocale(suggestionLanguage);
          void loadNewConversationSuggestions(suggestionWorkspace, suggestionLanguage).then(
            (storedSuggestions) => {
              if (
                suggestionWorkspace === workspacePath &&
                suggestionLanguage === (config?.language ?? "zh")
              ) {
                newConversationSuggestions = storedSuggestions;
              }
            },
          );
          if (previousShortcut !== nextShortcut && !launchContext?.workspace) {
            void replaceQuickChatShortcut(nextShortcut).catch((error) =>
              console.error("Failed to apply reloaded quick-chat shortcut:", error),
            );
          }
          if (previousAutostart !== next.launch_on_startup && !launchContext?.workspace) {
            const syncAutostart = next.launch_on_startup ? enableAutostart : disableAutostart;
            void syncAutostart().catch((error) =>
              console.error("Failed to apply reloaded autostart setting:", error),
            );
          }
        })
        .catch((error) => console.error("Failed to apply reloaded settings:", error));
    });
    register("settings-reload-failed", () => {
      showToast({
        title: $t("settingsReloadFailed"),
        description: $t("settingsReloadFailedHint"),
        variant: "error",
      });
    });

    register<{ conv_id: string; title: string }>("conversation-title-updated", (e) => {
      const { conv_id, title } = e.payload;
      void applyConversationTitleUpdate(conv_id, title);
    });

    register<{
      task_kind: "title" | "memory" | "hook" | string;
      conv_id?: string | null;
      error: string;
    }>("flash-task-failed", (e) => {
      const taskLabel = {
        title: $t("flashTaskTitle"),
        memory: $t("flashTaskMemory"),
        suggestions: $t("flashTaskSuggestions"),
        hook: $t("flashTaskHook"),
      }[e.payload.task_kind];
      showToast({
        title: taskLabel ? `${$t("flashTaskFailed")} · ${taskLabel}` : $t("flashTaskFailed"),
        description: e.payload.error,
        variant: "error",
      });
    });

    register<ProviderAuthDeviceCodeEvent>("provider-auth-device-code", (event) => {
      const verificationUri = event.payload.verification_uri.trim();
      const userCode = event.payload.user_code.trim();
      if (!verificationUri || !userCode) return;
      showToast({
        title: $t("chatgptOAuthRequired"),
        description: $t("chatgptOAuthCode").replace("{code}", userCode),
        variant: "info",
        durationMs: 0,
        action: {
          label: $t("chatgptOAuthOpen"),
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
      if (ws !== (workspacePath || "")) return;
      const sourceIdx = conversations.findIndex(
        (conversation) => conversation.id === source_conv_id,
      );
      if (sourceIdx === -1 || conversations.some((conversation) => conversation.id === conv_id))
        return;

      const source = conversations[sourceIdx];
      const movedMessages = user_message_id
        ? source.messages.filter((message) => message.id === user_message_id)
        : [];
      conversations[sourceIdx] = {
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
      conversations = [derived, ...conversations];
      loadedConvIds.add(conv_id);

      if (chatStreams.streamingConversationIds[source_conv_id]) {
        const { [source_conv_id]: _old, ...rest } = chatStreams.streamingConversationIds;
        chatStreams.streamingConversationIds = { ...rest, [conv_id]: true };
      }
      if (source_conv_id in chatStreams.itemsByConversation) {
        const { [source_conv_id]: old, ...rest } = chatStreams.itemsByConversation;
        chatStreams.itemsByConversation = { ...rest, [conv_id]: old };
      }
      if (source_conv_id in chatStreams.assistantMessageIds) {
        const { [source_conv_id]: old, ...rest } = chatStreams.assistantMessageIds;
        chatStreams.assistantMessageIds = { ...rest, [conv_id]: old };
      }
      if (source_conv_id in chatStreams.awaitingOutput) {
        const { [source_conv_id]: old, ...rest } = chatStreams.awaitingOutput;
        chatStreams.awaitingOutput = { ...rest, [conv_id]: old };
      }
      if (source_conv_id in chatStreams.memoryRetrievalStages) {
        const { [source_conv_id]: old, ...rest } = chatStreams.memoryRetrievalStages;
        chatStreams.memoryRetrievalStages = { ...rest, [conv_id]: old };
      }
      if (source_conv_id in chatStreams.memoryRetrievalSkippable) {
        const { [source_conv_id]: old, ...rest } = chatStreams.memoryRetrievalSkippable;
        chatStreams.memoryRetrievalSkippable = { ...rest, [conv_id]: old };
      }
      if (compactionOnlyConvIds.delete(source_conv_id)) {
        compactionOnlyConvIds.add(conv_id);
      }
      const compactionRevision = compactionProgressRevisions.get(source_conv_id);
      if (compactionRevision !== undefined) {
        compactionProgressRevisions.delete(source_conv_id);
        compactionProgressRevisions.set(conv_id, compactionRevision);
      }
      if (activeConvId === source_conv_id) {
        if (selectedComposerDraftKey === conversationComposerDraftKey(source_conv_id)) {
          composerDrafts.save(selectedComposerDraftKey, activeComposerDraft);
        }
        const remappedDraft = composerDrafts.remap(
          conversationComposerDraftKey(source_conv_id),
          conversationComposerDraftKey(conv_id),
        );
        if (selectedComposerDraftKey === conversationComposerDraftKey(source_conv_id)) {
          selectedComposerDraftKey = conversationComposerDraftKey(conv_id);
          activeComposerDraft = remappedDraft;
        }
        activeConvId = conv_id;
        cacheRestoreSurface("conversation", conv_id);
        invoke("set_active_conversation", {
          convId: conv_id,
          workspace: workspacePath || "",
        }).catch(() => {});
      }
    });

    // subagent-started: a delegated role or graph node created a child conversation
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
      } = e.payload;
      // Only show sub-convs that belong to the current workspace
      if (ws !== (workspacePath || "")) return;
      // Avoid duplicates (event can fire once per spawn)
      if (conversations.some((c) => c.id === sub_conv_id)) return;
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
        flowStatus: flow_kind ? "running" : undefined,
      };
      conversations = [subConv, ...conversations];
      loadedConvIds.add(sub_conv_id);
      chatStreams.streamingConversationIds = {
        ...chatStreams.streamingConversationIds,
        [sub_conv_id]: true,
      };
      chatStreams.itemsByConversation = { ...chatStreams.itemsByConversation, [sub_conv_id]: [] };
      chatStreams.assistantMessageIds = {
        ...chatStreams.assistantMessageIds,
        [sub_conv_id]: asst_msg_id ?? crypto.randomUUID(),
      };
      if (branch_id) {
        activeBranchIds = { ...activeBranchIds, [sub_conv_id]: branch_id };
      }
      chatStreams.startTiming(sub_conv_id, taskMsg.timestamp);
    });

    // ask_user tool: backend emits with conv_id + form schema; we stash it per-conv
    // so switching convs doesn't lose an in-flight form.
    register<UserInputRequest>("chat-user-input-request", (e) => {
      const req = e.payload;
      const key = req.conv_id ?? activeConvId;
      if (!key) return;
      pendingUserInputs = { ...pendingUserInputs, [key]: req };
      if (!attachPendingUserInputToMessages(key, req)) {
        chatStreams.itemsByConversation = {
          ...chatStreams.itemsByConversation,
          [key]: appendUserInput(chatStreams.itemsByConversation[key] ?? [], req),
        };
      }
      persistStreamDraft(key).catch(() => {});
    });
    if (!isDevInspectorWindow) {
      register<{
        request_id: string;
        conv_id?: string | null;
        title?: string | null;
        source: string;
      }>("chat-mermaid-render-request", (e) => {
        const request = e.payload;
        void renderMermaidToolResult(request.source, mermaidConfig)
          .then((renderResult) =>
            openAgent.submitInterruptResponse({
              interruptId: request.request_id,
              response: JSON.stringify(renderResult),
            }),
          )
          .catch((error) => {
            console.warn("Failed to return Mermaid render result", error);
          });
      });
    }
    register<{
      conv_id: string;
      kind: string;
      iteration: number;
      message: string;
      msg_id: string;
      asst_msg_id?: string;
      hidden_message?: boolean;
    }>("goal-loop-iteration-started", (e) => {
      const { conv_id, kind, message, msg_id, asst_msg_id, hidden_message } = e.payload;
      const userMsg: ChatMessage = {
        id: msg_id,
        role: "user",
        content: message,
        timestamp: Date.now(),
      };
      const idx = conversations.findIndex((c) => c.id === conv_id);
      if (idx !== -1) {
        const existing = conversations[idx];
        const shouldAppendUser =
          !hidden_message && !existing.messages.some((message) => message.id === msg_id);
        conversations[idx] = {
          ...existing,
          flowKind: kind,
          flowStatus: "running",
          messages: shouldAppendUser ? [...existing.messages, userMsg] : existing.messages,
          updatedAt: Date.now(),
        };
      }
      chatStreams.streamingConversationIds = {
        ...chatStreams.streamingConversationIds,
        [conv_id]: true,
      };
      chatStreams.itemsByConversation = { ...chatStreams.itemsByConversation, [conv_id]: [] };
      chatStreams.assistantMessageIds = {
        ...chatStreams.assistantMessageIds,
        [conv_id]: asst_msg_id ?? crypto.randomUUID(),
      };
      chatStreams.startTiming(conv_id, Date.now());
    });

    register<GoalRunUpdatedEvent>("goal-run-updated", (e) => {
      const { conv_id, kind, status } = e.payload;
      applyLiveCheckpointFlow(conv_id, e.payload);
      const idx = conversations.findIndex((c) => c.id === conv_id);
      if (idx !== -1) {
        conversations[idx] = {
          ...conversations[idx],
          flowKind: kind,
          flowStatus: status,
          updatedAt: Date.now(),
        };
      }
    });

    const chatEventRegistration = openAgent.subscribeToChatEvents({
      onRunStarted: (event) => {
        applyExternalChatRunStarted(event);
      },
      onResponseStarted: (conv_id) => {
        if (!chatStreams.streamingConversationIds[conv_id]) {
          recoverUnannouncedChatStream(conv_id);
        }
        chatStreams.clearMemoryRetrieval(conv_id);
        if (chatStreams.streamingConversationIds[conv_id]) {
          chatStreams.awaitingOutput = {
            ...chatStreams.awaitingOutput,
            [conv_id]: true,
          };
        }
      },
      onMemoryRetrieval: (conv_id, stage) => {
        if (!chatStreams.streamingConversationIds[conv_id]) {
          recoverUnannouncedChatStream(conv_id);
        }
        chatStreams.clearAwaitingOutput(conv_id);
        chatStreams.memoryRetrievalStages = {
          ...chatStreams.memoryRetrievalStages,
          [conv_id]: stage,
        };
        chatStreams.memoryRetrievalSkippable = {
          ...chatStreams.memoryRetrievalSkippable,
          [conv_id]: stage !== "completed" && stage !== "skipped",
        };
      },
      onChunk: (conv_id, text) => {
        if (text) chatStreams.clearAwaitingOutput(conv_id);
        if (text) chatStreams.clearMemoryRetrieval(conv_id);
        if (text) chatStreams.recordFirstResponse(conv_id);
        applyStreamMutation(conv_id, (items) => appendChunk(items, text));
      },
      onThinkingChunk: (conv_id, text) => {
        if (text) chatStreams.clearAwaitingOutput(conv_id);
        if (text) chatStreams.clearMemoryRetrieval(conv_id);
        if (text) chatStreams.recordFirstResponse(conv_id);
        applyStreamMutation(conv_id, (items) => appendThinkingChunk(items, text));
      },
      onToolCall: (conv_id, name, args, toolUseId) => {
        chatStreams.clearAwaitingOutput(conv_id);
        chatStreams.clearMemoryRetrieval(conv_id);
        chatStreams.recordFirstResponse(conv_id);
        let items = appendToolCall(
          chatStreams.itemsByConversation[conv_id] ?? [],
          name,
          args,
          toolUseId,
        );
        const pendingInput = pendingUserInputs[conv_id];
        if (pendingInput?.kind === "tool_approval") {
          items = appendUserInput(items, pendingInput);
        }
        chatStreams.itemsByConversation = {
          ...chatStreams.itemsByConversation,
          [conv_id]: items,
        };
        persistStreamDraft(conv_id).catch(() => {});
      },
      onToolResult: (conv_id, result, toolUseId) => {
        const pendingToolCall = toolUseId
          ? (chatStreams.itemsByConversation[conv_id] ?? []).find(
              (item) =>
                item.type === "tool_call" &&
                item.toolUseId === toolUseId &&
                item.result === undefined,
            )
          : [...(chatStreams.itemsByConversation[conv_id] ?? [])]
              .reverse()
              .find((item) => item.type === "tool_call" && item.result === undefined);
        const rolesMayHaveChanged =
          pendingToolCall?.type === "tool_call" && pendingToolCall.name === "dispatch_role";
        if (attachApprovedToolResult(conv_id, result, toolUseId)) {
          if (rolesMayHaveChanged) void loadAvailableRoles();
          return;
        }
        chatStreams.itemsByConversation = {
          ...chatStreams.itemsByConversation,
          [conv_id]: attachToolResult(
            chatStreams.itemsByConversation[conv_id] ?? [],
            result,
            toolUseId,
          ),
        };
        if (rolesMayHaveChanged) void loadAvailableRoles();
        persistStreamDraft(conv_id).catch(() => {});
      },
      onFileChange: (conv_id, change) => {
        const existing = liveFileChangesPerConv[conv_id] ?? [];
        if (existing.some((item) => item.id === change.id)) return;
        liveFileChangesPerConv = {
          ...liveFileChangesPerConv,
          [conv_id]: [...existing, change],
        };
      },
      onCheckpoint: (conv_id, checkpoint_id) => {
        pendingCheckpointIds = { ...pendingCheckpointIds, [conv_id]: checkpoint_id };
        void refreshLiveCheckpointTip(conv_id, checkpoint_id);
        const location = findConversationLocation(conv_id);
        const visibleMessages = location?.conversations[location.index].messages;
        if (
          visibleMessages &&
          !visibleMessages.some((message) => message.role === "user") &&
          !pendingExternalUserRecoveries.has(conv_id)
        ) {
          pendingExternalUserRecoveries.add(conv_id);
          void loadMessagesForConv(conv_id, false, true).finally(() => {
            pendingExternalUserRecoveries.delete(conv_id);
          });
        }
      },
      onRetry: (conv_id, attempt, maxAttempts, model, error, restoredCheckpoint) => {
        chatStreams.clearAwaitingOutput(conv_id);
        const items = chatStreams.itemsByConversation[conv_id] ?? [];
        const previousAttempts = items.filter((item) => item.type === "retry");
        const failedAttemptItems = items.filter((item) => item.type !== "retry");
        chatStreams.itemsByConversation = {
          ...chatStreams.itemsByConversation,
          [conv_id]: [
            ...previousAttempts,
            {
              type: "retry",
              items: failedAttemptItems,
              attempt: attempt - 1,
              maxAttempts,
              model,
              error,
            },
          ],
        };
        const { [conv_id]: _ck, ...restCk } = pendingCheckpointIds;
        pendingCheckpointIds = restCk;
        if (!restoredCheckpoint && conv_id in liveFileChangesPerConv) {
          clearLiveFileChanges(conv_id);
        }
        discardPersistedStreamDraft(conv_id);
      },
      onCompactionProgress: (convId, stage, error) => {
        const revision = (compactionProgressRevisions.get(convId) ?? 0) + 1;
        compactionProgressRevisions.set(convId, revision);
        const wasStreaming = !!chatStreams.streamingConversationIds[convId];
        const previousItems = chatStreams.itemsByConversation[convId] ?? [];
        if (!wasStreaming && stage !== "done" && stage !== "skipped") {
          compactionOnlyConvIds.add(convId);
          chatStreams.streamingConversationIds = {
            ...chatStreams.streamingConversationIds,
            [convId]: true,
          };
          chatStreams.assistantMessageIds = {
            ...chatStreams.assistantMessageIds,
            [convId]: crypto.randomUUID(),
          };
        }

        if (stage === "done") {
          // A normal Agent stream must not finalize with transient progress in
          // its optimistic message. A compaction-only row stays visible until
          // its durable checkpoint divider is ready.
          if (!compactionOnlyConvIds.has(convId)) removeCompactionProgress(convId);
          void reconcileCompletedCompaction(convId, revision);
          return;
        }

        chatStreams.itemsByConversation = {
          ...chatStreams.itemsByConversation,
          [convId]: appendCompactionProgress(previousItems, stage, error),
        };

        if (stage === "skipped") {
          finishCompactionProgress(convId, revision);
          return;
        }
        if (stage === "failed") {
          finishCompactionProgress(convId, revision, 1600);
          return;
        }
      },
      onDone: (conv_id, asstMsgId, error) => {
        finalizeStreamedMessage(conv_id, error ? "failed" : "completed", asstMsgId, error);
        interruptTerminalHandoffs.release(conv_id);
      },
      onFollowUpSuggestions: (convId, assistantMessageId, suggestions) => {
        const normalized = normalizeSuggestions(suggestions);
        if (!convId || !assistantMessageId || normalized.length !== 3) return;
        followUpSuggestionsByMessageId = {
          ...followUpSuggestionsByMessageId,
          [assistantMessageId]: normalized,
        };
      },
      onNewConversationSuggestions: (suggestionWorkspace, language, suggestions) => {
        const normalized = normalizeSuggestions(suggestions);
        if (normalized.length !== 3) return;
        if (
          (suggestionWorkspace || "") === (workspacePath || "") &&
          language === (config?.language ?? "zh")
        ) {
          newConversationSuggestions = normalized;
        }
      },
      onInterrupted: (conv_id) => {
        finalizeStreamedMessage(conv_id, "interrupted");
        interruptTerminalHandoffs.release(conv_id);
        // The live `chat-user-input-request` event has already attached the
        // next approval to its tool card. Do not re-project the complete
        // checkpoint here: replacing the conversation while the user clicks
        // through approvals causes a visible flash. Checkpoint loading remains
        // the recovery path when opening a conversation or restoring a view.
      },
      onCancelled: (conv_id) => {
        finalizeStreamedMessage(conv_id, "cancelled");
        interruptTerminalHandoffs.release(conv_id);
      },
    });
    await Promise.all([...registrations, chatEventRegistration]);
  }

  // Insert a freshly-finalized turn into the tree, then update the active path so the
  // newly-streamed variant is visible (and any in-place user-msg copy gets its checkpointId).
  function attachNewTurnToTree(conv_id: string, ckId: string, assistantMsg: ChatMessage) {
    const location = findConversationLocation(conv_id);
    if (!location) return;
    const visibleMsgs = location.conversations[location.index].messages;
    let userMsg: ChatMessage | undefined;
    for (let i = visibleMsgs.length - 2; i >= 0; i--) {
      if (visibleMsgs[i].role === "user") {
        userMsg = visibleMsgs[i];
        break;
      }
      if (visibleMsgs[i].role === "assistant") break;
    }

    const { tree: newTree } = attachNewTurn(
      convTrees[conv_id],
      ckId,
      userMsg,
      assistantMsg,
      conv_id in pendingParentCk ? pendingParentCk[conv_id] : undefined,
    );
    convTrees = { ...convTrees, [conv_id]: newTree };

    if (userMsg) {
      const stamped = visibleMsgs.map((m) =>
        m.id === userMsg!.id ? { ...m, checkpointId: ckId } : m,
      );
      location.conversations[location.index] = {
        ...location.conversations[location.index],
        messages: stamped,
      };
    }

    // The checkpoint is the sole durable source for a compaction boundary.
    // Reload after a turn so its tagged system boundary is rendered in
    // chronological order, instead of manufacturing a boundary in the stream.
    if (location.isCurrentWorkspace) {
      loadedConvIds.delete(conv_id);
      // Reconcile the optimistic turn with its durable checkpoint without
      // replacing the visible transcript with the conversation-loading skeleton.
      void loadMessagesForConv(conv_id, false);
    }
  }

  async function persistStreamDraft(conv_id: string, aborted = false) {
    // In-flight state is transient. The Rust run writes the partial/final
    // response atomically into its checkpoint when the turn stops.
    void conv_id;
    void aborted;
  }

  function queueSaveChatMessage(
    conv_id: string,
    msg: ChatMessage,
    checkpointId: string | null,
  ): Promise<void> {
    // Checkpoint creation owns persistence; live messages only update UI state.
    void conv_id;
    void msg;
    void checkpointId;
    return Promise.resolve();
  }

  function removeCompactionProgress(convId: string) {
    if (!(convId in chatStreams.itemsByConversation)) return;
    chatStreams.itemsByConversation = {
      ...chatStreams.itemsByConversation,
      [convId]: appendCompactionProgress(chatStreams.itemsByConversation[convId] ?? [], "done"),
    };
  }

  function finishCompactionProgress(convId: string, revision: number, delay = 0) {
    window.setTimeout(() => {
      if (compactionProgressRevisions.get(convId) !== revision) return;
      compactionProgressRevisions.delete(convId);
      if (compactionOnlyConvIds.delete(convId)) {
        chatStreams.cleanup(convId);
      } else {
        removeCompactionProgress(convId);
      }
    }, delay);
  }

  async function reconcileCompletedCompaction(convId: string, revision: number) {
    try {
      await loadMessagesForConv(convId, false, true);
    } catch (error) {
      console.error(`Failed to reconcile completed compaction ${convId}:`, error);
    }
    if (compactionProgressRevisions.get(convId) !== revision) return;
    compactionProgressRevisions.delete(convId);
    if (compactionOnlyConvIds.delete(convId)) {
      chatStreams.cleanup(convId);
    } else {
      removeCompactionProgress(convId);
    }
  }

  function saveAssistantMessage(conv_id: string, msg: ChatMessage, checkpointId: string | null) {
    queueSaveChatMessage(conv_id, msg, checkpointId).catch(() => {});
  }

  function discardPersistedStreamDraft(conv_id: string) {
    void conv_id;
  }

  function finalizeStreamedMessage(
    conv_id: string,
    status: CheckpointTurnStatus,
    asstMsgId?: string,
    error?: string | null,
  ) {
    const assistantMessageId = asstMsgId ?? chatStreams.assistantMessageIds[conv_id];
    notifyInactiveWindowOfAgentCompletion(
      assistantMessageId,
      status,
      !!chatStreams.streamingConversationIds[conv_id],
    );
    beginStreamCompletionTailAnchor(conv_id);
    let items = chatStreams.itemsByConversation[conv_id] ?? [];
    if (error) {
      items = [...items, { type: "runtime_notice", kind: "error", reason: error }];
    } else if (status === "cancelled") {
      items = [
        ...items,
        {
          type: "runtime_notice",
          kind: "interrupted",
          reason: tr("agentRunInterrupted"),
        },
      ];
    }
    const fullText = collapseStreamText(items);
    const hasContent = fullText.length > 0 || items.some((i) => i.type !== "text");
    if (!hasContent) {
      const finalizedLiveChangeIds = new Set(
        (liveFileChangesPerConv[conv_id] ?? []).map((change) => change.id),
      );
      void loadFileChangesForConv(conv_id).then((durableChanges) => {
        if (durableChanges) {
          reconcileLiveFileChanges(conv_id, durableChanges, finalizedLiveChangeIds);
        }
      });
      chatStreams.cleanup(conv_id);
      void dispatchNextQueuedMessage(conv_id);
      return;
    }

    const checkpointId = pendingCheckpointIds[conv_id] ?? null;

    const finalizedAt = Date.now();
    const assistantMsg: ChatMessage = {
      id: assistantMessageId ?? crypto.randomUUID(),
      role: "assistant",
      content: fullText,
      timestamp: finalizedAt,
      items: items.length > 0 ? [...items] : undefined,
      aborted: status === "cancelled" || undefined,
      checkpointId: checkpointId ?? undefined,
      firstTokenAt: chatStreams.firstTokenAt[conv_id],
      completedAt: status === "interrupted" ? undefined : finalizedAt,
      transientTurnStatus: status,
    };

    const location = findConversationLocation(conv_id);
    if (!location) {
      // Conv was deleted while streaming — drop the in-flight message instead of saving an orphan row.
      const { [conv_id]: _items, ...restItems } = chatStreams.itemsByConversation;
      const { [conv_id]: _streaming, ...restStreaming } = chatStreams.streamingConversationIds;
      const { [conv_id]: _ck, ...restCk } = pendingCheckpointIds;
      const { [conv_id]: _pp, ...restPp } = pendingParentCk;
      const { [conv_id]: _pf, ...restPf } = pendingForkMessageId;
      const { [conv_id]: _pfs, ...restPfs } = pendingForkSourceCheckpointId;
      const { [conv_id]: _pfu, ...restPfu } = pendingForkUserMessageIds;
      const { [conv_id]: _asstId, ...restAsstIds } = chatStreams.assistantMessageIds;
      chatStreams.itemsByConversation = restItems;
      chatStreams.streamingConversationIds = restStreaming;
      pendingCheckpointIds = restCk;
      pendingParentCk = restPp;
      pendingForkMessageId = restPf;
      pendingForkSourceCheckpointId = restPfs;
      pendingForkUserMessageIds = restPfu;
      chatStreams.assistantMessageIds = restAsstIds;
      return;
    }

    location.conversations[location.index] = {
      ...location.conversations[location.index],
      messages: [...location.conversations[location.index].messages, assistantMsg],
      updatedAt: Date.now(),
    };
    promoteConversationInRecents(location.conversations[location.index]);

    // Rust persists completed responses, but the client is the source of the
    // stream timing. Save every final message so firstTokenAt/completedAt are
    // merged into that persisted record before a refresh.
    saveAssistantMessage(conv_id, assistantMsg, checkpointId);

    // Keep the temporary records visible until the durable terminal records
    // have actually loaded. This avoids a blank banner when IPC refresh is
    // delayed or fails, and does not clear changes from a queued next turn.
    const finalizedLiveChangeIds = new Set(
      (liveFileChangesPerConv[conv_id] ?? []).map((change) => change.id),
    );
    void loadFileChangesForConv(conv_id).then((durableChanges) => {
      if (durableChanges) {
        reconcileLiveFileChanges(conv_id, durableChanges, finalizedLiveChangeIds);
      }
    });

    // Attach the just-completed turn to the conversation tree.
    if (checkpointId) {
      attachNewTurnToTree(conv_id, checkpointId, assistantMsg);
    }
    void refreshTaskUsagesForConversation(conv_id);

    // Clean up pending checkpoint id and any re-execution hint for this conv
    const { [conv_id]: _ck, ...restCk } = pendingCheckpointIds;
    pendingCheckpointIds = restCk;
    if (conv_id in pendingParentCk) {
      const { [conv_id]: _pp, ...restPp } = pendingParentCk;
      pendingParentCk = restPp;
    }
    if (conv_id in pendingForkMessageId) {
      const { [conv_id]: _pf, ...restPf } = pendingForkMessageId;
      pendingForkMessageId = restPf;
    }
    if (conv_id in pendingForkSourceCheckpointId) {
      const { [conv_id]: _pfs, ...restPfs } = pendingForkSourceCheckpointId;
      pendingForkSourceCheckpointId = restPfs;
    }
    if (conv_id in pendingForkUserMessageIds) {
      const { [conv_id]: _pfu, ...restPfu } = pendingForkUserMessageIds;
      pendingForkUserMessageIds = restPfu;
    }

    chatStreams.cleanup(conv_id);
    void dispatchNextQueuedMessage(conv_id);
  }

  function notifyInactiveWindowOfAgentCompletion(
    replyId: string | undefined,
    status: CheckpointTurnStatus,
    wasStreaming: boolean,
  ): void {
    if (!replyId) return;
    void agentCompletionNotifier.notifyIfInactive(
      { replyId, status, tauriAvailable, wasStreaming },
      completionWindowActivity,
      $t("agentReplyCompletedNotification"),
    );
  }

  function applyTheme(theme: string) {
    if (synchronizeNativeTheme) {
      void synchronizeNativeTheme(theme as AppTheme);
      return;
    }
    isDarkTheme = applyDocumentTheme(theme);
  }

  async function loadWorkspace() {
    if (!tauriAvailable) {
      workspace = {
        path: workspacePath || null,
        git_branch: null,
        has_agent_dir: false,
        environment: { kind: "local" },
      };
      return;
    }

    try {
      if (!workspacePath) {
        // Default to home directory on first run
        workspacePath = await homeDir();
        await addToRecentWorkspaces(workspacePath);
      }
      workspace = await invoke<WorkspaceContext>("get_workspace_context");
    } catch {}
  }

  async function loadSettings() {
    if (!tauriAvailable) {
      config = normalizeConfigShape(
        isMcpSettingsPreview
          ? {
              ...fallbackConfig,
              mcp: {
                servers: [
                  {
                    id: "preview-mcp",
                    name: "Design tools",
                    enabled: true,
                    transport: "http",
                    url: "https://mcp.example.test",
                    bearer_token: "",
                    headers: {},
                    command: "",
                    args: [],
                    env: {},
                    cwd: "",
                    disabled_tools: ["delete_design_asset"],
                  },
                ],
              },
            }
          : fallbackConfig,
      );
      if (isOnboardingPreview) {
        config = {
          ...config,
          theme: onboardingPreviewTheme ?? config.theme,
          language: onboardingPreviewLocale ?? config.language,
        };
      }
      if (
        isChannelsSettingsPreview ||
        isAgentsSettingsPreview ||
        isAgentPluginsSettingsPreview ||
        isMcpSettingsPreview
      ) {
        config = {
          ...config,
          theme:
            agentPluginsSettingsPreviewTheme ??
            mcpSettingsPreviewTheme ??
            agentsSettingsPreviewTheme ??
            channelsSettingsPreviewTheme ??
            config.theme,
          language:
            agentPluginsSettingsPreviewLocale ??
            mcpSettingsPreviewLocale ??
            agentsSettingsPreviewLocale ??
            channelsSettingsPreviewLocale ??
            config.language,
        };
      }
      applyTheme(
        onboardingPreviewTheme ??
          channelsSettingsPreviewTheme ??
          agentsSettingsPreviewTheme ??
          agentPluginsSettingsPreviewTheme ??
          mcpSettingsPreviewTheme ??
          config.theme ??
          "system",
      );
      await initI18n(
        onboardingPreviewLocale ??
          channelsSettingsPreviewLocale ??
          agentsSettingsPreviewLocale ??
          agentPluginsSettingsPreviewLocale ??
          mcpSettingsPreviewLocale ??
          config.language,
      );
      return;
    }

    try {
      config = normalizeConfigShape(await invoke<AppConfig>("get_settings"));
      applyTheme(config.theme ?? "system");
      await initI18n(config.language);
      if (config.workspace) workspacePath = config.workspace;
      if (config.recent_workspaces?.length) recentWorkspaces = config.recent_workspaces;
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  function pollMemoryStatus() {
    if (!tauriAvailable) return;

    setInterval(async () => {
      try {
        const next = await invoke<boolean>("get_memory_status");
        isMemorySyncing = next;
      } catch {}
    }, 2000);
  }

  function normalizeSuggestions(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const suggestions = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(
        (item) =>
          item.length > 0 &&
          [...item].length <= 120 &&
          !item.includes("\n") &&
          !item.includes("\r"),
      );
    const unique = new Set(suggestions.map((item) => item.toLocaleLowerCase()));
    return suggestions.length === 3 && unique.size === 3 ? suggestions : [];
  }

  function mergeDurableFollowUpSuggestions(checkpoints: StartupConversationBundle["checkpoints"]) {
    const durable = durableFollowUpSuggestionsByMessageId(checkpoints);
    if (Object.keys(durable).length === 0) return;
    followUpSuggestionsByMessageId = {
      ...followUpSuggestionsByMessageId,
      ...durable,
    };
  }

  async function loadNewConversationSuggestions(
    workspace: string,
    language: Locale,
  ): Promise<string[]> {
    if (!tauriAvailable) return [];
    try {
      return normalizeSuggestions(
        await openAgent.invokeProduct("get_new_conversation_suggestions", {
          workspace: workspace || "",
          language,
        }),
      );
    } catch {
      return [];
    }
  }

  // ─── Conversation Management ──────────────────────────────────────────────────

  function cacheRestoreSurface(
    surface: CachedRestoreSurface,
    conversationId: string | null,
    workspace = workspacePath,
  ) {
    writeStartupRestoreHint({ workspace, surface, conversationId });
  }

  async function activateNewConversationSurface(roleKey = selectedRoleKey): Promise<void> {
    const roleChanged = roleKey !== selectedRoleKey;
    if (roleChanged) {
      selectedRoleKey = roleKey;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(roleSelectionStorageKey(), roleKey);
      }
      handleConversationSearch("");
    }
    restoringSurface = "new-conversation";
    activeConvId = null;
    cacheRestoreSurface("new-conversation", null);
    if (roleChanged) {
      await Promise.all([reloadRoleConversations(), refreshRecentConversations()]);
    }
    if (tauriAvailable) {
      await invoke("set_active_conversation", {
        convId: null,
        workspace: workspacePath || "",
      }).catch(() => {});
    }
  }

  async function newConversation() {
    if (composerPreferences.modelOptions.length === 0) {
      showToast({ title: $t("modelSetupRequired"), variant: "error" });
      openSettings("providers");
      return;
    }
    const newConversationSurfaceVisible =
      !mainContentLoading && newConversationLayout && !settingsOpen;
    if (newConversationSurfaceVisible) return;
    if (settingsOpen) closeSettings();
    await activateNewConversationSurface();
  }

  async function restoreWorkspaceConversation(path: string) {
    const savedActiveId = tauriAvailable
      ? await invoke<string | null>("get_active_conv_id", { workspace: path || "" }).catch(
          () => null,
        )
      : null;
    let target = savedActiveId
      ? conversations.find((conversation) => conversation.id === savedActiveId)
      : null;
    if (!target && savedActiveId && tauriAvailable) {
      target = await fetchConversationMeta(savedActiveId).catch(() => null);
    }
    if (target) {
      await ensureConversationLineage(target);
    }
    if (target) {
      await switchConversation(target.id);
      return;
    }

    restoringSurface = "new-conversation";
    activeConvId = null;
    cacheRestoreSurface("new-conversation", null, path);
    if (tauriAvailable) {
      invoke("set_active_conversation", { convId: null, workspace: path || "" }).catch(() => {});
    }
  }

  async function switchConversation(id: string) {
    const target =
      conversations.find((conversation) => conversation.id === id) ??
      (await fetchConversationMeta(id).catch(() => null));
    const targetRoleKey = target?.roleId ?? defaultRoleKey;
    if (targetRoleKey !== selectedRoleKey) {
      selectedRoleKey = targetRoleKey;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(roleSelectionStorageKey(), targetRoleKey);
      }
      handleConversationSearch("");
      await Promise.all([reloadRoleConversations(id), refreshRecentConversations()]);
    }
    if (activeConvId === id) return;
    restoringSurface = "conversation";
    activeConvId = id;
    cacheRestoreSurface("conversation", id);
    if (tauriAvailable)
      invoke("set_active_conversation", { convId: id, workspace: workspacePath || "" }).catch(
        () => {},
      );
    await Promise.all([loadMessagesForConv(id), loadFileChangesForConv(id)]);
    await scrollToBottom();
  }

  async function revealMemorySource(convId: string, messageId: string) {
    navigationCaptureDepth += 1;
    try {
      await switchConversation(convId);
      await tick();
      const target = document.getElementById(`message-${messageId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.remove("memory-source-highlight");
      void target.getBoundingClientRect();
      target.classList.add("memory-source-highlight");
      window.setTimeout(() => target.classList.remove("memory-source-highlight"), 2400);
    } finally {
      navigationCaptureDepth -= 1;
    }
  }

  async function deleteConversation(id: string, ownerWorkspace = workspacePath) {
    // If the conv is mid-stream, signal the backend to abort before we tear down local state.
    // This prevents a terminal checkpoint from being created after local state is removed.
    if (chatStreams.streamingConversationIds[id]) {
      if (tauriAvailable) {
        await invoke("cancel_chat_message", { convId: id }).catch(() => {});
      }
      const { [id]: _s, ...rs } = chatStreams.streamingConversationIds;
      const { [id]: _i, ...ri } = chatStreams.itemsByConversation;
      const { [id]: _c, ...rc } = pendingCheckpointIds;
      const { [id]: _p, ...rp } = pendingParentCk;
      const { [id]: _pf, ...rpf } = pendingForkMessageId;
      const { [id]: _pfs, ...rpfs } = pendingForkSourceCheckpointId;
      const { [id]: _pfu, ...rpfu } = pendingForkUserMessageIds;
      const { [id]: _a, ...ra } = chatStreams.assistantMessageIds;
      const { [id]: _awaiting, ...restAwaiting } = chatStreams.awaitingOutput;
      const { [id]: _memoryStage, ...restMemoryStages } = chatStreams.memoryRetrievalStages;
      const { [id]: _memorySkippable, ...restMemorySkippable } =
        chatStreams.memoryRetrievalSkippable;
      chatStreams.streamingConversationIds = rs;
      chatStreams.itemsByConversation = ri;
      pendingCheckpointIds = rc;
      pendingParentCk = rp;
      pendingForkMessageId = rpf;
      pendingForkSourceCheckpointId = rpfs;
      pendingForkUserMessageIds = rpfu;
      chatStreams.assistantMessageIds = ra;
      chatStreams.awaitingOutput = restAwaiting;
      chatStreams.memoryRetrievalStages = restMemoryStages;
      chatStreams.memoryRetrievalSkippable = restMemorySkippable;
    }
    clearPendingInput(id);
    // Drop conv-scoped state so it doesn't outlive the conv
    if (fileChangesPerConv[id]) {
      const { [id]: _f, ...rf } = fileChangesPerConv;
      fileChangesPerConv = rf;
    }
    if (liveFileChangesPerConv[id]) {
      clearLiveFileChanges(id);
    }
    if (id in convTrees) {
      const { [id]: _t, ...rt } = convTrees;
      convTrees = rt;
    }

    if (!ownerWorkspace || ownerWorkspace === workspacePath) {
      conversations = conversations.filter((c) => c.id !== id);
    }
    for (const [path, snapshot] of workspaceConversationSnapshots) {
      const filtered = snapshot.filter((conversation) => conversation.id !== id);
      if (filtered.length !== snapshot.length) {
        workspaceConversationSnapshots.set(path, filtered);
      }
    }
    recentConversations = recentConversations.filter((conversation) => conversation.id !== id);
    searchConversations = searchConversations.filter((conversation) => conversation.id !== id);
    navigationHistory = removeNavigationLocations(
      navigationHistory,
      (location) => location.conversationId === id,
    );
    loadedConvIds.delete(id);
    invoke("delete_conversation", { convId: id }).catch(() => {});
    if (activeConvId === id) {
      if (conversations.length > 0) {
        switchConversation(conversations[0].id);
      } else {
        restoringSurface = "new-conversation";
        activeConvId = null;
        cacheRestoreSurface("new-conversation", null);
      }
    }
    if (id in queuedChatMessages) {
      const { [id]: _, ...rest } = queuedChatMessages;
      queuedChatMessages = rest;
    }
    composerDrafts.delete(conversationComposerDraftKey(id));
  }

  function togglePin(id: string) {
    const idx = conversations.findIndex((c) => c.id === id);
    if (idx !== -1) {
      const newPinned = !conversations[idx].pinned;
      conversations[idx] = { ...conversations[idx], pinned: newPinned };
      invoke("update_conversation", { convId: id, patch: { pinned: newPinned } }).catch(() => {});
    }
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────────

  async function dispatchChatMessage(
    rawText: string,
    targetConvId: string | null = activeConvId,
    clearInput = false,
    attachments: ChatAttachment[] = activeComposerDraft.attachments,
    contexts: UserMessageContext[] = activeComposerDraft.contexts,
    model = composerPreferences.selectedModel,
  ) {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    if (!model || !composerPreferences.modelOptions.some((option) => option.value === model)) {
      showToast({ title: $t("modelSetupRequired"), variant: "error" });
      openSettings("providers");
      return;
    }

    const text =
      rawText.trim() ||
      (attachments.length > 0
        ? $t("attachmentOnlyPrompt")
        : contexts.length > 0
          ? $t("quoteOnlyPrompt")
          : "");
    if (!text && attachments.length === 0 && contexts.length === 0) return;
    if (targetConvId && chatStreams.streamingConversationIds[targetConvId]) return;
    if (!targetConvId && isCurrentStreaming) return;

    let convId = targetConvId;
    let pendingConversationCreation: {
      id: string;
      title: string;
      workspace: string;
      parentConvId: null;
      roleId: string | null;
    } | null = null;
    const composerDraftKeyToClear = selectedComposerDraftKey;

    if (!convId) {
      const newId = crypto.randomUUID();
      const wsPath = workspacePath || "";
      const conv: Conversation = {
        id: newId,
        title: $t("newConv"),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        roleId: selectedRoleId ?? undefined,
      };
      conversations = [conv, ...conversations];
      activeConvId = conv.id;
      restoringSurface = "conversation";
      cacheRestoreSurface("conversation", conv.id);
      convId = conv.id;
      // Mark as loaded so switchConversation won't overwrite in-memory messages
      loadedConvIds.add(convId);
      pendingConversationCreation = {
        id: newId,
        title: $t("newConv"),
        workspace: wsPath,
        parentConvId: null,
        roleId: selectedRoleId,
      };
    }

    if (clearInput) clearComposerDraft(composerDraftKeyToClear);

    const abandonedInput = pendingUserInputs[convId];
    if (abandonedInput) {
      markUserInputResolved(convId, abandonedInput.request_id, "cancelled", {
        cancelled: true,
        reason: "continued_conversation",
      });
      clearPendingInput(convId, abandonedInput.request_id);
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
      items: [
        ...contexts.map((context) => ({ type: "quote" as const, context })),
        ...attachments.map((attachment) => ({ type: "attachment" as const, attachment })),
      ],
    };
    const location = findConversationLocation(convId);
    if (!location) return;
    const existingConversation = location.conversations[location.index];
    const priorMessages = existingConversation.messages;
    const isFirstUserMsg = !priorMessages.some((m) => m.role === "user");
    const newTitle = isFirstUserMsg ? text.slice(0, 48) : existingConversation.title;

    location.conversations[location.index] = {
      ...existingConversation,
      messages: [...priorMessages, userMsg],
      title: newTitle ?? $t("newConv"),
      updatedAt: Date.now(),
    };
    promoteConversationInRecents(location.conversations[location.index]);

    // Commit the first optimistic user turn before yielding to persistence. An
    // active-but-empty conversation would otherwise render the new-conversation
    // prompt between the centered composer and the live transcript.
    if (pendingConversationCreation) {
      await invoke("create_conversation", pendingConversationCreation).catch(() => {});
    }

    // The user message is persisted atomically in the resulting checkpoint.
    // Update conversation title in SQLite on first user message
    if (isFirstUserMsg && newTitle) {
      await invoke("update_conversation", {
        convId,
        patch: {
          title: newTitle,
          title_source: "fallback",
          updated_at: Math.floor(Date.now() / 1000),
        },
      }).catch(() => {});
    }

    const assistantMsgId = crypto.randomUUID();
    chatStreams.startTiming(convId, userMsg.timestamp);
    chatStreams.streamingConversationIds = {
      ...chatStreams.streamingConversationIds,
      [convId]: true,
    };
    chatStreams.awaitingOutput = {
      ...chatStreams.awaitingOutput,
      [convId]: true,
    };
    if (config?.memory_retrieval_enabled) {
      chatStreams.memoryRetrievalStages = {
        ...chatStreams.memoryRetrievalStages,
        [convId]: "query_rewrite",
      };
    }
    chatStreams.itemsByConversation = { ...chatStreams.itemsByConversation, [convId]: [] };
    chatStreams.assistantMessageIds = {
      ...chatStreams.assistantMessageIds,
      [convId]: assistantMsgId,
    };

    // Decide where this turn attaches in the checkpoint tree.
    // Re-execution stamped pendingParentCk; otherwise it's the tip of the active path.
    let parentCheckpointId: string | null;
    if (convId in pendingParentCk) {
      parentCheckpointId = pendingParentCk[convId];
    } else {
      const tree = convTrees[convId];
      const path = tree ? computeActivePath(tree) : [];
      const tip = [...path].reverse().find((m) => m.role === "assistant" && m.checkpointId);
      parentCheckpointId = tip?.checkpointId ?? null;
    }
    const forkedFromMessageId = pendingForkMessageId[convId];
    const forkSourceCheckpointId = pendingForkSourceCheckpointId[convId];
    const useRuntimeFork =
      convId in pendingParentCk &&
      typeof forkedFromMessageId === "string" &&
      typeof forkSourceCheckpointId === "string" &&
      (await externalRuntimeTransport);
    if (useRuntimeFork) {
      pendingForkUserMessageIds = { ...pendingForkUserMessageIds, [convId]: userMsg.id };
    }
    // Embedded diagnostics still need an explicit branch id. The ordinary
    // external Runtime owns branch creation and route selection atomically.
    const branchId = useRuntimeFork
      ? null
      : await ensureActiveBranch(
          convId,
          convId in pendingParentCk ? parentCheckpointId : undefined,
          forkedFromMessageId,
        );

    if (location.isCurrentWorkspace) await scrollToBottom();

    // Fire and forget — global listeners handle chunk/checkpoint/done events
    const submission =
      useRuntimeFork &&
      typeof forkedFromMessageId === "string" &&
      typeof forkSourceCheckpointId === "string"
        ? openAgent.forkRemoteConversationRun({
            convId,
            text,
            sourceCheckpointId: forkSourceCheckpointId,
            parentCheckpointId,
            forkedFromMessageId,
            attachments: attachments.map((attachment) => ({
              locator: attachment.path,
              name: attachment.name,
            })),
            contexts,
            modelBinding: decodeModelBinding(model),
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsgId,
          })
        : openAgent.submitInput({
            convId,
            text,
            parentCheckpointId,
            branchId,
            attachments: attachments.map((attachment) => attachment.path),
            contexts,
            modelBinding: decodeModelBinding(model),
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsgId,
          });
    submission
      .then(() => {
        // Events are the live path, but the completed checkpoint is authoritative.
        // If a terminal event was lost, reconcile instead of leaving a permanent
        // streaming row and sidebar dot.
        if (!chatStreams.streamingConversationIds[convId]) return;
        const latestLocation = findConversationLocation(convId);
        if (latestLocation && !latestLocation.isCurrentWorkspace) {
          notifyInactiveWindowOfAgentCompletion(assistantMsgId, "completed", true);
          chatStreams.cleanup(convId);
          void dispatchNextQueuedMessage(convId);
          return;
        }
        loadedConvIds.delete(convId);
        void loadMessagesForConv(convId, false).finally(() => {
          if (!chatStreams.streamingConversationIds[convId]) return;
          notifyInactiveWindowOfAgentCompletion(assistantMsgId, "completed", true);
          chatStreams.cleanup(convId);
          void dispatchNextQueuedMessage(convId);
        });
      })
      .catch((err: unknown) => {
        const { [convId]: _pp, ...restPp } = pendingParentCk;
        const { [convId]: _pf, ...restPf } = pendingForkMessageId;
        const { [convId]: _pfs, ...restPfs } = pendingForkSourceCheckpointId;
        const { [convId]: _pfu, ...restPfu } = pendingForkUserMessageIds;
        pendingParentCk = restPp;
        pendingForkMessageId = restPf;
        pendingForkSourceCheckpointId = restPfs;
        pendingForkUserMessageIds = restPfu;
        const errMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${err}`,
          timestamp: Date.now(),
        };
        const failedLocation = findConversationLocation(convId);
        if (failedLocation) {
          failedLocation.conversations[failedLocation.index] = {
            ...failedLocation.conversations[failedLocation.index],
            messages: [...failedLocation.conversations[failedLocation.index].messages, errMsg],
            updatedAt: Date.now(),
          };
        }
        chatStreams.cleanup(convId!);
      });
  }

  async function sendMessage() {
    const text = activeComposerDraft.text;
    const attachments = [...activeComposerDraft.attachments];
    const contexts = [...activeComposerDraft.contexts];
    if (!text.trim() && attachments.length === 0 && contexts.length === 0) return;

    if (text.trimStart().startsWith("/") && (await handleClientSlashInput(text))) {
      return;
    }

    if (activeConvId && chatStreams.streamingConversationIds[activeConvId]) {
      const paused = !!chatStreams.pausedConversationIds[activeConvId];
      queuedChatMessages = enqueueChatMessage(queuedChatMessages, activeConvId, {
        text,
        attachments,
        contexts,
        model: composerPreferences.selectedModel,
      });
      await syncChatQueuePending(activeConvId);
      clearComposerDraft();
      if (paused) await setStreamPaused(activeConvId, false);
      return;
    }

    await dispatchQueuedOrImmediateMessage(
      text,
      activeConvId,
      attachments,
      contexts,
      composerPreferences.selectedModel,
      true,
    );
  }

  async function sendSuggestedMessage(suggestion: string) {
    const text = suggestion.trim();
    if (!text || composerPreferences.modelOptions.length === 0) return;
    if (activeConvId && chatStreams.streamingConversationIds[activeConvId]) return;
    await dispatchQueuedOrImmediateMessage(
      text,
      activeConvId,
      [],
      [],
      composerPreferences.selectedModel,
      false,
    );
  }

  async function handleClientSlashInput(text: string): Promise<boolean> {
    try {
      const resolved = await openAgent.invokeProduct("resolve_agent_input", { text });
      if (resolved.type === "agent_command" && resolved.command === "compact") {
        clearComposerDraft();
        await compactCurrentConversation();
        return true;
      }
      if (resolved.type !== "client_action") return false;
      const run = clientActionRun(resolved.action);
      if (!run) return false;
      clearComposerDraft();
      run();
      return true;
    } catch (error) {
      const inputError = error as { code?: string };
      showToast({
        title: inputError.code === "missing_argument" ? tr("goalCommandNeedsText") : String(error),
        variant: "error",
      });
      return true;
    }
  }

  async function dispatchQueuedOrImmediateMessage(
    text: string,
    convId: string | null,
    attachments: ChatAttachment[],
    contexts: UserMessageContext[],
    model: string,
    clearInput: boolean,
  ) {
    await dispatchChatMessage(text, convId, clearInput, attachments, contexts, model);
  }

  async function dispatchNextQueuedMessage(convId: string) {
    if (chatStreams.streamingConversationIds[convId]) return;
    const { next, queue } = dequeueChatMessage(queuedChatMessages, convId);
    if (!next) return;
    queuedChatMessages = queue;
    await syncChatQueuePending(convId);
    await dispatchQueuedOrImmediateMessage(
      next.text,
      convId,
      next.attachments,
      next.contexts,
      next.model,
      false,
    );
  }

  async function stopMessage() {
    if (!tauriAvailable) return;
    if (!activeConvId || !isCurrentStreaming) return;
    // Saving the partial response can be queued behind earlier stream writes.
    // Do not make that queue delay the cancellation signal.
    void persistStreamDraft(activeConvId, true).catch(() => {});
    await invoke("cancel_chat_message", { convId: activeConvId }).catch(() => {});
  }

  async function setStreamPaused(convId: string, paused: boolean) {
    const previous = !!chatStreams.pausedConversationIds[convId];
    chatStreams.pausedConversationIds = { ...chatStreams.pausedConversationIds, [convId]: paused };
    try {
      await openAgent.setConversationStreamPaused(convId, paused);
    } catch (error) {
      if (
        chatStreams.streamingConversationIds[convId] &&
        chatStreams.pausedConversationIds[convId] === paused
      ) {
        chatStreams.pausedConversationIds = {
          ...chatStreams.pausedConversationIds,
          [convId]: previous,
        };
      }
      showToast({ title: String(error), variant: "error" });
    }
  }

  async function pauseCurrentStream() {
    if (!activeConvId || !isCurrentStreaming || isCurrentStreamPaused) return;
    await setStreamPaused(activeConvId, true);
  }

  async function resumeCurrentStream() {
    if (!activeConvId || !isCurrentStreaming || !isCurrentStreamPaused) return;
    await setStreamPaused(activeConvId, false);
  }

  async function skipCurrentMemoryRetrieval() {
    if (!activeConvId || !currentMemoryRetrievalStage || !currentMemoryRetrievalCanSkip) return;
    const convId = activeConvId;
    const previousStage = currentMemoryRetrievalStage;
    chatStreams.memoryRetrievalStages = {
      ...chatStreams.memoryRetrievalStages,
      [convId]: "skipped",
    };
    chatStreams.memoryRetrievalSkippable = {
      ...chatStreams.memoryRetrievalSkippable,
      [convId]: false,
    };
    try {
      await openAgent.skipMemoryRetrieval(convId);
    } catch (error) {
      if (
        chatStreams.streamingConversationIds[convId] &&
        chatStreams.memoryRetrievalStages[convId] === "skipped"
      ) {
        chatStreams.memoryRetrievalStages = {
          ...chatStreams.memoryRetrievalStages,
          [convId]: previousStage,
        };
        chatStreams.memoryRetrievalSkippable = {
          ...chatStreams.memoryRetrievalSkippable,
          [convId]: true,
        };
      }
      showToast({ title: String(error), variant: "error" });
    }
  }

  const BOTTOM_SCROLL_THRESHOLD = 24;

  function isMessagesScrolledToBottom() {
    if (!messagesEl) return true;
    return (
      messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight <=
      BOTTOM_SCROLL_THRESHOLD
    );
  }

  function handleMessagesScroll() {
    if (Date.now() < programmaticBottomScrollUntil) {
      followStreamToBottom = true;
      return;
    }
    followStreamToBottom = isMessagesScrolledToBottom();
  }

  function markProgrammaticTailPin() {
    programmaticBottomScrollUntil = Math.max(programmaticBottomScrollUntil, Date.now() + 120);
  }

  function cancelBottomScrollFromUser() {
    const hasCompletionAnchor = streamCompletionTailAnchor?.convId === activeConvId;
    if (Date.now() >= programmaticBottomScrollUntil && !hasCompletionAnchor) return;
    bottomScrollRunId += 1;
    programmaticBottomScrollUntil = 0;
    streamCompletionTailAnchor = null;
    followStreamToBottom = false;
    if (bottomScrollRaf !== null) {
      cancelAnimationFrame(bottomScrollRaf);
      bottomScrollRaf = null;
    }
  }

  async function scrollToBottom(behavior: ScrollBehavior = "auto") {
    await tick();
    const el = messagesEl;
    if (!el) return;

    followStreamToBottom = true;
    const runId = ++bottomScrollRunId;

    if (behavior !== "smooth") {
      programmaticBottomScrollUntil = 0;
      el.scrollTop = el.scrollHeight;
      return;
    }

    programmaticBottomScrollUntil = Date.now() + 1400;
    el.scrollTo({ top: el.scrollHeight, behavior });

    const keepNavigating = () => {
      if (
        runId !== bottomScrollRunId ||
        Date.now() >= programmaticBottomScrollUntil ||
        !messagesEl
      ) {
        if (runId === bottomScrollRunId) programmaticBottomScrollUntil = 0;
        bottomScrollRaf = null;
        return;
      }
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
      bottomScrollRaf = requestAnimationFrame(keepNavigating);
    };
    bottomScrollRaf = requestAnimationFrame(keepNavigating);
  }

  function beginStreamCompletionTailAnchor(convId: string) {
    if (
      convId !== activeConvId ||
      (!followStreamToBottom && Date.now() >= programmaticBottomScrollUntil)
    ) {
      return;
    }
    followStreamToBottom = true;
    programmaticBottomScrollUntil = Date.now() + 600;
    streamCompletionTailAnchor = {
      convId,
      token: ++streamCompletionTailAnchorSequence,
    };
  }

  function finishStreamCompletionTailAnchor(token: number) {
    const anchor = streamCompletionTailAnchor;
    if (!anchor || anchor.token !== token || anchor.convId !== activeConvId) return;
    streamCompletionTailAnchor = null;
    programmaticBottomScrollUntil = 0;
    followStreamToBottom = true;
  }

  onMount(() => {
    return () => {
      if (bottomScrollRaf !== null) cancelAnimationFrame(bottomScrollRaf);
    };
  });

  // ─── Workspace ────────────────────────────────────────────────────────────────

  type PreparedWorkspaceSwitch = {
    activeConversation: StartupConversationBundle | null;
    activeConversationTree?: ConvTree;
    activeBranchId: string | null;
    activeConversationId: string | null;
    conversations: Conversation[];
    conversationNextCursor: ConversationPageCursor | null;
    pendingUserInput?: UserInputRequest;
    roles: AgentRole[];
    selectedRoleKey: string;
    newConversationSuggestions: string[];
  };

  async function prepareWorkspaceSwitch(
    path: string,
    preferredConversationId?: string,
    restoreActiveConversation = true,
  ): Promise<PreparedWorkspaceSwitch> {
    if (!tauriAvailable) {
      return {
        activeConversation: null,
        activeConversationTree: undefined,
        activeBranchId: null,
        activeConversationId: null,
        conversations: [],
        conversationNextCursor: null,
        pendingUserInput: undefined,
        roles: [],
        selectedRoleKey: defaultRoleKey,
        newConversationSuggestions: [],
      };
    }
    const [roles, durableActiveId, preparedNewConversationSuggestions] = await Promise.all([
      loadAvailableRolesForWorkspace(path),
      restoreActiveConversation
        ? invoke<string | null>("get_active_conv_id", { workspace: path || "" }).catch(() => null)
        : Promise.resolve(null),
      loadNewConversationSuggestions(path, config?.language ?? "zh"),
    ]);
    let activeConversationId = preferredConversationId ?? durableActiveId;
    let activeMeta = activeConversationId
      ? await fetchConversationMeta(activeConversationId).catch(() => null)
      : null;
    if (activeMeta?.workspace && activeMeta.workspace !== path) activeMeta = null;
    if (!activeMeta) activeConversationId = null;

    const requestedRoleKey = activeMeta?.roleId ?? storedRoleSelection(path);
    const selectedRoleKey =
      requestedRoleKey === defaultRoleKey || roles.some((role) => role.id === requestedRoleKey)
        ? requestedRoleKey
        : defaultRoleKey;
    const page = await fetchConversationPage(
      path || null,
      null,
      30,
      null,
      true,
      selectedRoleKey === defaultRoleKey ? null : selectedRoleKey,
    );

    const lineage: Conversation[] = [];
    const visited = new Set<string>();
    let current = activeMeta;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      lineage.push(current);
      if (!current.parentConvId) break;
      current = await fetchConversationMeta(current.parentConvId).catch(() => null);
      if (current?.workspace && current.workspace !== path) current = null;
    }

    const activeConversation = activeConversationId
      ? await Promise.all([
          fetchRenderableCheckpoints(activeConversationId),
          invoke<string | null>("get_active_branch_tip", { convId: activeConversationId }).catch(
            () => null,
          ),
          invoke<StartupConversationBundle["branches"]>("get_branches", {
            convId: activeConversationId,
          }).catch(() => []),
          fetchFileChanges(activeConversationId),
        ]).then(([checkpoints, activeBranchTip, branches, fileChanges]) => ({
          checkpoints,
          active_branch_tip: activeBranchTip,
          branches,
          file_changes: fileChanges,
        }))
      : null;

    let preparedConversations = prepareWorkspaceConversationSnapshot(
      mergeConversationMetadata(page.conversations, lineage),
      workspaceConversationSnapshots.get(path) ?? [],
      activeConversationId,
      null,
    );
    let activeConversationTree: ConvTree | undefined;
    let activeBranchId: string | null = null;
    let pendingUserInput: UserInputRequest | undefined;
    if (activeConversationId && activeConversation) {
      mergeDurableFollowUpSuggestions(activeConversation.checkpoints);
      let tree = buildTreeFromCheckpoints(
        activeConversation.checkpoints,
        convTrees[activeConversationId],
      );
      if (activeConversation.active_branch_tip) {
        tree = selectActivePathToCheckpoint(tree, activeConversation.active_branch_tip);
        activeBranchId =
          activeConversation.branches.find(
            (branch) => branch.head_checkpoint_id === activeConversation.active_branch_tip,
          )?.id ?? null;
      }
      const pendingProjection = restorePendingUserInputFromCheckpoint(
        activeConversationId,
        computeActivePath(tree),
        activeConversation.checkpoints,
      );
      pendingUserInput = pendingProjection.pendingRequest;
      const cachedMessages =
        workspaceConversationSnapshots
          .get(path)
          ?.find((conversation) => conversation.id === activeConversationId)?.messages ?? [];
      const hydratedMessages = chatStreams.streamingConversationIds[activeConversationId]
        ? preserveStreamingMessagesDuringHydration(
            cachedMessages,
            pendingProjection.messages,
            pendingForkUserMessageIds[activeConversationId],
          )
        : pendingProjection.messages;
      preparedConversations = prepareWorkspaceConversationSnapshot(
        preparedConversations,
        [],
        activeConversationId,
        hydratedMessages,
      );
      activeConversationTree = tree;
    }

    return {
      activeConversation,
      activeConversationTree,
      activeBranchId,
      activeConversationId,
      conversations: preparedConversations,
      conversationNextCursor: page.nextCursor,
      pendingUserInput,
      roles,
      selectedRoleKey,
      newConversationSuggestions: preparedNewConversationSuggestions,
    };
  }

  async function applyWorkspace(
    path: string,
    target: { conversationId?: string; newConversation?: boolean } = {},
  ): Promise<boolean> {
    if (path === workspacePath) return true;
    if (workspaceLoading) return false;

    workspaceSwitchTarget = path;
    workspaceLoading = true;
    const previousWorkspacePath = workspacePath;
    let runtimeWorkspaceChanged = false;
    let workspaceStateCommitted = false;
    try {
      let nextWorkspace: WorkspaceContext = {
        path,
        git_branch: null,
        has_agent_dir: false,
        environment: { kind: "local" },
      };
      if (tauriAvailable) {
        await openAgent.invokeProduct("set_workspace", { path: path || null });
        runtimeWorkspaceChanged = true;
      }
      const prepared = await prepareWorkspaceSwitch(
        path,
        target.conversationId,
        !target.newConversation,
      );
      if (tauriAvailable) {
        nextWorkspace = (await openAgent.invokeProduct<"get_workspace_context">(
          "get_workspace_context",
          {},
        )) as WorkspaceContext;
      }
      // Commit the prepared workspace as one state transition so the mounted
      // transcript and composer are never replaced by an app-wide loading pass.
      workspaceConversationSnapshots.set(previousWorkspacePath, conversations);
      workspacePath = path;
      workspace = nextWorkspace;
      agentRoles = prepared.roles;
      selectedRoleKey = prepared.selectedRoleKey;
      conversations = prepared.conversations;
      workspaceConversationSnapshots.set(path, conversations);
      conversationNextCursor = prepared.conversationNextCursor;
      searchConversations = [];
      searchConversationNextCursor = null;
      conversationSearchGeneration += 1;
      activeConvId = prepared.activeConversationId;
      restoringSurface = activeConvId ? "conversation" : "new-conversation";
      newConversationSuggestions = prepared.newConversationSuggestions;
      workspaceStateCommitted = true;

      if (activeConvId && prepared.activeConversation) {
        loadedConvIds.add(activeConvId);
        if (prepared.activeConversationTree) {
          convTrees = { ...convTrees, [activeConvId]: prepared.activeConversationTree };
        }
        if (prepared.activeBranchId) {
          activeBranchIds = { ...activeBranchIds, [activeConvId]: prepared.activeBranchId };
        }
        if (prepared.pendingUserInput) {
          pendingUserInputs = { ...pendingUserInputs, [activeConvId]: prepared.pendingUserInput };
        }
        fileChangesPerConv = {
          ...fileChangesPerConv,
          [activeConvId]: prepared.activeConversation.file_changes,
        };
        if (prepared.activeConversationTree) {
          await syncAgentHistoryToActivePath(activeConvId, prepared.activeConversationTree);
        }
        if (activeConvId === target.conversationId) {
          window.localStorage.setItem(roleSelectionStorageKey(path), selectedRoleKey);
          await invoke("set_active_conversation", {
            convId: activeConvId,
            workspace: path || "",
          }).catch(() => {});
        }
        await scrollToBottom();
      } else if (tauriAvailable) {
        await openAgent
          .invokeProduct("set_active_conversation", { convId: null, workspace: path || "" })
          .catch(() => {});
      }
      cacheRestoreSurface(restoringSurface, activeConvId, path);
      await addToRecentWorkspaces(path);
      void refreshRecentConversations();
    } catch (error) {
      if (runtimeWorkspaceChanged && !workspaceStateCommitted) {
        await openAgent
          .invokeProduct("set_workspace", { path: previousWorkspacePath || null })
          .catch(() => {});
      }
      console.warn("Failed to open workspace:", path, error);
      showToast({
        title: $t("workspaceUnavailable"),
        description: path,
        descriptionFromEnd: true,
        variant: "error",
      });
      return false;
    } finally {
      workspaceLoading = false;
      workspaceSwitchTarget = null;
    }
    return true;
  }

  type WorkspaceRouteResult = "current" | "routed" | "failed";

  async function routeWorkspace(
    path: string,
    target: {
      conversationId?: string;
      messageId?: string;
      newConversation?: boolean;
    } = {},
  ): Promise<WorkspaceRouteResult> {
    if (path === workspacePath) return "current";
    if (!tauriAvailable) return (await applyWorkspace(path, target)) ? "current" : "failed";

    if (await applyWorkspace(path, target)) return "current";
    return "failed";
  }

  async function requestWorkspace(path: string) {
    if (!path || path === workspacePath) return;
    await routeWorkspace(path);
  }

  async function openSidebarConversation(conversation: Conversation): Promise<void> {
    closeAuxiliarySurfaces();
    const conversationWorkspace = conversation.workspace || workspacePath;
    if (conversationWorkspace && conversationWorkspace !== workspacePath) {
      const result = await routeWorkspace(conversationWorkspace, {
        conversationId: conversation.id,
      });
      if (result !== "current") return;
    }
    await selectSidebarConversation(conversation.id);
  }

  async function persistRecentWorkspaces(next: RecentWorkspace[]): Promise<void> {
    if (next !== recentWorkspaces) recentWorkspaces = next;
    if (!tauriAvailable) return;

    // Serialize writes and await the latest one at workspace-switch boundaries.
    // The old fire-and-forget call could be lost when the window closed immediately.
    const workspace = workspacePath;
    const recents = [...next];
    workspacePrefsSaveQueue = workspacePrefsSaveQueue
      .catch(() => {})
      .then(() => invoke("save_workspace_prefs", { workspace, recentWorkspaces: recents }))
      .then(() => {});
    await workspacePrefsSaveQueue.catch(() => {});
  }

  async function addToRecentWorkspaces(path: string) {
    const next = addWorkspaceToPersistedOrder(recentWorkspaces, path);
    await persistRecentWorkspaces(next);
  }

  function toggleProjectPin(path: string): void {
    pinnedProjectPaths = togglePinnedProjectPath(pinnedProjectPaths, path);
    window.localStorage.setItem(pinnedProjectsStorageKey, JSON.stringify(pinnedProjectPaths));
  }

  async function openProjectFolder(path: string): Promise<void> {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    await invoke("open_path", { path }).catch((error) => {
      console.warn("Failed to open project folder", error);
      showToast({
        title: $t("workspaceUnavailable"),
        description: path,
        descriptionFromEnd: true,
        variant: "error",
      });
    });
  }

  async function removeProject(path: string): Promise<void> {
    if (pinnedProjectPaths.includes(path)) toggleProjectPin(path);
    await persistRecentWorkspaces(recentWorkspaces.filter((workspace) => workspace.path !== path));
  }

  async function pickWorkspace() {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    const defaultPath = await homeDir();
    const selected = await openDialog({ directory: true, multiple: false, defaultPath });
    if (typeof selected === "string" && selected) {
      await requestWorkspace(selected);
    }
  }

  async function pickOnboardingWorkspace() {
    if (!tauriAvailable) return;
    const defaultPath = workspacePath || (await homeDir());
    const selected = await openDialog({ directory: true, multiple: false, defaultPath });
    if (typeof selected !== "string" || !selected) return;
    workspacePath = selected;
    if (config) config = { ...config, workspace: selected };
  }

  async function createNewWindow() {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    if (!workspacePath) return;
    await invoke("create_workspace_window", { path: workspacePath }).catch((error) => {
      console.warn("Failed to create workspace window", error);
      showToast({
        title: $t("workspaceUnavailable"),
        description: workspacePath,
        descriptionFromEnd: true,
        variant: "error",
      });
    });
  }

  async function switchNewConversationWorkspace(path: string): Promise<void> {
    if (!path) return;
    if (path !== workspacePath) {
      const result = await routeWorkspace(path, { newConversation: true });
      if (result !== "current") return;
    }
    await newConversation();
  }

  async function pickNewConversationWorkspace(): Promise<void> {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    const defaultPath = await homeDir();
    const selected = await openDialog({ directory: true, multiple: false, defaultPath });
    if (typeof selected === "string" && selected) {
      await switchNewConversationWorkspace(selected);
    }
  }

  async function selectWslDistribution(distribution: string) {
    wslDistribution = distribution;
    wslPickerError = "";
    if (!distribution) return;
    wslPickerBusy = true;
    try {
      const target = await invoke<WslWorkspaceTarget>("get_wsl_home", { distribution });
      if (wslDistribution === distribution) wslLinuxPath = target.linux_path;
    } catch (error) {
      if (wslDistribution === distribution) wslPickerError = String(error);
    } finally {
      if (wslDistribution === distribution) wslPickerBusy = false;
    }
  }

  async function pickWslWorkspace(startNewConversation = false) {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    wslPickerStartsNewConversation = startNewConversation;
    wslPickerOpen = true;
    wslPickerBusy = true;
    wslPickerError = "";
    wslDistributions = [];
    wslDistribution = "";
    wslLinuxPath = "";
    try {
      wslDistributions = await invoke<WslDistribution[]>("list_wsl_distributions");
      if (wslDistributions.length === 0) {
        wslPickerError = $t("wslNoDistributions");
        return;
      }
      await selectWslDistribution(wslDistributions[0].name);
    } catch (error) {
      wslPickerError = String(error);
    } finally {
      if (!wslDistribution) wslPickerBusy = false;
    }
  }

  async function resolveSelectedWslWorkspace(): Promise<WslWorkspaceTarget | null> {
    if (!wslDistribution || !wslLinuxPath.trim()) return null;
    wslPickerBusy = true;
    wslPickerError = "";
    try {
      return await invoke<WslWorkspaceTarget>("resolve_wsl_workspace", {
        distribution: wslDistribution,
        linuxPath: wslLinuxPath.trim(),
      });
    } catch (error) {
      wslPickerError = String(error);
      return null;
    } finally {
      wslPickerBusy = false;
    }
  }

  async function browseWslWorkspace() {
    const target = await resolveSelectedWslWorkspace();
    if (!target) return;
    const selected = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: target.path,
    });
    if (typeof selected === "string" && selected) {
      wslPickerOpen = false;
      if (wslPickerStartsNewConversation) await switchNewConversationWorkspace(selected);
      else await requestWorkspace(selected);
    }
  }

  async function openSelectedWslWorkspace() {
    const target = await resolveSelectedWslWorkspace();
    if (!target) return;
    wslPickerOpen = false;
    if (wslPickerStartsNewConversation) await switchNewConversationWorkspace(target.path);
    else await requestWorkspace(target.path);
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  async function openSettings(initialNav?: typeof settingsInitialNav) {
    // SettingsView autosaves its draft on unmount. Do not create it with the
    // empty fallback while the persisted configuration is still loading.
    if (!config) {
      await loadSettings();
      if (!config) return;
    }
    SettingsView ??= (await import("$lib/components/SettingsView.svelte")).default;
    settingsInitialNav = initialNav;
    settingsOpen = true;
  }

  function closeSettings() {
    settingsOpen = false;
    settingsInitialNav = undefined;
    if (config) setLocale((config.language ?? "zh") as Locale);
  }

  async function openHookConversation(conversationId: string) {
    navigationCaptureDepth += 1;
    try {
      const target = await fetchConversationMeta(conversationId).catch(() => null);
      closeAuxiliarySurfaces();
      if (target?.workspace && target.workspace !== workspacePath) {
        const result = await routeWorkspace(target.workspace, { conversationId });
        if (result !== "current") return;
      }
      await selectSidebarConversation(conversationId);
    } finally {
      navigationCaptureDepth -= 1;
    }
  }

  async function saveSettings(nextConfig: AppConfig, baseConfig?: AppConfig, reportError = true) {
    const previousShortcut = normalizeQuickChatShortcut(
      config?.quick_chat_shortcut ?? DEFAULT_QUICK_CHAT_SHORTCUT,
    );
    const nextShortcut = normalizeQuickChatShortcut(nextConfig.quick_chat_shortcut);
    const shortcutChanged = previousShortcut !== nextShortcut;
    try {
      const snapshot = normalizeConfigShape(nextConfig);
      let savedSnapshot = snapshot;
      if (shortcutChanged && !launchContext?.workspace) {
        await replaceQuickChatShortcut(nextShortcut);
      }
      if (tauriAvailable) {
        const saved = await invoke<AppConfig>("save_settings", {
          config: snapshot,
          baseConfig: normalizeConfigShape(baseConfig ?? config ?? snapshot),
        });
        savedSnapshot = normalizeConfigShape(saved);
      }
      config = structuredClone(savedSnapshot);
      applyTheme(config.theme ?? "system");
      setLocale((config.language ?? "zh") as Locale);
      await emit("settings-changed").catch((error) => {
        console.error("Failed to notify desktop surfaces after settings save:", error);
      });
      return structuredClone(savedSnapshot);
    } catch (err: unknown) {
      if (shortcutChanged && !launchContext?.workspace) {
        await replaceQuickChatShortcut(previousShortcut).catch(() => {});
      }
      const conflict = `${err}`.includes("SETTINGS_CONFLICT:");
      if (conflict) await loadSettings();
      if (reportError) {
        alert(`${$t(conflict ? "settingsSaveConflict" : "settingsSaveFailed")}: ${err}`);
      }
      throw err;
    }
  }

  async function completeOnboarding() {
    if (!tauriAvailable) return;
    await emit(ONBOARDING_COMPLETE_EVENT, { workspace_path: workspacePath });
    await getCurrentWindow().hide();
  }

  function closeAuxiliarySurfaces(): void {
    if (settingsOpen) closeSettings();
  }

  async function restoreNavigationLocation(location: AppNavigationLocation): Promise<void> {
    closeAuxiliarySurfaces();
    if (location.workspacePath !== workspacePath) {
      const result = await routeWorkspace(location.workspacePath, {
        conversationId: location.conversationId ?? undefined,
        newConversation: !location.conversationId,
      });
      if (result !== "current") return;
    }
    if (location.conversationId) {
      await switchConversation(location.conversationId);
    } else {
      await activateNewConversationSurface(location.roleKey);
    }

    switch (location.surface) {
      case "settings":
        await openSettings();
        break;
      case "chat":
        break;
    }
  }

  async function navigateHistory(offset: -1 | 1): Promise<void> {
    if (navigationTransitioning) return;
    const move = moveNavigationHistory(navigationHistory, offset);
    if (!move) return;
    const previousHistory = navigationHistory;
    navigationTransitioning = true;
    navigationHistory = move.history;
    try {
      await restoreNavigationLocation(move.location);
    } catch (error) {
      navigationHistory = previousHistory;
      showToast({
        title: $t("navigationFailed"),
        description: String(error),
        variant: "error",
      });
    } finally {
      navigationTransitioning = false;
    }
  }

  async function compactCurrentConversation() {
    if (!tauriAvailable || !activeConvId || isCurrentStreaming) return;
    try {
      const outcome = await openAgent.submitInput({
        convId: activeConvId,
        text: "/compact",
        modelBinding: decodeModelBinding(composerPreferences.selectedModel),
        userMessageId: crypto.randomUUID(),
        assistantMessageId: crypto.randomUUID(),
      });
      if (outcome.type === "immediate_command" && !outcome.changed) {
        showToast({
          title: $t("compactConversationSkipped"),
          variant: "info",
        });
      }
    } catch (err) {
      showToast({
        title: $t("compactConversationFailed"),
        description: String(err),
        variant: "error",
      });
    }
  }

  // ─── Slash commands (input box) ──────────────────────────────────────────────

  function slashCommandRun(name: string): (() => void) | null {
    switch (name) {
      case "new":
        return () => newConversation();
      case "model":
        return () => openSettings("defaults");
      case "compact":
        return () => {
          void compactCurrentConversation();
        };
      case "goal":
      case "graph":
        return null;
      case "settings":
        return () => openSettings();
      default:
        return null;
    }
  }

  function clientActionRun(action: string): (() => void) | null {
    switch (action) {
      case "new_conversation":
        return () => newConversation();
      case "open_model_settings":
        return () => openSettings("defaults");
      case "open_settings":
        return () => openSettings();
      default:
        return null;
    }
  }

  let slashCommands = $derived.by<SlashCommand[]>(() =>
    agentCommandSpecs.flatMap((spec) => {
      const run = slashCommandRun(spec.name);
      const insertText =
        spec.name === "goal" || spec.name === "graph" ? `/${spec.name}` : undefined;
      if (!run && !insertText) return [];
      return [
        {
          id: spec.name,
          name: spec.name,
          label: $t(spec.label_key as TranslationKeys),
          description: $t(spec.description_key as TranslationKeys),
          insertText,
          run: run ?? undefined,
        },
      ];
    }),
  );

  let conversationSurfaceView = $derived({
    activeBranchId: activeConvId ? (activeBranchIds[activeConvId] ?? null) : null,
    activeConvId,
    activeTree: activeConvId ? convTrees[activeConvId] : undefined,
    browserModeNotice,
    checkpointFlow: currentCheckpointFlow ?? null,
    checkpointLoadError: activeConvId ? (checkpointLoadErrors[activeConvId] ?? null) : null,
    config,
    currentStreamItems,
    currentStreamMessageId,
    debugMode: isDebugMode,
    taskUsagesByCheckpointId: activeConvId ? (taskUsagesByConversation[activeConvId] ?? {}) : {},
    fileChanges: currentFileChanges,
    followUpSuggestionsByMessageId,
    followTail: followStreamToBottom,
    isAwaitingStreamOutput: isCurrentAwaitingStreamOutput,
    isPaused: isCurrentStreamPaused,
    isStreaming: isCurrentStreaming,
    mainContentLoading,
    memoryRetrievalCanSkip: currentMemoryRetrievalCanSkip,
    memoryRetrievalStage: currentMemoryRetrievalStage,
    mermaidConfig,
    messages,
    newConversationLayout,
    newConversationGreeting,
    newConversationSuggestions,
    queuedMessages: activeConvId ? (queuedChatMessages[activeConvId] ?? []) : [],
    restoringSurface,
    shikiTheme,
    slashCommands,
    tailAnchorToken:
      streamCompletionTailAnchor?.convId === activeConvId ? streamCompletionTailAnchor.token : null,
    tauriAvailable,
    workspace,
    workspacePath,
    recentWorkspaces,
  });

  const conversationSurfaceActions = {
    cancelBottomScrollFromUser,
    cancelUserInput,
    clearQueuedMessages,
    commitEdit,
    configureModels: () => openSettings("providers"),
    finishStreamCompletionTailAnchor,
    handleMessagesScroll,
    markProgrammaticTailPin,
    pauseCurrentStream,
    pickWorkspace: pickNewConversationWorkspace,
    pickWslWorkspace: () => pickWslWorkspace(true),
    removeQueuedMessage,
    resumeCurrentStream,
    revertFileChange: handleRevertFileChange,
    reExecuteMessage: reExecuteMsg,
    sendMessage,
    sendSuggestedMessage,
    skipMemoryRetrieval: skipCurrentMemoryRetrieval,
    stopMessage,
    submitUserInput,
    switchBranch: switchBranchAt,
    selectWorkspace: switchNewConversationWorkspace,
  };

  // ─── Window Controls ─────────────────────────────────────────────────────────

  let windowFocusState = $state<WindowFocusState>({
    focused: true,
    composerFocusRequest: 0,
  });
  let windowFocused = $derived(windowFocusState.focused);
  let composerFocusRequest = $derived(windowFocusState.composerFocusRequest);

  function handleWindowFocusEvent(focused: boolean): void {
    windowFocusState = applyWindowFocusEvent(windowFocusState, focused);
  }

  onMount(() => {
    if (isDevInspectorWindow || standaloneDevPreview || isQuickChatSurface || isOnboardingSurface)
      return;

    let disposed = false;
    let unlistenDesktopActivated: (() => void) | undefined;
    let unlistenFocusChanged: (() => void) | undefined;
    const handleFocus = () => handleWindowFocusEvent(true);
    const handleBlur = () => handleWindowFocusEvent(false);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    void listen(DESKTOP_WINDOW_ACTIVATED_EVENT, () => handleWindowFocusEvent(true))
      .then((unlisten) => {
        if (disposed) unlisten();
        else unlistenDesktopActivated = unlisten;
      })
      .catch((error) => console.warn("Failed to track desktop window activation:", error));

    if (appWindow) {
      void appWindow
        .isFocused()
        .then((focused) => {
          if (!disposed) handleWindowFocusEvent(focused);
        })
        .catch((error) => console.warn("Failed to read window focus state:", error));
      void appWindow
        .onFocusChanged(({ payload: focused }) => {
          if (!disposed) handleWindowFocusEvent(focused);
        })
        .then((unlisten) => {
          if (disposed) unlisten();
          else unlistenFocusChanged = unlisten;
        })
        .catch((error) => console.warn("Failed to track window focus state:", error));
    } else {
      handleWindowFocusEvent(document.hasFocus());
    }

    return () => {
      disposed = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      unlistenDesktopActivated?.();
      unlistenFocusChanged?.();
    };
  });

  const winMinimize = () => appWindow?.minimize();
  const winMaximize = () => appWindow?.toggleMaximize();
  const winClose = () => (launchContext?.workspace ? appWindow?.close() : appWindow?.hide());
  const quitApp = () => void invoke("quit_app");

  // Keep the webview's built-in context menu available while developing, but
  // do not expose browser actions (such as inspect/copy navigation) in builds.
  function handleContextMenu(event: MouseEvent) {
    if (!isDebugBuild) event.preventDefault();
  }

  onMount(() => {
    return () => {
      void disposeQuickChatShortcut();
    };
  });
</script>

<svelte:window oncontextmenu={handleContextMenu} />

<TooltipPrimitive.Provider delayDuration={500} skipDelayDuration={300}>
  {#if isDevInspectorWindow && DevInspector}
    <DevInspector />
  {:else if standaloneDevPreview}
    <StandaloneDevPreview preview={standaloneDevPreview} />
  {:else if isOnboardingSurface}
    {#if config}
      <OnboardingFlow
        config={onboardingResourcePreview ? { ...config, onboarding_completed: true } : config}
        embeddingPreviewState={onboardingResourcePreview === "downloading"
          ? "downloading"
          : "ready"}
        {workspacePath}
        onSave={saveSettings}
        onPickWorkspace={pickOnboardingWorkspace}
        onComplete={completeOnboarding}
        onThemePreview={applyTheme}
      />
    {:else}
      <div class="onboarding-loading">
        <LoadingSkeleton variant="new-conversation" label={$t("loadingContent")} />
      </div>
    {/if}
  {:else if isQuickChatSurface}
    <QuickChatSurface preview={isQuickChatPreview} />
  {:else}
    <div class="app" aria-busy={workspaceLoading} inert={workspaceLoading}>
      <!-- ─── Sidebar ─────────────────────────────────────────────────────────────── -->
      <DesktopSidebar
        roles={agentRoles}
        {selectedRoleKey}
        {canGoBack}
        {canGoForward}
        {workspacePath}
        {workspaceSwitchTarget}
        {recentWorkspaces}
        {pinnedProjectPaths}
        searchQuery={conversationSearchQuery}
        conversations={sidebarConversations}
        {recentConversations}
        activeConversationId={activeConvId}
        streamingConversationIds={chatStreams.streamingConversationIds}
        hasMore={sidebarHasMoreConversations}
        loadingMore={sidebarLoadingMoreConversations}
        {loadingRecentConversations}
        loading={initialLoading}
        onRoleChange={changeConversationRole}
        onBack={() => navigateHistory(-1)}
        onForward={() => navigateHistory(1)}
        onNew={newConversation}
        onNewProjectConversation={switchNewConversationWorkspace}
        onLoadProjectConversations={loadProjectConversations}
        onSearch={handleConversationSearch}
        onLoadMore={loadNextConversationPage}
        onSelect={(id) => {
          if (settingsOpen) closeSettings();
          return selectSidebarConversation(id);
        }}
        onTogglePin={togglePin}
        onDelete={deleteConversation}
        onOpenConversation={openSidebarConversation}
        onSelectWorkspace={requestWorkspace}
        onToggleProjectPin={toggleProjectPin}
        onOpenProjectFolder={openProjectFolder}
        onRemoveProject={removeProject}
        {windowFocused}
      />

      <!-- ─── Feature panels ─────────────────────────────────────────────────── -->
      <DesktopTitleBar
        {workspacePath}
        {recentWorkspaces}
        roles={agentRoles}
        {selectedRoleKey}
        {tauriAvailable}
        memorySyncing={isMemorySyncing}
        conversationDetailsAvailable={Boolean(
          (currentCheckpointFlow || currentFileChanges.length > 0) && !settingsOpen,
        )}
        {checkpointFlowPanelCollapsed}
        onPickWorkspace={pickWorkspace}
        onPickWsl={pickWslWorkspace}
        onSelectWorkspace={requestWorkspace}
        onNewConversation={newConversation}
        onNewWindow={createNewWindow}
        onOpenSettings={() => openSettings()}
        onCreateRole={() => void openRoleEditor(null)}
        onConfigureRole={(role) => void openRoleEditor(role)}
        onOpenAbout={() => openSettings("about")}
        onQuit={quitApp}
        onToggleCheckpointFlowPanel={() =>
          (checkpointFlowPanelCollapsed = !checkpointFlowPanelCollapsed)}
        onMinimize={winMinimize}
        onMaximize={winMaximize}
        onClose={winClose}
        {windowFocused}
      />

      <div class="main">
        <ConversationSurface
          view={conversationSurfaceView}
          actions={conversationSurfaceActions}
          {composerPreferences}
          bind:messagesElement={messagesEl}
          bind:inputAreaHeight
          bind:checkpointFlowPanelCollapsed
          composerDraft={activeComposerDraft}
          focusRequest={composerFocusRequest}
        />
      </div>
    </div>

    <Dialog.Root
      open={settingsOpen}
      onOpenChange={(open) => {
        if (open) settingsOpen = true;
        else closeSettings();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="settings-dialog-overlay" />
        <Dialog.Content class="settings-dialog" aria-label={$t("settingsTitle")}>
          <header class="settings-dialog-header">
            <Dialog.Title class="settings-dialog-title">{$t("settingsTitle")}</Dialog.Title>
            <Dialog.Close class="settings-dialog-close" aria-label={$t("close")}>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </Dialog.Close>
          </header>
          <div class="settings-dialog-body">
            {#if SettingsView}
              <SettingsView
                {config}
                {workspacePath}
                initialNav={settingsInitialNav}
                onSave={saveSettings}
                onOpenConversation={openHookConversation}
                onThemePreview={applyTheme}
              />
            {/if}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>

    <RoleEditorDialog
      bind:open={roleEditorOpen}
      role={roleEditorRole}
      skills={roleEditorSkills}
      mcpServers={config?.mcp.servers ?? []}
      loadingResources={roleEditorResourcesLoading}
      saving={roleEditorSaving}
      onSave={saveRoleEditor}
      onDelete={deleteRoleEditor}
    />
  {/if}

  <Toast />
</TooltipPrimitive.Provider>

<WorkspaceDialogs
  bind:wslPickerOpen
  {wslPickerBusy}
  bind:wslPickerError
  {wslDistributions}
  bind:wslDistribution
  bind:wslLinuxPath
  onSelectDistribution={selectWslDistribution}
  onBrowseWsl={browseWslWorkspace}
  onOpenWsl={openSelectedWslWorkspace}
/>

<style>
  .onboarding-loading {
    display: grid;
    height: 100vh;
    place-items: center;
    box-sizing: border-box;
    padding: 48px;
    background: var(--bg);
  }

  .onboarding-loading :global(.skeleton) {
    width: min(560px, 100%);
  }

  .app {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: transparent;
  }

  /* ─── Sidebar ─────────────────────────────────────────────────────────────── */

  /* ─── Main ─────────────────────────────────────────────────────────────────── */

  .main {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global(.settings-dialog-overlay) {
    position: fixed;
    inset: 0;
    z-index: 900;
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(5px);
  }

  :global(.settings-dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 901;
    width: min(1080px, calc(100vw - 48px));
    height: min(760px, calc(100vh - 48px));
    display: flex;
    flex-direction: column;
    transform: translate(-50%, -50%);
    overflow: hidden;
    border: 1px solid var(--mica-border);
    border-radius: 8px;
    background: var(--floating-surface);
    box-shadow: var(--raised-shadow);
    color: var(--text);
    outline: none;
    -webkit-backdrop-filter: blur(24px) saturate(1.5);
    backdrop-filter: blur(24px) saturate(1.5);
  }

  :global(.settings-dialog-title) {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  .settings-dialog-header {
    height: 40px;
    flex: 0 0 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px 0 16px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--mica-divider);
  }

  .settings-dialog-body {
    min-height: 0;
    flex: 1;
    display: flex;
  }

  :global(.settings-dialog-close) {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    outline: none;
  }

  :global(.settings-dialog-close:hover),
  :global(.settings-dialog-close:focus-visible) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.settings-dialog-close:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.settings-dialog-close svg) {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
</style>
