<!-- eslint-disable max-lines -- runtime controller is isolated from the route composition root. -->
<script lang="ts">
  /* eslint-disable max-lines */
  import { isTauri } from "@tauri-apps/api/core";
  import { homeDir } from "@tauri-apps/api/path";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { onMount, tick, untrack } from "svelte";
  import type { Component } from "svelte";
  import { detectWindowPlatform } from "$lib/windowPlatform";
  import { createWindowMaximizer } from "$lib/windowMaximizer";

  // Lazy-loaded feature views expose different prop contracts; each render site
  // below remains checked against the concrete component after loading.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type LazyViewComponent = Component<any>;

  import Toast from "$lib/components/Toast.svelte";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import SettingsWindowSkeleton from "$lib/components/SettingsWindowSkeleton.svelte";
  import { frontendActivationShouldShowNotice } from "$lib/frontendActivation";
  import { AgentCompletionNotifier } from "$lib/agentCompletionNotification";
  import { chatTaskUsagesByCheckpoint } from "$lib/cacheUsage";
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import { normalizeConfigShape } from "$lib/config";
  import { applyDocumentTheme, createNativeThemeSynchronizer, type AppTheme } from "$lib/appTheme";
  import { ComposerPreferences } from "$lib/composerPreferences.svelte";
  import {
    ComposerDraftStore,
    conversationComposerDraftKey,
    newConversationComposerDraftKey,
  } from "$lib/composerDrafts";
  import { installPageEvents } from "$lib/page/events";
  import { createWorkspaceNavigation } from "$lib/page/workspaceNavigation";
  import { createCheckpointController } from "$lib/page/checkpoints";
  import { restorePendingUserInputFromCheckpoint } from "$lib/page/pendingInputProjection";
  import { createPageStartup } from "$lib/page/startup";
  import { createWslPicker } from "$lib/page/wslPicker.svelte";
  import { createConversationLists } from "$lib/page/conversationLists.svelte";
  import { mergeConversationMetadata } from "$lib/page/conversationMetadata";
  import { createRoleController, DEFAULT_ROLE_KEY } from "$lib/page/roles.svelte";
  import { ChatStreamState } from "$lib/chatStreamState.svelte";
  import {
    InterruptResolutionTracker,
    InterruptTerminalHandoff,
  } from "$lib/interruptResolutionTracker";
  import { resolveRuntimeQuery } from "$lib/runtimeQuery";
  import {
    addWorkspaceToPersistedOrder,
    parsePinnedProjectPaths,
    pinnedProjectsStorageKey,
    promoteRecentConversation,
    togglePinnedProjectPath,
  } from "$lib/sidebarProjects";
  import { t, tr, locale, initI18n, setLocale, type Locale, type TranslationKeys } from "$lib/i18n";
  import { pluginCommandText } from "$lib/pluginI18n";
  import { LatestRequest } from "$lib/latestRequest";
  import { showToast } from "$lib/toast";
  import { ensureCuaDriverServer, isCuaDriverEnabled } from "$lib/cuaDriver";
  import { hydrateCuaDriverEndpoint, startCuaDriverDaemon } from "$lib/openagent/cuaDriverHost";
  import { decodeModelBinding } from "$lib/modelBinding";
  import { DEFAULT_QUICK_CHAT_SHORTCUT, normalizeQuickChatShortcut } from "$lib/quickChatShortcut";
  import { disposeQuickChatShortcut, replaceQuickChatShortcut } from "$lib/quickChatWindow";
  import { desktopOpenAgent as openAgent, emit, invoke, listen } from "$lib/openagent/tauriClient";
  import type { AgentCommandSpec, ChatRunStartedEvent } from "$lib/openagent";
  import {
    DEV_MAIN_DEBUG_VISIBILITY_EVENT,
    readMainDebugComponentsVisible,
    writeMainDebugComponentsVisible,
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
  import type { SlashCommand } from "$lib/composer/types";
  import QuickChatSurface from "$lib/components/QuickChatSurface.svelte";
  import RoleEditorWindowSurface from "$lib/components/RoleEditorWindowSurface.svelte";
  let StandaloneDevPreview = $state<
    typeof import("$lib/components/StandaloneDevPreview.svelte").default | null
  >(null);
  import WorkspaceDialogs from "$lib/components/WorkspaceDialogs.svelte";
  import DesktopSidebar from "$lib/components/DesktopSidebar.svelte";
  import FullscreenSurface from "$lib/components/FullscreenSurface.svelte";
  import RoleEditorDialog from "$lib/components/RoleEditorDialog.svelte";
  import DesktopTitleBar from "$lib/components/DesktopTitleBar.svelte";
  import ConversationSurface from "$lib/components/ConversationSurface.svelte";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import {
    conversationDetailsAvailable,
    checkpointFlowPanelKey,
    type LiveCheckpointFlowProjection,
  } from "$lib/checkpointFlow";
  import {
    loadCheckpointFlowPanelCollapsed,
    loadConversationPanelCollapsed,
    saveCheckpointFlowPanelCollapsed,
    saveConversationPanelCollapsed,
  } from "$lib/checkpointFlowPanelSizing";
  import {
    conversationBranchScopeKey,
    effectiveRightSidebarCollapsed,
    RightSidebarScopeStore,
  } from "$lib/sidebarPanelScope";
  import { terminalHistory } from "$lib/terminalHistory";
  import type { RightSidebarPanel } from "$lib/rightSidebar";
  import {
    availablePluginSidebarViews,
    firstAvailablePluginSidebarPanel,
    pluginSidebarEntries,
    pluginSidebarRevision as pluginSidebarRevisionOf,
  } from "$lib/pluginSidebar";
  import { renderMermaidToolResult } from "$lib/streamdown/mermaidRenderer";
  import {
    ROOT_KEY,
    computeActivePath,
    getActiveTipNode,
    findForkParentCheckpointId,
    ckIdsAlongActivePath,
    attachNewTurn,
    findUserMessageIndexForAssistant,
    reconcileTerminalAssistantMessage,
    terminalEventMatchesActiveStream,
    type ConvTree,
  } from "$lib/checkpointTree";
  import {
    applyWindowFocusEvent,
    DESKTOP_WINDOW_ACTIVATED_EVENT,
    type WindowFocusState,
  } from "$lib/windowFocus";
  import {
    appendUserInput,
    clearCompactionProgress,
    initializeStreamItems,
    collapseStreamText,
    resolveUserInput,
  } from "$lib/chatStream";
  import {
    fetchChildConversations,
    fetchConversationMeta,
    fetchConversationPage,
    fetchRenderableCheckpoints,
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
  import {
    parseSettingsDestination,
    settingsSurfaceKey,
    settingsWindowSection,
    settingsWindowSections,
    settingsWindowTitles,
    type SettingsNav,
    type SettingsWindowKind,
  } from "$lib/settingsWindows";
  import {
    coalesceAgentPluginUpdateCheck,
    shouldNotifyAgentPluginUpdates,
  } from "$lib/agentPluginUpdateCheck";
  import type {
    ChatMessage,
    Conversation,
    WorkspaceContext,
    AppConfig,
    StreamItem,
    FileChange,
    RecentWorkspace,
    UserInputRequest,
    ChatAttachment,
    StartupBootstrap,
    StartupConversationBundle,
    UserMessageContext,
    CheckpointTurnStatus,
    TaskTokenUsage,
    AgentPluginSummary,
  } from "$lib/types";

  const {
    frontendActivationVersion,
    isDevInspectorWindow,
    isOnboardingPreview,
    onboardingResourcePreview,
    isQuickChatPreview,
    standaloneDevPreview,
    isChannelsSettingsPreview,
    isAgentsSettingsPreview,
    isMcpSettingsPreview,
    settingsPreviewSection,
    isRoleEditorWindow,
    settingsWindowKind,
    settingsWindowInitialSection,
    isSettingsWindow,
    isOnboardingSurface,
    isQuickChatSurface,
    onboardingPreviewTheme,
    onboardingPreviewLocale,
    channelsSettingsPreviewTheme,
    channelsSettingsPreviewLocale,
    agentsSettingsPreviewTheme,
    agentsSettingsPreviewLocale,
    mcpSettingsPreviewTheme,
    mcpSettingsPreviewLocale,
  } = resolveRuntimeQuery(
    typeof window === "undefined" ? null : window.location.search,
    import.meta.env.DEV,
  );
  const isDebugBuild = import.meta.env.DEV;
  let showMainDebugComponents = $state(readMainDebugComponentsVisible(import.meta.env.DEV));
  let isDebugMode = $derived(showMainDebugComponents);

  function toggleMainDebugMode(): void {
    showMainDebugComponents = !showMainDebugComponents;
    writeMainDebugComponentsVisible(showMainDebugComponents);
    void emit(DEV_MAIN_DEBUG_VISIBILITY_EVENT, { visible: showMainDebugComponents }).catch(
      (error) => console.warn("Failed to broadcast debug mode change:", error),
    );
  }
  let DevInspector = $state<Component | null>(null);

  if (import.meta.env.DEV && isDevInspectorWindow) {
    void import("$lib/components/DevInspector.svelte").then((module) => {
      DevInspector = module.default;
    });
  }

  // ─── State ────────────────────────────────────────────────────────────────────
  const startupRestoreHint = readStartupRestoreHint();
  let conversations = $state<Conversation[]>([]);
  let activeConvId = $state<string | null>(startupRestoreHint?.conversationId ?? null);
  const defaultRoleKey = DEFAULT_ROLE_KEY;
  const roleController = createRoleController({
    get available() {
      return tauriAvailable;
    },
    client: openAgent,
    get workspacePath() {
      return workspacePath;
    },
    activateNewConversation: (roleKey) => activateNewConversationSurface(roleKey),
  });
  const {
    roleSelectionStorageKey,
    storedRoleSelection,
    loadAvailableRoles,
    loadAvailableRolesForWorkspace,
    openRoleEditor,
    saveRoleEditor,
    deleteRoleEditor,
    changeConversationRole,
  } = roleController;
  const conversationLists = createConversationLists({
    get available() {
      return tauriAvailable;
    },
    get workspacePath() {
      return workspacePath;
    },
    get selectedRoleKey() {
      return roleController.selectedRoleKey;
    },
    get selectedRoleId() {
      return roleController.selectedRoleId;
    },
    get conversations() {
      return conversations;
    },
    set conversations(value) {
      conversations = value;
    },
  });
  const {
    reloadRoleConversations,
    ensureConversationLineage,
    loadNextConversationPage,
    refreshRecentConversations,
    loadProjectConversations,
    handleConversationSearch,
  } = conversationLists;
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
  let sidebarConversations = $derived.by(() => {
    if (conversationLists.conversationSearchQuery.trim())
      return conversationLists.searchConversations;
    const source = conversations;
    const byId = new Map(source.map((conversation) => [conversation.id, conversation]));
    return source.filter((conversation) => {
      const visited = new Set<string>();
      let current: Conversation | undefined = conversation;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (current.roleId === roleController.selectedRoleKey) return true;
        if (!current.parentConvId) {
          return !current.roleId && roleController.selectedRoleKey === defaultRoleKey;
        }
        current = byId.get(current.parentConvId);
      }
      return false;
    });
  });
  let sidebarHasMoreConversations = $derived(
    conversationLists.conversationSearchQuery.trim()
      ? conversationLists.searchConversationNextCursor !== null
      : conversationLists.conversationNextCursor !== null,
  );
  let sidebarLoadingMoreConversations = $derived(
    conversationLists.conversationSearchQuery.trim()
      ? conversationLists.loadingMoreSearchConversations
      : conversationLists.loadingMoreConversations,
  );
  // Per-conversation transient stream state is owned independently from the
  // durable conversation/checkpoint projection.
  const chatStreams = new ChatStreamState();
  // Checkpoint IDs from chat-checkpoint events, pending assignment to assistant messages
  let pendingCheckpointIds = $state<Record<string, string>>({});
  // A checkpoint event is emitted only after its durable snapshot exists. Keep
  // the package projection current without hydrating partial transcript
  // records. Refreshes are scoped to the same conversation-plus-branch key as
  // live package projections, so a sibling event cannot clear this overlay.
  const liveCheckpointRefreshVersions = new Map<string, number>();
  // Incremented when the user starts selecting a different branch. An in-flight
  // refresh then cannot select the old event's tip after the switch completes.
  const branchSelectionVersions = new Map<string, number>();
  const pendingExternalUserRecoveries = new Set<string>();
  // Package tools may update the canonical in-memory checkpoint before that
  // snapshot becomes durable. Render their complete event projection until the
  // matching persisted checkpoint has been reconciled. Live package
  // projections are branch-owned. A conversation can have
  // sibling runs in flight, so a conversation-only key would let an event
  // from one branch replace the status shown for another branch.
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
  // Resume commands for one interrupted turn must be serialized. The runtime
  // also serializes them, but keeping the queue here prevents intermediate
  // checkpoint events from rebuilding the visible transcript between clicks.
  const approvalResumeQueues = new Map<string, Promise<void>>();
  const deferredApprovalCheckpointIds = new Map<
    string,
    { checkpointId: string; branchId: string | null }
  >();
  // A live approval may be clicked before its run has emitted the terminal
  // interruption event. Resume only after that event has finalized the turn.
  const interruptTerminalHandoffs = new InterruptTerminalHandoff();
  // A restored render_mermaid request must be answered once even if its
  // original frontend event was emitted while the transcript was mounting.
  const handledMermaidInterrupts = new Set<string>();
  // Height of the input-area for dynamic message padding
  let inputAreaHeight = $state(120);
  // The user's explicit choice, written only by the title-bar toggle. It is the
  // starting state for this session and the default for a conversation branch
  // the session has not visited yet; each visited scope then remembers its own.
  const rightSidebarPreferenceDefault =
    typeof window === "undefined" ? true : loadCheckpointFlowPanelCollapsed(window.localStorage);
  let rightSidebarPreference = $state(rightSidebarPreferenceDefault);
  // What the user (or an automatic open) asked for. The panel the desktop
  // renders projects this against availability, so a branch whose last view
  // empties collapses without anything having to write state again.
  let rightSidebarCollapseRequested = $state(rightSidebarPreferenceDefault);
  let conversationPanelCollapsed = $state(
    typeof window === "undefined" ? false : loadConversationPanelCollapsed(window.localStorage),
  );
  let rightSidebarPanel = $state<RightSidebarPanel>("status");
  let terminalSummary = $state({ scopeKey: "", sessionCount: 0 });
  let historicalTerminalSessions = $derived.by(() =>
    terminalHistory(messages, currentStreamItems, activeConvId, rightSidebarBranchId),
  );
  let terminalSessionCount = $derived.by(() =>
    Math.max(
      historicalTerminalSessions.length,
      terminalSummary.scopeKey === rightSidebarScopeKey ? terminalSummary.sessionCount : 0,
    ),
  );
  let checkpointFlowPanelSelectionKey = $state<string | null>(null);
  let checkpointFlowPanelAutoOpenKey = $state<string | null>(null);
  let fileChangesPanelSelectionKey = $state<string | null>(null);
  let workspace = $state<WorkspaceContext | null>(null);
  let agentPlugins = $state<AgentPluginSummary[]>([]);
  let config = $state<AppConfig | null>(null);
  const settingsRequests = new LatestRequest();
  let isMemorySyncing = $state(false);
  type SettingsSurfaceDestination = {
    kind: SettingsWindowKind;
    section: SettingsNav;
    /** Development previews render every section instead of one domain. */
    everySection: boolean;
  };
  let settingsSurface = $state<SettingsSurfaceDestination | null>(null);
  const settingsOpen = $derived(settingsSurface !== null);
  const settingsSurfaceSections = $derived(
    settingsSurface === null || settingsSurface.everySection
      ? undefined
      : settingsWindowSections[settingsSurface.kind],
  );
  let navigationHistory = $state<AppNavigationHistory>(createNavigationHistory());
  let navigationTransitioning = $state(false);
  let navigationCaptureDepth = $state(0);
  let SettingsView = $state<LazyViewComponent | null>(null);
  let SettingsWindowSurface = $state<LazyViewComponent | null>(null);
  let workspacePath = $state("");
  let recentWorkspaces = $state<RecentWorkspace[]>([]);
  let pinnedProjectPaths = $state(
    typeof window === "undefined"
      ? []
      : parsePinnedProjectPaths(window.localStorage.getItem(pinnedProjectsStorageKey)),
  );
  const wslPicker = createWslPicker({
    get available() {
      return tauriAvailable;
    },
    get browserModeNotice() {
      return browserModeNotice;
    },
    switchNewConversationWorkspace: (path) => switchNewConversationWorkspace(path),
    requestWorkspace: (path) => requestWorkspace(path),
  });
  const { selectWslDistribution, pickWslWorkspace, browseWslWorkspace, openSelectedWslWorkspace } =
    wslPicker;
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
  let liveContextUsageByConversation = $state<Record<string, TaskTokenUsage>>({});
  const taskUsageRefreshVersions = new Map<string, number>();
  const taskUsageRefreshTimers = new Map<string, ReturnType<typeof setInterval>>();
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
  // The transcript viewport is shared by conversations, but whether a stream
  // should pin it to the tail belongs to the conversation being viewed. Keep
  // this state keyed so switching away from one streaming conversation cannot
  // make another conversation inherit its follow behavior.
  let followStreamToBottomByConversation = $state<Record<string, boolean>>({});
  let followStreamToBottom = $derived(
    activeConvId ? (followStreamToBottomByConversation[activeConvId] ?? true) : true,
  );
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
      const taskUsages = await openAgent.invokeProduct("get_chat_task_usages", { convId });
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

  function startTaskUsageRefreshWhileStreaming(convId: string): void {
    if (taskUsageRefreshTimers.has(convId)) return;
    const timer = setInterval(() => {
      if (!chatStreams.streamingConversationIds[convId]) {
        clearInterval(timer);
        taskUsageRefreshTimers.delete(convId);
        return;
      }
      void refreshTaskUsagesForConversation(convId);
    }, 750);
    taskUsageRefreshTimers.set(convId, timer);
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
  const windowMaximizer = appWindow ? createWindowMaximizer(appWindow) : null;
  const completionWindowActivity = tauriAvailable
    ? { isFocused: () => invoke<boolean>("is_desktop_window_active") }
    : null;
  const agentCompletionNotifier = new AgentCompletionNotifier();
  let themeSyncGeneration = 0;
  let themeSyncInFlight = false;
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
      mcp_server_category: { enabled: true, prompt: "" },
      suggestions: { enabled: true, prompt: "" },
      hook: { enabled: true, prompt: "" },
      tool_approval: { enabled: false, prompt: "" },
    },
    automation_hooks: [],
    approval_mode: "off",
    mcp: { servers: [] },
    theme: "system",
    language: "zh",
    agent_turn_limit_enabled: false,
    agent_max_turns: 10,
    context_compaction_enabled: true,
    context_compaction_threshold: 200000,
    context_compaction_prompt: "",
    context_compaction_recent_message_count: 5,
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
      : newConversationComposerDraftKey(workspacePath, roleController.selectedRoleKey),
  );
  let activeComposerDraft = $state(composerDrafts.activate(selectedComposerDraftKey));

  function composerDraftKey(conversationId = activeConvId): string {
    return conversationId
      ? conversationComposerDraftKey(conversationId)
      : newConversationComposerDraftKey(workspacePath, roleController.selectedRoleKey);
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
    setConfig: (next) => {
      settingsRequests.invalidate();
      config = next;
    },
    loadSettings,
    saveSettings,
    tauriAvailable,
  });
  // Keep pending submissions scoped to their conversation so switching chats while
  // a response is streaming never sends a message to the wrong conversation.
  let queuedChatMessages = $state<Record<string, QueuedChatMessage[]>>({});

  async function syncChatQueuePending(convId: string) {
    if (!tauriAvailable) return;
    await openAgent
      .invokeProduct("set_chat_queue_pending", {
        convId,
        pending: (queuedChatMessages[convId]?.length ?? 0) > 0,
      })
      .catch(() => {});
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
    roleKey: roleController.selectedRoleKey,
    settingsDestination: settingsSurfaceKey(settingsSurface),
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
  let currentCheckpointFlowScopeKey = $derived(
    conversationBranchScopeKey(
      activeConvId,
      activeConvId ? (activeBranchIds[activeConvId] ?? null) : null,
    ),
  );
  let currentCheckpointFlow = $derived(
    activeConvId
      ? (liveCheckpointFlowProjections[currentCheckpointFlowScopeKey]?.flow ??
          currentCheckpointFlowNode?.flow)
      : undefined,
  );
  // A plugin panel is the last resort when the scope has no built-in detail
  // surface, so recovery does not leave an empty status surface open.
  $effect(() => {
    if (rightSidebarCollapseRequested || rightSidebarPanel !== "status") return;
    if (currentCheckpointFlow || currentFileChanges.length > 0 || terminalSessionCount > 0) return;
    const pluginPanel = firstAvailablePluginSidebarPanel(pluginSidebarRegistry);
    if (pluginPanel) rightSidebarPanel = pluginPanel;
  });
  $effect(() => {
    const key = checkpointFlowPanelKey(
      activeConvId,
      activeConvId ? (activeBranchIds[activeConvId] ?? null) : null,
      currentCheckpointFlow,
    );
    if (key === checkpointFlowPanelSelectionKey) return;
    checkpointFlowPanelSelectionKey = key;
    if (key === checkpointFlowPanelAutoOpenKey) {
      rightSidebarPanel = "status";
      rightSidebarCollapseRequested = false;
      checkpointFlowPanelAutoOpenKey = null;
    }
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
  // Plugin sidebar views resolve through one lifecycle registry instead of an
  // inline filter, so a disabled, broken, or out-of-scope view is never mounted
  // and the management surface reports the same reason the sidebar hides.
  let pluginSidebarContext = $derived({
    hasWorkspace: workspacePath.trim().length > 0,
    hasConversation: activeConvId !== null,
  });
  let pluginSidebarRegistry = $derived(
    pluginSidebarEntries(agentPlugins, pluginSidebarContext, $locale),
  );
  let pluginSidebarViews = $derived(availablePluginSidebarViews(pluginSidebarRegistry));
  let pluginSidebarRevision = $derived(pluginSidebarRevisionOf(pluginSidebarRegistry));
  let rightSidebarAvailable = $derived(
    conversationDetailsAvailable(currentCheckpointFlow, currentFileChanges.length) ||
      terminalSessionCount > 0 ||
      pluginSidebarViews.length > 0,
  );
  // The one value the title bar and the sidebar render. Deriving it keeps the
  // "no views, no panel" invariant true at every moment, including the flush
  // in which a scope switch restores the incoming scope's request.
  let checkpointFlowPanelCollapsed = $derived(
    effectiveRightSidebarCollapsed(
      conversationPanelCollapsed ? false : rightSidebarCollapseRequested,
      rightSidebarAvailable,
    ),
  );

  // Every right-sidebar view is scoped to the active conversation branch. The
  // optimistic branch selection leads the durable branch tip (the same value
  // used to send messages), so the sidebar follows it rather than the
  // transcript's fetched tip, which lags behind a fork.
  let rightSidebarConversationId = $derived(activeConvId);
  let rightSidebarBranchId = $derived(
    activeConvId ? (activeBranchIds[activeConvId] ?? null) : null,
  );
  let rightSidebarScopeKey = $derived(
    conversationBranchScopeKey(rightSidebarConversationId, rightSidebarBranchId),
  );
  const rightSidebarScopes = new RightSidebarScopeStore();
  let currentRightSidebarScopeKey = $state<string | null>(null);

  $effect(() => {
    const scopeKey = rightSidebarScopeKey;
    if (scopeKey === currentRightSidebarScopeKey) return;
    const previousScopeKey = currentRightSidebarScopeKey;
    currentRightSidebarScopeKey = scopeKey;
    // The first scope keeps the persisted default instead of recording one.
    if (previousScopeKey === null) return;
    const restored = rightSidebarScopes.switchScope(
      previousScopeKey,
      { panel: rightSidebarPanel, collapsed: rightSidebarCollapseRequested },
      scopeKey,
      { panel: "status", collapsed: rightSidebarPreference },
    );
    rightSidebarPanel = restored.panel;
    rightSidebarCollapseRequested = restored.collapsed;
  });

  $effect(() => {
    const key = activeConvId && currentFileChanges.length > 0 ? rightSidebarScopeKey : null;
    if (key === fileChangesPanelSelectionKey) return;
    fileChangesPanelSelectionKey = key;
    if (!currentCheckpointFlow && key) {
      rightSidebarPanel = "files";
      rightSidebarCollapseRequested = false;
    }
  });

  const checkpoints = createCheckpointController({
    findConversationLocation,
    get tauriAvailable() {
      return tauriAvailable;
    },
    get activeConvId() {
      return activeConvId;
    },
    get conversations() {
      return conversations;
    },
    set conversations(next) {
      conversations = next;
    },
    get chatStreams() {
      return chatStreams;
    },
    get pendingForkUserMessageIds() {
      return pendingForkUserMessageIds;
    },
    get convTrees() {
      return convTrees;
    },
    set convTrees(next) {
      convTrees = next;
    },
    get loadingConversationIds() {
      return loadingConversationIds;
    },
    set loadingConversationIds(next) {
      loadingConversationIds = next;
    },
    get checkpointLoadErrors() {
      return checkpointLoadErrors;
    },
    set checkpointLoadErrors(next) {
      checkpointLoadErrors = next;
    },
    get loadedConvIds() {
      return loadedConvIds;
    },
    get liveCheckpointRefreshVersions() {
      return liveCheckpointRefreshVersions;
    },
    get branchSelectionVersions() {
      return branchSelectionVersions;
    },
    get activeBranchIds() {
      return activeBranchIds;
    },
    set activeBranchIds(next) {
      activeBranchIds = next;
    },
    get liveCheckpointFlowProjections() {
      return liveCheckpointFlowProjections;
    },
    set liveCheckpointFlowProjections(next) {
      liveCheckpointFlowProjections = next;
    },
    get liveFileChangesPerConv() {
      return liveFileChangesPerConv;
    },
    set liveFileChangesPerConv(next) {
      liveFileChangesPerConv = next;
    },
    get fileChangesPerConv() {
      return fileChangesPerConv;
    },
    set fileChangesPerConv(next) {
      fileChangesPerConv = next;
    },
    get pendingUserInputs() {
      return pendingUserInputs;
    },
    set pendingUserInputs(next) {
      pendingUserInputs = next;
    },
    get checkpointFlowPanelAutoOpenKey() {
      return checkpointFlowPanelAutoOpenKey;
    },
    set checkpointFlowPanelAutoOpenKey(next) {
      checkpointFlowPanelAutoOpenKey = next;
    },
    get rightSidebarPanel() {
      return rightSidebarPanel;
    },
    set rightSidebarPanel(next) {
      rightSidebarPanel = next;
    },
    get rightSidebarCollapseRequested() {
      return rightSidebarCollapseRequested;
    },
    set rightSidebarCollapseRequested(next) {
      rightSidebarCollapseRequested = next;
    },
    mergeDurableFollowUpSuggestions,
    restoreMermaidRenderRequests,
    refreshTaskUsagesForConversation,
  });
  const loadMessagesForConv = checkpoints.loadMessagesForConv;
  const refreshLiveCheckpointTip = checkpoints.refreshLiveCheckpointTip;
  const applyLiveCheckpointFlow = checkpoints.applyLiveCheckpointFlow;
  const hydrateConversation = checkpoints.hydrateConversation;
  const syncAgentHistoryToActivePath = checkpoints.syncAgentHistoryToActivePath;
  const ensureActiveBranch = checkpoints.ensureActiveBranch;
  const loadFileChangesForConv = checkpoints.loadFileChangesForConv;
  const clearLiveFileChanges = checkpoints.clearLiveFileChanges;
  const reconcileLiveFileChanges = checkpoints.reconcileLiveFileChanges;

  function restoreMermaidRenderRequests(
    convId: string,
    checkpoint: Awaited<ReturnType<typeof fetchRenderableCheckpoints>>[number],
  ): void {
    if (!tauriAvailable || isDevInspectorWindow || checkpoint.data.phase !== "interrupted") return;
    const resolved = new Set(
      checkpoint.data.messages
        .filter((message) => message.role === "user")
        .flatMap((message) => message.content)
        .filter((content) => content.type === "tool_result")
        .map((content) => String(content.tool_use_id)),
    );
    for (const content of checkpoint.data.messages.flatMap((message) =>
      message.role === "assistant" ? message.content : [],
    )) {
      if (content.type !== "tool_use" || content.name !== "render_mermaid") continue;
      const requestId = String(content.id);
      if (resolved.has(requestId) || handledMermaidInterrupts.has(requestId)) continue;
      const input = content.input as { source?: unknown } | undefined;
      if (typeof input?.source !== "string" || !input.source.trim()) continue;
      handledMermaidInterrupts.add(requestId);
      const assistantMessageId = checkpoint.data.messages.find(
        (message) => message.role === "assistant",
      )?.id;
      if (!assistantMessageId) continue;
      void renderMermaidToolResult(input.source, mermaidConfig)
        .then(async (result) => {
          const response = JSON.stringify(result);
          // During durable restore there is usually no in-memory interrupt
          // channel yet. Submit first so the runtime queues the frontend
          // result; resuming then consumes it while advancing the checkpoint.
          await openAgent
            .submitInterruptResponse({ convId, interruptId: requestId, response })
            .catch(() => {
              // A restored checkpoint may not be present in the runtime's
              // in-memory snapshot map yet; resume below can still resolve it
              // from durable conversation memory.
            });
          await openAgent.resumeInterrupt({
            convId,
            interruptId: requestId,
            response,
            branchId: activeBranchIds[convId] ?? null,
            assistantMessageId,
          });
        })
        .catch((error) => {
          handledMermaidInterrupts.delete(requestId);
          console.warn(
            "Failed to restore Mermaid render result",
            error instanceof Error ? error.message : String(error),
          );
        });
    }
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
    const previous = approvalResumeQueues.get(convId) ?? Promise.resolve();
    const queued = previous
      .catch(() => {})
      .then(async () => {
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
      });
    approvalResumeQueues.set(convId, queued);
    queued
      .finally(() => {
        if (approvalResumeQueues.get(convId) !== queued) return;
        approvalResumeQueues.delete(convId);
        const checkpoint = deferredApprovalCheckpointIds.get(convId);
        deferredApprovalCheckpointIds.delete(convId);
        if (checkpoint) {
          void refreshLiveCheckpointTip(convId, checkpoint.checkpointId, checkpoint.branchId);
        }
      })
      .catch(() => {});
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
    // Complete snapshots stamp older user records with the selected tip while
    // Turn metadata keeps their assistant on its owning checkpoint. Pair by
    // transcript order instead of requiring those projected IDs to match.
    const userMsgIdx = findUserMessageIndexForAssistant(conv.messages, assistantMsgIdx);
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
          const path = await openAgent.invokeProduct("materialize_attachment_blob", {
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
        await openAgent.invokeProduct("rollback_to_checkpoint", { convId, checkpointId });
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
        await openAgent
          .invokeProduct("revert_file_change_keep", { changeId: change.id })
          .catch(() => {});
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
      openAgent
        .invokeProduct("set_active_conversation", {
          convId,
          workspace: workspacePath || "",
        })
        .catch(() => {});
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

    // Invalidate any checkpoint refresh that was started for the old selected
    // path before the branch switch performs its asynchronous file/runtime
    // work. The old event must not reselect its tip when that work completes.
    branchSelectionVersions.set(convId, (branchSelectionVersions.get(convId) ?? 0) + 1);

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
        await openAgent
          .invokeProduct("revert_file_change_keep", { changeId: change.id })
          .catch((e) => {
            console.warn("revert_file_change_keep failed", change.path, e);
          });
      }
      for (const change of toApply) {
        await openAgent
          .invokeProduct("apply_file_change_forward", { changeId: change.id })
          .catch((e) => {
            console.warn("apply_file_change_forward failed", change.path, e);
          });
      }

      // Restore the agent's in-memory history to the tip of the newly-active path
      // so the next message continues from where the user is now looking.
      await openAgent
        .invokeProduct("restore_agent_history", {
          convId,
          checkpointId: targetTipCheckpoint,
        })
        .catch((e) => console.warn("restore_agent_history failed", e));
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
      const tipMessage = [...computeActivePath(updatedTree)]
        .reverse()
        .find((message) => message.role === "assistant" && message.checkpointId);
      const tipCheckpoint = tipMessage
        ? checkpoints.find((item) => item.meta.checkpoint_id === tipMessage.checkpointId)
        : undefined;
      if (tipCheckpoint) restoreMermaidRenderRequests(convId, tipCheckpoint);
      branchMessages = pendingProjection.messages;
      if (pendingProjection.pendingRequest) {
        pendingUserInputs = {
          ...pendingUserInputs,
          [convId]: pendingProjection.pendingRequest,
        };
      }
    }
    const savedTip = getActiveTipNode(updatedTree)?.ckId;
    if (tauriAvailable && savedTip) {
      // Do not expose an approval card until its durable selected tip and
      // branch id are aligned. The resume command uses these values to reject
      // approvals aimed at a different branch.
      await openAgent.invokeProduct("set_active_branch_tip", { convId, checkpointId: savedTip });
      const branches = await openAgent.invokeProduct("get_branches", { convId }).catch(() => []);
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
    if (conversationRoleKey !== roleController.selectedRoleKey) return;
    conversationLists.recentConversations = promoteRecentConversation(
      conversationLists.recentConversations,
      conversation,
      workspacePath,
    );
  }

  async function applyConversationTitleUpdate(convId: string, title: string): Promise<void> {
    if (!title.trim()) return;
    const existing =
      conversations.find((conversation) => conversation.id === convId) ??
      conversationLists.recentConversations.find((conversation) => conversation.id === convId) ??
      conversationLists.searchConversations.find((conversation) => conversation.id === convId) ??
      (await fetchConversationMeta(convId).catch(() => null));
    if (!existing) return;

    const updated = { ...existing, title, updatedAt: Date.now() };
    conversations = conversations.map((conversation) =>
      conversation.id === convId
        ? { ...conversation, title: updated.title, updatedAt: updated.updatedAt }
        : conversation,
    );
    conversationLists.searchConversations = conversationLists.searchConversations.map(
      (conversation) =>
        conversation.id === convId
          ? { ...conversation, title: updated.title, updatedAt: updated.updatedAt }
          : conversation,
    );
    promoteConversationInRecents(updated);
  }

  async function selectSidebarConversation(id: string): Promise<void> {
    navigationCaptureDepth += 1;
    try {
      if (!conversations.some((conversation) => conversation.id === id)) {
        const meta = conversationLists.searchConversations.find(
          (conversation) => conversation.id === id,
        );
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

  /**
   * One Agent Plugin update check, shared with the settings surface and the
   * plugin-change listener. The check spends a GitHub quota shared with every
   * other client behind this machine's address, so concurrent triggers must not
   * each start a round.
   */
  function checkAgentPluginUpdates() {
    return coalesceAgentPluginUpdateCheck(() =>
      openAgent.invokeProduct("check_agent_plugin_updates", {}),
    );
  }

  onMount(() => {
    if (!tauriAvailable || isSettingsWindow || isDevInspectorWindow) return;
    let disposed = false;
    let failed = false;
    const load = async (notifyUpdates = true): Promise<void> => {
      try {
        const plugins = await openAgent.invokeProduct("list_agent_plugins", {});
        if (disposed) return;
        agentPlugins = plugins;
        const report = await checkAgentPluginUpdates();
        if (disposed) return;
        if (!notifyUpdates) return;
        const available = report.updates.filter((update) => update.update_available);
        if (!shouldNotifyAgentPluginUpdates(report.updates)) return;
        showToast({
          title: $t("pluginUpdateAvailable"),
          description: $t("pluginUpdateDescription").replace("{count}", String(available.length)),
          durationMs: 6000,
        });
      } catch (error) {
        failed = true;
        if (!disposed) console.warn("Failed to load Agent Plugins:", error);
      }
    };
    void load();
    // The Runtime may not be ready this early in startup, so a failed first
    // attempt gets one more chance. Retrying an attempt that succeeded would
    // spend quota on every launch for a result the first attempt already had.
    const retry = window.setTimeout(() => {
      if (failed) void load(false);
    }, 2000);
    return () => {
      disposed = true;
      window.clearTimeout(retry);
    };
  });

  onMount(() => {
    if (!tauriAvailable || detectWindowPlatform() !== "macos") return;
    document.documentElement.classList.add("macos-window");
    return () => document.documentElement.classList.remove("macos-window");
  });

  onMount(async () => {
    if (!isSettingsWindow) return;
    SettingsWindowSurface = (await import("$lib/components/SettingsWindowSurface.svelte")).default;
  });

  onMount(async () => {
    if (!standaloneDevPreview) return;
    StandaloneDevPreview = (await import("$lib/components/StandaloneDevPreview.svelte")).default;
  });

  onMount(() => {
    if (!tauriAvailable || !frontendActivationVersion) return;
    if (!frontendActivationShouldShowNotice(frontendActivationVersion)) return;
    showToast({
      title: $t("updateInstalled"),
      description: $t("updateComponentsInstalled"),
      durationMs: 5000,
    });
  });

  onMount(() => {
    if (
      isDevInspectorWindow ||
      standaloneDevPreview ||
      isOnboardingSurface ||
      isSettingsWindow ||
      isRoleEditorWindow
    )
      return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      // setTheme can make WebView's media query change before the persisted
      // config catches up. Ignore that internal transition; otherwise the
      // listener queues a stale system theme between an explicit selection's
      // WebView and native updates.
      if (themeSyncInFlight) return;
      if ((config?.theme ?? "system") === "system") applyTheme("system");
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  });

  const startup = createPageStartup({
    isDevInspectorWindow,
    standaloneDevPreview,
    isSettingsWindow,
    isRoleEditorWindow,
    isQuickChatSurface,
    isOnboardingSurface,
    tauriAvailable,
    isChannelsSettingsPreview,
    isAgentsSettingsPreview,
    isMcpSettingsPreview,
    get config() {
      return config;
    },
    get launchContext() {
      return launchContext;
    },
    get settingsPreviewSection() {
      return settingsPreviewSection;
    },
    get isDarkTheme() {
      return isDarkTheme;
    },
    set isDarkTheme(next) {
      isDarkTheme = next;
    },
    get initialLoading() {
      return initialLoading;
    },
    set initialLoading(next) {
      initialLoading = next;
    },
    get SettingsView() {
      return SettingsView;
    },
    set SettingsView(next) {
      SettingsView = next;
    },
    get settingsSurface() {
      return settingsSurface;
    },
    set settingsSurface(next) {
      settingsSurface = next;
    },
    get restoringSurface() {
      return restoringSurface;
    },
    set restoringSurface(next) {
      restoringSurface = next;
    },
    get activeConvId() {
      return activeConvId;
    },
    set activeConvId(next) {
      activeConvId = next;
    },
    loadSettings,
    loadWorkspace,
    applyStartupBootstrap,
    restoreStartupFallback,
    setupGlobalEventListeners,
    revealMemorySource,
    refreshAgentCommands,
    pollMemoryStatus,
  });
  onMount(() => {
    void startup.start();
  });

  // Data-only restore for a startup snapshot that never arrived. It re-reads
  // workspace and conversation state through the product API, so the shell
  // stays usable while the Runtime event projection is the only missing layer.
  async function restoreStartupFallback() {
    launchContext = (await openAgent
      .invokeProduct("get_workspace_launch_context", {})
      .catch(() => null)) as typeof launchContext;
    await loadSettings();
    if (launchContext?.workspace) workspacePath = launchContext.workspace;
    await loadWorkspace();
    roleController.selectedRoleKey = storedRoleSelection(workspacePath);
    await loadAvailableRoles();
    const page = await fetchConversationPage(
      workspacePath || null,
      null,
      30,
      null,
      true,
      roleController.selectedRoleId,
    );
    conversations = page.conversations;
    conversationLists.conversationNextCursor = page.nextCursor;
    await restoreWorkspaceConversation(workspacePath);
    void refreshRecentConversations();
  }

  // ─── Global event listeners (set up once, route by conv_id) ──────────────────

  async function applyStartupBootstrap(bootstrap: StartupBootstrap) {
    settingsRequests.invalidate();
    config = normalizeConfigShape(bootstrap.config);
    const cuaDriverEndpoint = await hydrateCuaDriverEndpoint();
    const configWithCuaDriver = ensureCuaDriverServer(config, cuaDriverEndpoint);
    // The reserved MCP entry is a client of the daemon the desktop host owns.
    // Start it first so the Runtime can connect the remaining MCP list.
    let cuaDriverDaemonStarted = false;
    if (
      isCuaDriverEnabled(configWithCuaDriver) &&
      configWithCuaDriver.agent_plugins_host_access?.["cua-driver"]
    ) {
      try {
        cuaDriverDaemonStarted = await startCuaDriverDaemon();
      } catch (error) {
        console.error("Failed to start the Cua Driver daemon during bootstrap:", error);
      }
    }
    if (configWithCuaDriver !== config || cuaDriverDaemonStarted) {
      // Runtime startup connects the persisted MCP list before this surface is
      // mounted, so persist the product-managed entry here: the first chat turn
      // can use Cua Driver without requiring a visit to Settings first, and a
      // Runtime that already failed to attach reconnects now that the daemon
      // accepts connections.
      await saveSettings(configWithCuaDriver, bootstrap.config, false);
    }
    applyTheme(config.theme ?? "system");
    await initI18n(config.language);
    workspacePath = bootstrap.workspace_path;
    newConversationSuggestions = normalizeSuggestions(bootstrap.new_conversation_suggestions);
    workspace = bootstrap.workspace;
    launchContext = bootstrap.launch_context;
    recentWorkspaces = config.recent_workspaces ?? [];
    conversations = bootstrap.conversations.map(metaToConversation);
    conversationLists.conversationNextCursor = bootstrap.conversation_next_cursor;
    activeConvId = bootstrap.active_conv_id;
    const activeMeta = activeConvId
      ? conversations.find((conversation) => conversation.id === activeConvId)
      : null;
    roleController.selectedRoleKey =
      activeMeta?.roleId ?? storedRoleSelection(bootstrap.workspace_path);
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
      // Bootstrap already contains the transcript, so load the existing
      // persisted usage projection explicitly for the restored composer.
      await tick();
      void refreshTaskUsagesForConversation(activeConvId);
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
    if (chatStreams.recoveredConversationIds[convId]) {
      const { [convId]: _recovered, ...rest } = chatStreams.recoveredConversationIds;
      chatStreams.recoveredConversationIds = rest;
    }
    const isSameRun =
      chatStreams.streamingConversationIds[convId] &&
      chatStreams.assistantMessageIds[convId] === assistantMessageId;
    if (!isSameRun) {
      // Runtime events use independent listeners. An ask_user event can reach
      // the local listener just before chat-run-started initializes the live
      // stream. Preserve that request so the form is not erased by startup.
      const pendingItems = initializeStreamItems(chatStreams.itemsByConversation[convId]);
      chatStreams.itemsByConversation = {
        ...chatStreams.itemsByConversation,
        [convId]: pendingItems,
      };
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
    // Usage is persisted on the preceding checkpoint. Refresh it when a new
    // stream starts so the composer can keep showing the latest known context
    // size while the next response is still in flight.
    void refreshTaskUsagesForConversation(convId);
    // Each provider request persists usage before the overall agent turn ends.
    // Poll the small usage projection so the composer reflects that result
    // while tools or subsequent model rounds are still streaming.
    startTaskUsageRefreshWhileStreaming(convId);
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
    const userMessage: ChatMessage | undefined =
      event.user_visible === false
        ? undefined
        : {
            id: event.msg_id,
            role: "user",
            content: event.message,
            timestamp: startedAt,
          };
    const insertUserMessage = () => {
      if (userMessage) insertExternalUserMessage(event.conv_id, userMessage, event.asst_msg_id);
    };
    const incoming: Conversation = {
      id: event.conv_id,
      title: event.title || $t("newConv"),
      messages: userMessage ? [userMessage] : [],
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
        flowStatus:
          event.flow_status ??
          (existing.flowStatus === "pending" ? "running" : existing.flowStatus),
        roleId: event.role_id ?? undefined,
        updatedAt: startedAt,
      };
      insertUserMessage();
    }
    promoteConversationInRecents(existingIndex === -1 ? incoming : conversations[existingIndex]);

    const eventRoleKey = event.role_id ?? defaultRoleKey;
    if (event.conv_id === activeConvId && eventRoleKey !== roleController.selectedRoleKey) {
      roleController.selectedRoleKey = eventRoleKey;
      window.localStorage.setItem(roleSelectionStorageKey(), eventRoleKey);
      void refreshRecentConversations();
    }
    startProjectedChatStream(event.conv_id, event.asst_msg_id, startedAt);

    if (event.is_new) {
      loadedConvIds.add(event.conv_id);
      return;
    }
    if (!loadedConvIds.has(event.conv_id)) {
      void loadMessagesForConv(event.conv_id, false).finally(insertUserMessage);
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
    chatStreams.recoveredConversationIds = {
      ...chatStreams.recoveredConversationIds,
      [convId]: true,
    };
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
    await installPageEvents({
      get tauriAvailable() {
        return tauriAvailable;
      },
      get isDevInspectorWindow() {
        return isDevInspectorWindow;
      },
      get config() {
        return config;
      },
      set config(next) {
        config = next;
      },
      get workspacePath() {
        return workspacePath;
      },
      set workspacePath(next) {
        workspacePath = next;
      },
      get agentPlugins() {
        return agentPlugins;
      },
      set agentPlugins(next) {
        agentPlugins = next;
      },
      get showMainDebugComponents() {
        return showMainDebugComponents;
      },
      set showMainDebugComponents(next) {
        showMainDebugComponents = next;
      },
      get newConversationSuggestions() {
        return newConversationSuggestions;
      },
      set newConversationSuggestions(next) {
        newConversationSuggestions = next;
      },
      get launchContext() {
        return launchContext;
      },
      get roleController() {
        return roleController;
      },
      get defaultRoleKey() {
        return defaultRoleKey;
      },
      get settingsRequests() {
        return settingsRequests;
      },
      get conversations() {
        return conversations;
      },
      set conversations(next) {
        conversations = next;
      },
      get loadedConvIds() {
        return loadedConvIds;
      },
      get chatStreams() {
        return chatStreams;
      },
      get compactionOnlyConvIds() {
        return compactionOnlyConvIds;
      },
      get compactionProgressRevisions() {
        return compactionProgressRevisions;
      },
      get activeConvId() {
        return activeConvId;
      },
      set activeConvId(next) {
        activeConvId = next;
      },
      get selectedComposerDraftKey() {
        return selectedComposerDraftKey;
      },
      set selectedComposerDraftKey(next) {
        selectedComposerDraftKey = next;
      },
      get composerDrafts() {
        return composerDrafts;
      },
      get activeComposerDraft() {
        return activeComposerDraft;
      },
      set activeComposerDraft(next) {
        activeComposerDraft = next;
      },
      get activeBranchIds() {
        return activeBranchIds;
      },
      set activeBranchIds(next) {
        activeBranchIds = next;
      },
      get pendingUserInputs() {
        return pendingUserInputs;
      },
      set pendingUserInputs(next) {
        pendingUserInputs = next;
      },
      get mermaidConfig() {
        return mermaidConfig;
      },
      get liveContextUsageByConversation() {
        return liveContextUsageByConversation;
      },
      set liveContextUsageByConversation(next) {
        liveContextUsageByConversation = next;
      },
      get liveFileChangesPerConv() {
        return liveFileChangesPerConv;
      },
      set liveFileChangesPerConv(next) {
        liveFileChangesPerConv = next;
      },
      get pendingCheckpointIds() {
        return pendingCheckpointIds;
      },
      set pendingCheckpointIds(next) {
        pendingCheckpointIds = next;
      },
      get approvalResumeQueues() {
        return approvalResumeQueues;
      },
      get deferredApprovalCheckpointIds() {
        return deferredApprovalCheckpointIds;
      },
      get pendingExternalUserRecoveries() {
        return pendingExternalUserRecoveries;
      },
      get interruptTerminalHandoffs() {
        return interruptTerminalHandoffs;
      },
      get followUpSuggestionsByMessageId() {
        return followUpSuggestionsByMessageId;
      },
      set followUpSuggestionsByMessageId(next) {
        followUpSuggestionsByMessageId = next;
      },
      refreshAgentCommands,
      checkAgentPluginUpdates,
      applyStartupBootstrap,
      routeWorkspace,
      activateNewConversationSurface,
      revealMemorySource,
      handleWindowFocusEvent,
      applyTheme,
      loadNewConversationSuggestions,
      loadAvailableRoles,
      openHookConversation,
      applyConversationTitleUpdate,
      cacheRestoreSurface,
      attachPendingUserInputToMessages,
      persistStreamDraft,
      applyLiveCheckpointFlow,
      applyExternalChatRunStarted,
      recoverUnannouncedChatStream,
      applyStreamMutation,
      attachApprovedToolResult,
      refreshLiveCheckpointTip,
      findConversationLocation,
      loadMessagesForConv,
      clearLiveFileChanges,
      discardPersistedStreamDraft,
      reconcileCompletedCompaction,
      finishCompactionProgress,
      finalizeStreamedMessage,
      normalizeSuggestions,
    });
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
      [convId]: clearCompactionProgress(chatStreams.itemsByConversation[convId] ?? []),
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
    // A streaming turn keeps its completed divider: the reconciled replay is
    // filtered until that turn ends, so the live marker has to outlive
    // reconciliation. Only a compaction-only row is handed over here.
    if (compactionOnlyConvIds.delete(convId)) {
      chatStreams.cleanup(convId);
    }
  }

  function saveAssistantMessage(conv_id: string, msg: ChatMessage, checkpointId: string | null) {
    queueSaveChatMessage(conv_id, msg, checkpointId).catch(() => {});
  }

  function clearPendingForkState(convId: string): void {
    if (convId in pendingParentCk) {
      const { [convId]: _pendingParent, ...rest } = pendingParentCk;
      pendingParentCk = rest;
    }
    if (convId in pendingForkMessageId) {
      const { [convId]: _forkMessage, ...rest } = pendingForkMessageId;
      pendingForkMessageId = rest;
    }
    if (convId in pendingForkSourceCheckpointId) {
      const { [convId]: _forkSource, ...rest } = pendingForkSourceCheckpointId;
      pendingForkSourceCheckpointId = rest;
    }
    if (convId in pendingForkUserMessageIds) {
      const { [convId]: _forkUserMessage, ...rest } = pendingForkUserMessageIds;
      pendingForkUserMessageIds = rest;
    }
  }

  function discardPersistedStreamDraft(conv_id: string) {
    void conv_id;
  }

  function finalizeStreamedMessage(
    conv_id: string,
    status: CheckpointTurnStatus,
    asstMsgId?: string,
    turnId?: string,
    error?: string | null,
  ): boolean {
    const activeAssistantMessageId = chatStreams.assistantMessageIds[conv_id];
    const recoveredStream = !!chatStreams.recoveredConversationIds[conv_id];
    if (!terminalEventMatchesActiveStream(activeAssistantMessageId, asstMsgId, recoveredStream)) {
      return false;
    }
    const assistantMessageId = asstMsgId ?? activeAssistantMessageId;
    const responseMessageId = turnId ?? assistantMessageId;
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
      // A cancelled/empty turn has no checkpoint to attach to the optimistic
      // fork. Clear the one-shot fork markers before the next ordinary send,
      // otherwise it is incorrectly submitted as another sibling branch.
      clearPendingForkState(conv_id);
      chatStreams.cleanup(conv_id);
      void dispatchNextQueuedMessage(conv_id);
      return true;
    }

    const checkpointId = pendingCheckpointIds[conv_id] ?? null;

    // The live divider is a streaming affordance: once this turn is durable the
    // reconciled compaction replay renders the same boundary, so persisting the
    // marker as well would mount it twice.
    const durableItems = items.filter((item) => item.type !== "compaction_boundary");

    const finalizedAt = Date.now();
    const assistantMsg: ChatMessage = {
      id: assistantMessageId ?? crypto.randomUUID(),
      role: "assistant",
      content: fullText,
      timestamp: finalizedAt,
      items: durableItems.length > 0 ? [...durableItems] : undefined,
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
      const { [conv_id]: _recovered, ...restRecovered } = chatStreams.recoveredConversationIds;
      chatStreams.itemsByConversation = restItems;
      chatStreams.streamingConversationIds = restStreaming;
      pendingCheckpointIds = restCk;
      pendingParentCk = restPp;
      pendingForkMessageId = restPf;
      pendingForkSourceCheckpointId = restPfs;
      pendingForkUserMessageIds = restPfu;
      chatStreams.assistantMessageIds = restAsstIds;
      chatStreams.recoveredConversationIds = restRecovered;
      return true;
    }

    const reconciliation = reconcileTerminalAssistantMessage(
      location.conversations[location.index].messages,
      assistantMsg,
      responseMessageId ?? assistantMsg.id,
    );
    location.conversations[location.index] = {
      ...location.conversations[location.index],
      messages: reconciliation.messages,
      updatedAt: Date.now(),
    };
    promoteConversationInRecents(location.conversations[location.index]);

    // Rust persists completed responses, but the client is the source of the
    // stream timing. Save every final message so firstTokenAt/completedAt are
    // merged into that persisted record before a refresh.
    if (reconciliation.appended) {
      saveAssistantMessage(conv_id, assistantMsg, checkpointId);
    }

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
    clearPendingForkState(conv_id);

    chatStreams.cleanup(conv_id);
    void dispatchNextQueuedMessage(conv_id);
    return true;
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
      const generation = ++themeSyncGeneration;
      themeSyncInFlight = true;
      void synchronizeNativeTheme(theme as AppTheme).finally(() => {
        if (generation === themeSyncGeneration) themeSyncInFlight = false;
      });
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
      workspace = (await openAgent.invokeProduct("get_workspace_context", {})) as WorkspaceContext;
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
      if (isChannelsSettingsPreview || isAgentsSettingsPreview || isMcpSettingsPreview) {
        config = {
          ...config,
          theme:
            mcpSettingsPreviewTheme ??
            agentsSettingsPreviewTheme ??
            channelsSettingsPreviewTheme ??
            config.theme,
          language:
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
          mcpSettingsPreviewTheme ??
          config.theme ??
          "system",
      );
      await initI18n(
        onboardingPreviewLocale ??
          channelsSettingsPreviewLocale ??
          agentsSettingsPreviewLocale ??
          mcpSettingsPreviewLocale ??
          config.language,
      );
      return;
    }

    try {
      const loaded = await settingsRequests.resolve(() =>
        openAgent.invokeProduct("get_settings", {}).then((value) => value as AppConfig),
      );
      if (!loaded) return;
      config = normalizeConfigShape(loaded);
      applyTheme(config.theme ?? "system");
      await initI18n(config.language);
      if (config.workspace) workspacePath = config.workspace;
      if (config.recent_workspaces?.length) recentWorkspaces = config.recent_workspaces;
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  // The Runtime command catalog is config-derived: disabling an Agent Plugin
  // removes the commands it owns. Re-read it whenever settings or the installed
  // plugin set change, so the composer palette cannot offer a command the
  // Runtime would reject and does not require an application restart.
  async function refreshAgentCommands() {
    if (!tauriAvailable) return;
    try {
      agentCommandSpecs = await openAgent.listAgentCommands();
    } catch (error) {
      console.warn("Failed to refresh agent commands:", error);
    }
  }

  function pollMemoryStatus() {
    if (!tauriAvailable) return;

    setInterval(async () => {
      try {
        const next = await openAgent.invokeProduct("get_memory_status", {});
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

  async function activateNewConversationSurface(
    roleKey = roleController.selectedRoleKey,
  ): Promise<void> {
    const roleChanged = roleKey !== roleController.selectedRoleKey;
    if (roleChanged) {
      roleController.selectedRoleKey = roleKey;
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
      await openAgent
        .invokeProduct("set_active_conversation", {
          convId: null,
          workspace: workspacePath || "",
        })
        .catch(() => {});
    }
  }

  async function newConversation() {
    if (composerPreferences.modelOptions.length === 0) {
      showToast({ title: $t("modelSetupRequired"), variant: "error" });
      void openManagementSurface("models", "providers");
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
      ? await openAgent
          .invokeProduct("get_active_conv_id", { workspace: path || "" })
          .catch(() => null)
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
      openAgent
        .invokeProduct("set_active_conversation", { convId: null, workspace: path || "" })
        .catch(() => {});
    }
  }

  async function switchConversation(id: string) {
    const target =
      conversations.find((conversation) => conversation.id === id) ??
      (await fetchConversationMeta(id).catch(() => null));
    const targetRoleKey = target?.roleId ?? defaultRoleKey;
    if (targetRoleKey !== roleController.selectedRoleKey) {
      roleController.selectedRoleKey = targetRoleKey;
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
      openAgent
        .invokeProduct("set_active_conversation", { convId: id, workspace: workspacePath || "" })
        .catch(() => {});
    // An externally started conversation can be marked as loaded by the
    // optimistic chat-run-started projection before the workspace activation
    // request reaches this shell. If its checkpoint tree has not been
    // hydrated yet, bypass the loaded-id short-circuit so the persisted branch
    // (including a newly created branch with a null tip) becomes active.
    const refreshBranchProjection = !convTrees[id] || !activeBranchIds[id];
    await Promise.all([
      loadMessagesForConv(id, true, refreshBranchProjection),
      loadFileChangesForConv(id),
    ]);
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
        await openAgent.invokeProduct("cancel_chat_message", { convId: id }).catch(() => {});
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
    conversationLists.recentConversations = conversationLists.recentConversations.filter(
      (conversation) => conversation.id !== id,
    );
    conversationLists.searchConversations = conversationLists.searchConversations.filter(
      (conversation) => conversation.id !== id,
    );
    navigationHistory = removeNavigationLocations(
      navigationHistory,
      (location) => location.conversationId === id,
    );
    loadedConvIds.delete(id);
    openAgent.invokeProduct("delete_conversation", { convId: id }).catch(() => {});
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
      openAgent
        .invokeProduct("update_conversation", { convId: id, patch: { pinned: newPinned } })
        .catch(() => {});
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
      void openManagementSurface("models", "providers");
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
        roleId: roleController.selectedRoleId ?? undefined,
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
        roleId: roleController.selectedRoleId,
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
      await openAgent
        .invokeProduct("create_conversation", pendingConversationCreation)
        .catch(() => {});
    }

    // The user message is persisted atomically in the resulting checkpoint.
    // Update conversation title in SQLite on first user message
    if (isFirstUserMsg && newTitle) {
      await openAgent
        .invokeProduct("update_conversation", {
          convId,
          patch: {
            title: newTitle,
            title_source: "fallback",
            updated_at: Math.floor(Date.now() / 1000),
          },
        })
        .catch(() => {});
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
        title:
          inputError.code === "missing_argument" ? tr("slashCommandNeedsArgument") : String(error),
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
    const convId = activeConvId;
    clearQueuedMessages(convId);
    await syncChatQueuePending(convId);
    // Saving the partial response can be queued behind earlier stream writes.
    // Do not make that queue delay the cancellation signal.
    void persistStreamDraft(activeConvId, true).catch(() => {});
    await openAgent.invokeProduct("cancel_chat_message", { convId }).catch(() => {});
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

  function setFollowStreamToBottom(value: boolean, convId = activeConvId) {
    if (!convId) return;
    followStreamToBottomByConversation = {
      ...followStreamToBottomByConversation,
      [convId]: value,
    };
  }

  function handleMessagesScroll() {
    // A scroll event can arrive after a programmatic pin even when the user
    // initiated it (wheel/touch/pointer handlers run before the scroll event).
    // Always derive intent from the actual viewport position so a small upward
    // gesture immediately releases tail following instead of being pulled back.
    setFollowStreamToBottom(isMessagesScrolledToBottom());
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
    setFollowStreamToBottom(false);
    if (bottomScrollRaf !== null) {
      cancelAnimationFrame(bottomScrollRaf);
      bottomScrollRaf = null;
    }
  }

  async function scrollToBottom(behavior: ScrollBehavior = "auto") {
    await tick();
    const el = messagesEl;
    if (!el) return;

    setFollowStreamToBottom(true);
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
    setFollowStreamToBottom(true, convId);
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
    setFollowStreamToBottom(true, anchor.convId);
  }

  onMount(() => {
    return () => {
      if (bottomScrollRaf !== null) cancelAnimationFrame(bottomScrollRaf);
    };
  });

  // ─── Workspace ────────────────────────────────────────────────────────────────

  const workspaceNavigation = createWorkspaceNavigation({
    get tauriAvailable() {
      return tauriAvailable;
    },
    get config() {
      return config;
    },
    get defaultRoleKey() {
      return defaultRoleKey;
    },
    get workspacePath() {
      return workspacePath;
    },
    set workspacePath(next) {
      workspacePath = next;
    },
    get workspace() {
      return workspace;
    },
    set workspace(next) {
      workspace = next;
    },
    get workspaceLoading() {
      return workspaceLoading;
    },
    set workspaceLoading(next) {
      workspaceLoading = next;
    },
    get workspaceSwitchTarget() {
      return workspaceSwitchTarget;
    },
    set workspaceSwitchTarget(next) {
      workspaceSwitchTarget = next;
    },
    get conversations() {
      return conversations;
    },
    set conversations(next) {
      conversations = next;
    },
    get activeConvId() {
      return activeConvId;
    },
    set activeConvId(next) {
      activeConvId = next;
    },
    get restoringSurface() {
      return restoringSurface;
    },
    set restoringSurface(next) {
      restoringSurface = next;
    },
    get newConversationSuggestions() {
      return newConversationSuggestions;
    },
    set newConversationSuggestions(next) {
      newConversationSuggestions = next;
    },
    get convTrees() {
      return convTrees;
    },
    set convTrees(next) {
      convTrees = next;
    },
    get activeBranchIds() {
      return activeBranchIds;
    },
    set activeBranchIds(next) {
      activeBranchIds = next;
    },
    get pendingUserInputs() {
      return pendingUserInputs;
    },
    set pendingUserInputs(next) {
      pendingUserInputs = next;
    },
    get fileChangesPerConv() {
      return fileChangesPerConv;
    },
    set fileChangesPerConv(next) {
      fileChangesPerConv = next;
    },
    get workspaceConversationSnapshots() {
      return workspaceConversationSnapshots;
    },
    get loadedConvIds() {
      return loadedConvIds;
    },
    get chatStreams() {
      return chatStreams;
    },
    get pendingForkUserMessageIds() {
      return pendingForkUserMessageIds;
    },
    get roleController() {
      return roleController;
    },
    get conversationLists() {
      return conversationLists;
    },
    loadAvailableRolesForWorkspace,
    loadNewConversationSuggestions,
    storedRoleSelection,
    roleSelectionStorageKey,
    mergeDurableFollowUpSuggestions,
    syncAgentHistoryToActivePath,
    scrollToBottom,
    cacheRestoreSurface,
    addToRecentWorkspaces,
    refreshRecentConversations,
  });
  const routeWorkspace = workspaceNavigation.routeWorkspace;
  const requestWorkspace = workspaceNavigation.requestWorkspace;

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
      .then(() =>
        openAgent.invokeProduct("save_workspace_prefs", { workspace, recentWorkspaces: recents }),
      )
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

  // ─── Settings ────────────────────────────────────────────────────────────────

  async function openManagementSurface(
    kind: SettingsWindowKind,
    section?: SettingsNav,
  ): Promise<void> {
    // Reveal the requested domain immediately so its layout-stable skeleton
    // covers the whole window while the lazily imported surface loads.
    settingsSurface = {
      kind,
      section: settingsWindowSection(kind, section),
      everySection: false,
    };
    // SettingsView autosaves its draft on unmount. Do not create it with the
    // empty fallback while the persisted configuration is still loading.
    if (!config) {
      await loadSettings();
      if (!config) {
        closeSettings();
        return;
      }
    }
    SettingsView ??= (await import("$lib/components/SettingsView.svelte")).default;
  }

  function closeSettings() {
    settingsSurface = null;
    if (config) setLocale((config.language ?? "zh") as Locale);
  }

  /**
   * Navigates the right sidebar to a plugin panel from a management surface.
   * The lifecycle registry stays authoritative: a panel the sidebar cannot
   * mount for the active scope is ignored instead of selecting a view the
   * sidebar would immediately navigate away from.
   */
  function openPluginSidebarView(panel: RightSidebarPanel): void {
    if (!pluginSidebarViews.some((view) => view.id === panel)) return;
    closeAuxiliarySurfaces();
    rightSidebarCollapseRequested = false;
    rightSidebarPanel = panel;
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
        const saved = await openAgent.invokeProduct("save_settings", {
          config: snapshot,
          baseConfig: normalizeConfigShape(baseConfig ?? config ?? snapshot),
        });
        savedSnapshot = normalizeConfigShape(saved as AppConfig);
      }
      settingsRequests.invalidate();
      config = structuredClone(savedSnapshot);
      void refreshAgentCommands();
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
      case "settings": {
        const destination = parseSettingsDestination(location.settingsDestination);
        await openManagementSurface(destination.kind, destination.section);
        break;
      }
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
        return () => openManagementSurface("models", "defaults");
      case "compact":
        return () => {
          void compactCurrentConversation();
        };
      case "settings":
        return () => openManagementSurface("general", "general");
      default:
        return null;
    }
  }

  function clientActionRun(action: string): (() => void) | null {
    switch (action) {
      case "new_conversation":
        return () => newConversation();
      case "open_model_settings":
        return () => openManagementSurface("models", "defaults");
      case "open_settings":
        return () => openManagementSurface("general", "general");
      default:
        return null;
    }
  }

  let slashCommands = $derived.by<SlashCommand[]>(() => {
    const seen = new Set<string>();
    return agentCommandSpecs.flatMap((spec) => {
      // A package command whose id equals its package id has a short alias and
      // a namespaced route. Normalize both spellings before deduplication so a
      // stale refresh cannot create a second palette item.
      const normalizedName = spec.name.replace(/^\/+/, "");
      const catalogKey =
        spec.plugin_id &&
        (normalizedName === spec.plugin_id ||
          normalizedName === `${spec.plugin_id}:${spec.plugin_id}`)
          ? spec.plugin_id
          : normalizedName;
      if (seen.has(catalogKey)) return [];
      seen.add(catalogKey);
      const run = slashCommandRun(spec.name);
      const commandName = catalogKey;
      const insertText = spec.plugin_id ? `/${commandName}` : undefined;
      if (!run && !insertText) return [];
      return [
        {
          id: commandName,
          name: commandName,
          label: pluginCommandText(
            spec,
            $locale,
            "label",
            spec.label ?? $t(spec.label_key as TranslationKeys),
          ),
          description: pluginCommandText(
            spec,
            $locale,
            "description",
            spec.description ?? $t(spec.description_key as TranslationKeys),
          ),
          insertText,
          run: run ?? undefined,
        },
      ];
    });
  });

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
    pendingCheckpointId: activeConvId ? (pendingCheckpointIds[activeConvId] ?? null) : null,
    debugMode: isDebugMode,
    taskUsagesByCheckpointId: activeConvId ? (taskUsagesByConversation[activeConvId] ?? {}) : {},
    liveContextUsage: activeConvId ? (liveContextUsageByConversation[activeConvId] ?? null) : null,
    fileChanges: currentFileChanges,
    followUpSuggestionsByMessageId,
    // Tail following is a streaming affordance only. Once the response is
    // durable, the transcript must remain where the reader left it.
    followTail: isCurrentStreaming && followStreamToBottom,
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
    pluginSidebarViews,
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
    configureModels: () => openManagementSurface("models", "providers"),
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
    scrollToBottom,
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
    if (
      isDevInspectorWindow ||
      standaloneDevPreview ||
      isQuickChatSurface ||
      isOnboardingSurface ||
      isSettingsWindow ||
      isRoleEditorWindow
    )
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
  const winMaximize = () => windowMaximizer?.toggle() ?? Promise.resolve();
  const winClose = () => (launchContext?.workspace ? appWindow?.close() : appWindow?.hide());
  const quitApp = () => void invoke("quit_app");

  onMount(() => {
    if (!windowMaximizer || !appWindow) return;

    let disposed = false;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    const rememberNormalGeometry = () => {
      if (!disposed) void windowMaximizer.rememberNormalGeometry();
    };

    void windowMaximizer.rememberNormalGeometry();
    void appWindow.onMoved(rememberNormalGeometry).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenMoved = unlisten;
    });
    void appWindow.onResized(rememberNormalGeometry).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenResized = unlisten;
    });

    return () => {
      disposed = true;
      unlistenMoved?.();
      unlistenResized?.();
    };
  });

  // Keep the webview's built-in context menu available while developing, but
  // do not expose browser actions (such as inspect/copy navigation) in builds.
  function handleContextMenu(event: MouseEvent) {
    if (!isDebugBuild) event.preventDefault();
  }

  onMount(() => {
    if (isSettingsWindow || isRoleEditorWindow) return;
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
    {#if StandaloneDevPreview}
      <StandaloneDevPreview preview={standaloneDevPreview} />
    {/if}
  {:else if settingsWindowKind}
    {#if SettingsWindowSurface}
      <SettingsWindowSurface
        kind={settingsWindowKind}
        initialSection={settingsWindowInitialSection}
      />
    {:else}
      <div class="settings-route-loading">
        <SettingsWindowSkeleton
          kind={settingsWindowKind}
          initialSection={settingsWindowInitialSection}
          label={$t("loadingContent")}
        />
      </div>
    {/if}
  {:else if isRoleEditorWindow}
    <RoleEditorWindowSurface />
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
        roles={roleController.agentRoles}
        selectedRoleKey={roleController.selectedRoleKey}
        {canGoBack}
        {canGoForward}
        {workspacePath}
        {workspaceSwitchTarget}
        {recentWorkspaces}
        {pinnedProjectPaths}
        searchQuery={conversationLists.conversationSearchQuery}
        conversations={sidebarConversations}
        recentConversations={conversationLists.recentConversations}
        activeConversationId={activeConvId}
        streamingConversationIds={chatStreams.streamingConversationIds}
        hasMore={sidebarHasMoreConversations}
        loadingMore={sidebarLoadingMoreConversations}
        loadingRecentConversations={conversationLists.loadingRecentConversations}
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
        roles={roleController.agentRoles}
        selectedRoleKey={roleController.selectedRoleKey}
        {tauriAvailable}
        memorySyncing={isMemorySyncing}
        {checkpointFlowPanelCollapsed}
        {conversationPanelCollapsed}
        {rightSidebarAvailable}
        onPickWorkspace={pickWorkspace}
        onPickWsl={pickWslWorkspace}
        onSelectWorkspace={requestWorkspace}
        onNewConversation={newConversation}
        onNewWindow={createNewWindow}
        onOpenSettings={() => openManagementSurface("general", "general")}
        onOpenSettingsWindow={openManagementSurface}
        onCreateRole={() => void openRoleEditor(null)}
        onConfigureRole={(role) => void openRoleEditor(role)}
        onOpenAbout={() => openManagementSurface("about", "about")}
        debugMode={isDebugMode}
        onToggleDebugMode={toggleMainDebugMode}
        onQuit={quitApp}
        onToggleCheckpointFlowPanel={() => {
          // The title-bar toggle is the only writer of the preference that
          // seeds every branch the session has not visited; automatic opens
          // stay session state for the branch they happened in.
          if (!rightSidebarCollapseRequested) {
            rightSidebarCollapseRequested = true;
          } else {
            rightSidebarCollapseRequested = false;
          }
          rightSidebarPreference = rightSidebarCollapseRequested;
          saveCheckpointFlowPanelCollapsed(window.localStorage, rightSidebarPreference);
        }}
        onToggleConversationPanel={() => {
          conversationPanelCollapsed = !conversationPanelCollapsed;
          saveConversationPanelCollapsed(window.localStorage, conversationPanelCollapsed);
        }}
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
          {checkpointFlowPanelCollapsed}
          {conversationPanelCollapsed}
          onConversationCollapse={(collapsed) => {
            conversationPanelCollapsed = collapsed;
            saveConversationPanelCollapsed(window.localStorage, collapsed);
          }}
          bind:rightSidebarPanel
          {terminalSessionCount}
          {historicalTerminalSessions}
          onTerminalSummaryChange={(_runningCount, sessionCount) => {
            terminalSummary = { scopeKey: rightSidebarScopeKey, sessionCount };
          }}
          {rightSidebarConversationId}
          {rightSidebarBranchId}
          {pluginSidebarViews}
          {pluginSidebarRevision}
          composerDraft={activeComposerDraft}
          focusRequest={composerFocusRequest}
        />
      </div>
    </div>

    <FullscreenSurface
      open={settingsOpen}
      title={settingsSurface ? $t(settingsWindowTitles[settingsSurface.kind]) : ""}
      onMinimize={winMinimize}
      onMaximize={winMaximize}
      onCloseWindow={winClose}
      onClose={closeSettings}
    >
      {#if settingsSurface}
        <!-- Every domain keeps its own SettingsView instance so abandoning one
             domain autosaves its draft instead of leaking it into the next.
             SettingsView must not mount before the persisted configuration
             arrives: its unmount autosave would persist the empty fallback. -->
        {#key settingsSurface.kind}
          {#if SettingsView && config}
            <SettingsView
              {config}
              {workspacePath}
              initialNav={settingsSurface.section}
              sections={settingsSurfaceSections}
              onSave={saveSettings}
              onOpenConversation={openHookConversation}
              onOpenPluginSidebarView={openPluginSidebarView}
              {pluginSidebarContext}
              onThemePreview={applyTheme}
            />
          {:else}
            <SettingsWindowSkeleton
              kind={settingsSurface.kind}
              initialSection={settingsSurface.section}
              label={$t("loadingContent")}
            />
          {/if}
        {/key}
      {/if}
    </FullscreenSurface>

    <FullscreenSurface
      open={roleController.roleEditorOpen}
      title={roleController.roleEditorRole ? $t("editRole") : $t("newRole")}
      onMinimize={winMinimize}
      onMaximize={winMaximize}
      onCloseWindow={winClose}
      onClose={() => {
        roleController.roleEditorOpen = false;
      }}
    >
      <RoleEditorDialog
        open={roleController.roleEditorOpen}
        role={roleController.roleEditorRole}
        skills={roleController.roleEditorSkills}
        mcpServers={config?.mcp.servers ?? []}
        loadingResources={roleController.roleEditorResourcesLoading}
        saving={roleController.roleEditorSaving}
        presentation="window"
        onClose={() => {
          roleController.roleEditorOpen = false;
        }}
        onSave={saveRoleEditor}
        onDelete={deleteRoleEditor}
      />
    </FullscreenSurface>
  {/if}

  <Toast />
</TooltipPrimitive.Provider>

<WorkspaceDialogs
  bind:wslPickerOpen={wslPicker.wslPickerOpen}
  wslPickerBusy={wslPicker.wslPickerBusy}
  bind:wslPickerError={wslPicker.wslPickerError}
  wslDistributions={wslPicker.wslDistributions}
  bind:wslDistribution={wslPicker.wslDistribution}
  bind:wslLinuxPath={wslPicker.wslLinuxPath}
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

  .settings-route-loading {
    width: 100vw;
    height: 100vh;
    min-width: 0;
    overflow: hidden;
  }

  .app {
    display: flex;
    height: 100vh;
    min-width: var(--desktop-app-min-width);
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
</style>
