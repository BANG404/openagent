<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { LogicalSize } from "@tauri-apps/api/dpi";
  import { homeDir } from "@tauri-apps/api/path";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import {
    disable as disableAutostart,
    enable as enableAutostart,
  } from "@tauri-apps/plugin-autostart";
  import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
  import { onMount, tick } from "svelte";
  import type { Component } from "svelte";

  // Lazy-loaded feature views expose different prop contracts; each render site
  // below remains checked against the concrete component after loading.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type LazyViewComponent = Component<any>;

  import WindowControls from "$lib/components/WindowControls.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import { installDownloadHook } from "$lib/downloadHook";
  import { checkForAppUpdate } from "$lib/appUpdater";
  import { Dialog, Tooltip as TooltipPrimitive } from "bits-ui";
  import { defaultPermissionProfile, normalizeConfigShape } from "$lib/config";
  import { initializeTray } from "$lib/tray";
  import { t, tr, initI18n, setLocale, type Locale, type TranslationKeys } from "$lib/i18n";
  import { showToast } from "$lib/toast";
  import { decodeModelBinding, encodeModelBinding } from "$lib/modelBinding";
  import { providerRequiresApiKey } from "$lib/providerCatalog";
  import {
    DEFAULT_QUICK_CHAT_SHORTCUT,
    formatQuickChatShortcut,
    normalizeQuickChatShortcut,
    QUICK_CHAT_FOCUS_INPUT_EVENT,
  } from "$lib/quickChatShortcut";
  import {
    loadQuickChatPreferences,
    resolveQuickChatModel,
    saveQuickChatPreferences,
  } from "$lib/quickChatPreferences";
  import { desktopOpenAgent as openAgent, emit, invoke, listen } from "$lib/openagent/tauriClient";
  import type { ChatMemoryRetrievalStage, ChatRunStartedEvent } from "$lib/openagent";
  import {
    DEV_MAIN_DEBUG_VISIBILITY_EVENT,
    readMainDebugComponentsVisible,
  } from "$lib/devDebugVisibility";
  import {
    ONBOARDING_OPEN_EVENT,
    hasCompletedOnboarding,
    markOnboardingCompleted,
  } from "$lib/onboarding";
  import {
    clearQueuedChatMessages,
    dequeueChatMessage,
    enqueueChatMessage,
    removeQueuedChatMessage,
    type QueuedChatMessage,
  } from "$lib/chatQueue";
  import FileChangeBanner from "$lib/components/FileChangeBanner.svelte";
  import WorkspaceSwitcher from "$lib/components/WorkspaceSwitcher.svelte";
  import ConversationList from "$lib/components/ConversationList.svelte";
  import SidebarCollapseButton from "$lib/components/SidebarCollapseButton.svelte";
  import SidebarHistoryControls from "$lib/components/SidebarHistoryControls.svelte";
  import SidebarPrimaryActions from "$lib/components/SidebarPrimaryActions.svelte";
  import SidebarResizeHandle from "$lib/components/SidebarResizeHandle.svelte";
  import RoleSelector from "$lib/components/RoleSelector.svelte";
  import SidebarNav from "$lib/components/SidebarNav.svelte";
  import OnboardingFlow from "$lib/components/OnboardingFlow.svelte";
  import MessageInput, { type SlashCommand } from "$lib/components/MessageInput.svelte";
  import ReasoningEffortSelect from "$lib/components/ReasoningEffortSelect.svelte";
  import PermissionSettings from "$lib/components/PermissionSettings.svelte";
  import ChatQueue from "$lib/components/ChatQueue.svelte";
  import MessageList from "$lib/components/MessageList.svelte";
  import AgentBookReader, { type AgentBookTurn } from "$lib/components/AgentBookReader.svelte";
  import NewConversationContext from "$lib/components/NewConversationContext.svelte";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import QuickChat from "$lib/components/QuickChat.svelte";
  import { clampSidebarWidth, loadSidebarWidth, saveSidebarWidth } from "$lib/sidebarSizing";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import { renderMermaidToolResult } from "$lib/streamdown/mermaidRenderer";
  import {
    ROOT_KEY,
    buildTreeFromCheckpoints,
    computeActivePath,
    findForkParentCheckpointId,
    selectActivePathToCheckpoint,
    ckIdsAlongActivePath,
    attachNewTurn,
    askUserRequestFromToolUse,
    isCompactionBoundary,
    preserveMessagesAddedDuringHydration,
    type ConvTree,
  } from "$lib/checkpointTree";
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
    readWorkspaceRestoreHint,
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
    AgentMemoryEntry,
    AgentRole,
    StartupBootstrap,
    StartupConversationBundle,
    DefaultModelBinding,
    WslDistribution,
    WslWorkspaceTarget,
    ProviderAuthDeviceCodeEvent,
    PermissionProfile,
    ReasoningEffort,
  } from "$lib/types";

  type AgentCommandSpec = {
    name: string;
    owner: "runtime" | "client";
    argument: "none" | "required_text";
    label_key: string;
    description_key: string;
  };

  type ResolvedAgentInput =
    | { type: "chat"; text: string }
    | {
        type: "agent_command";
        command: "compact" | "goal" | "graph";
        argument: string;
        original_text: string;
      }
    | {
        type: "client_action";
        action:
          | "new_conversation"
          | "open_model_settings"
          | "open_drafts"
          | "open_memory"
          | "open_skills"
          | "open_settings";
        original_text: string;
      };

  function shouldShowDefaultProviderCredentialWarning(appConfig: AppConfig | null): boolean {
    if (!appConfig) return false;
    const provider = appConfig.providers.find(
      (item) => item.id === appConfig.defaults.chat_model.provider_id,
    );
    return !provider || (providerRequiresApiKey(provider.provider) && !provider.api_key.trim());
  }

  const runtimeQuery =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const devQuery = import.meta.env.DEV ? runtimeQuery : null;
  const isDevInspectorWindow = devQuery?.has("dev-inspector") === true;
  const isQuickChatPreview = devQuery?.has("quick-chat-preview") === true;
  const isReasoningEffortPreview = devQuery?.has("reasoning-effort-preview") === true;
  const isWorkspaceSwitcherPreview = devQuery?.has("workspace-switcher-preview") === true;
  const isCommandPalettePreview = devQuery?.has("command-palette-preview") === true;
  const isPauseControlPreview = devQuery?.has("pause-control-preview") === true;
  const isBookModePreview = devQuery?.has("book-mode-preview") === true;
  const isPermissionSettingsPreview = devQuery?.has("permission-settings-preview") === true;
  const isChannelsSettingsPreview = devQuery?.has("channels-settings-preview") === true;
  const isQuickChatWindow = runtimeQuery?.has("quick-chat-window") === true;
  const isQuickChatSurface = isQuickChatWindow || isQuickChatPreview;
  const quickChatPreviewTheme =
    devQuery?.get("quick-chat-preview-theme") === "dark" ? "dark" : null;
  const quickChatPreviewLocale: Locale | null =
    devQuery?.get("quick-chat-preview-locale") === "en" ? "en" : null;
  const reasoningEffortPreviewTheme =
    devQuery?.get("reasoning-effort-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("reasoning-effort-preview-theme") === "light"
        ? "light"
        : null;
  const reasoningEffortPreviewLocale: Locale | null =
    devQuery?.get("reasoning-effort-preview-locale") === "en"
      ? "en"
      : devQuery?.get("reasoning-effort-preview-locale") === "zh"
        ? "zh"
        : null;
  const workspaceSwitcherPreviewTheme =
    devQuery?.get("workspace-switcher-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("workspace-switcher-preview-theme") === "light"
        ? "light"
        : null;
  const workspaceSwitcherPreviewLocale: Locale | null =
    devQuery?.get("workspace-switcher-preview-locale") === "en"
      ? "en"
      : devQuery?.get("workspace-switcher-preview-locale") === "zh"
        ? "zh"
        : null;
  const commandPalettePreviewTheme =
    devQuery?.get("command-palette-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("command-palette-preview-theme") === "light"
        ? "light"
        : null;
  const commandPalettePreviewLocale: Locale | null =
    devQuery?.get("command-palette-preview-locale") === "en"
      ? "en"
      : devQuery?.get("command-palette-preview-locale") === "zh"
        ? "zh"
        : null;
  const pauseControlPreviewTheme =
    devQuery?.get("pause-control-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("pause-control-preview-theme") === "light"
        ? "light"
        : null;
  const pauseControlPreviewLocale: Locale | null =
    devQuery?.get("pause-control-preview-locale") === "en"
      ? "en"
      : devQuery?.get("pause-control-preview-locale") === "zh"
        ? "zh"
        : null;
  const bookModePreviewTheme =
    devQuery?.get("book-mode-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("book-mode-preview-theme") === "light"
        ? "light"
        : null;
  const bookModePreviewLocale: Locale | null =
    devQuery?.get("book-mode-preview-locale") === "en"
      ? "en"
      : devQuery?.get("book-mode-preview-locale") === "zh"
        ? "zh"
        : null;
  const permissionSettingsPreviewTheme =
    devQuery?.get("permission-settings-preview-theme") === "dark"
      ? "dark"
      : devQuery?.get("permission-settings-preview-theme") === "light"
        ? "light"
        : null;
  const permissionSettingsPreviewLocale: Locale | null =
    devQuery?.get("permission-settings-preview-locale") === "en"
      ? "en"
      : devQuery?.get("permission-settings-preview-locale") === "zh"
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
  const bookModePreviewTable = [
    "| Section | Status | Notes |",
    "| --- | --- | --- |",
    ...Array.from(
      { length: 18 },
      (_, index) =>
        `| Row ${index + 1} | Complete | Row-level book pagination fixture ${index + 1} |`,
    ),
  ].join("\n");
  const bookModePreviewTurns: AgentBookTurn[] = [
    {
      key: "book-preview-one",
      items: [
        {
          type: "thinking",
          content:
            "Check the request, inspect the relevant files, and preserve the reply boundary.",
        },
        {
          type: "tool_call",
          name: "read_files",
          args: JSON.stringify({ paths: ["MessageList.svelte", "checkpointTree.ts"] }),
          result: "Read the transcript grouping and compaction boundary logic.",
        },
        { type: "compaction_boundary" },
        {
          type: "text",
          content: `${bookModePreviewTable}\n\n${Array.from(
            { length: 28 },
            (_, index) =>
              `### ${index + 1}. 连贯阅读\n\n书籍模式会把一次完整的 Agent 输出保持在同一章中。正文从左栏自然流向右栏，超出当前展开页时继续到下一页；压缩续接、工具过程和最终结论都保留原有顺序。`,
          ).join("\n\n")}`,
        },
      ],
    },
    {
      key: "book-preview-two",
      items: [{ type: "text", content: "第二条 Agent 消息用于验证章节切换。" }],
    },
  ];
  const workspaceSwitcherPreviewWorkspace: WorkspaceContext = {
    path: "C:\\Projects\\Temp",
    git_branch: null,
    has_agent_dir: false,
    environment: { kind: "local" },
  };
  const workspaceSwitcherPreviewRecents: RecentWorkspace[] = [
    { name: "Temp", path: "C:\\Projects\\Temp" },
    { name: "openagent", path: "C:\\Projects\\openagent" },
    {
      name: "openagent-wsl",
      path: "\\\\wsl.localhost\\Ubuntu-24.04\\home\\developer\\Projects\\openagent",
    },
    { name: "documents", path: "C:\\Projects\\documents" },
    { name: "design-system", path: "C:\\Projects\\design-system" },
    { name: "agent-runtime", path: "C:\\Projects\\agent-runtime" },
    { name: "playground", path: "C:\\Projects\\playground" },
    { name: "research", path: "C:\\Projects\\research" },
    { name: "experiments", path: "C:\\Projects\\experiments" },
    { name: "archive", path: "D:\\Workspace Archive\\2026\\archive" },
  ];
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
  let loadingConversationIds = $state<Record<string, boolean>>({});
  let restoringSurface = $state<CachedRestoreSurface>(
    startupRestoreHint?.surface ?? "new-conversation",
  );
  let agentCommandSpecs = $state<AgentCommandSpec[]>([]);
  let mainContentLoading = $derived(
    initialLoading ||
      workspaceLoading ||
      Boolean(activeConvId && loadingConversationIds[activeConvId]),
  );
  let newConversationLayout = $derived(
    mainContentLoading ? restoringSurface === "new-conversation" : activeConvId === null,
  );
  let conversationSearchQuery = $state("");
  let sidebarConversations = $derived.by(() => {
    const source = conversationSearchQuery.trim() ? searchConversations : conversations;
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
  const sidebarCollapsedStorageKey = "openagent.sidebar.collapsed";
  let sidebarCollapsed = $state(
    typeof window !== "undefined" &&
      window.localStorage.getItem(sidebarCollapsedStorageKey) === "true",
  );
  let sidebarWidth = $state(loadSidebarWidth());
  let sidebarResizing = $state(false);
  // Per-conversation streaming state — keyed by conv_id
  let streamingConvIds = $state<Record<string, boolean>>({});
  let streamPausedConvIds = $state<Record<string, boolean>>({});
  let convStreamItems = $state<Record<string, StreamItem[]>>({});
  let streamAssistantMsgIds = $state<Record<string, string>>({});
  let streamStartedAt = $state<Record<string, number>>({});
  let streamFirstTokenAt = $state<Record<string, number>>({});
  let awaitingStreamOutputConvIds = $state<Record<string, boolean>>({});
  let memoryRetrievalStages = $state<Record<string, ChatMemoryRetrievalStage>>({});
  let memoryRetrievalSkippableConvIds = $state<Record<string, boolean>>({});
  // Checkpoint IDs from chat-checkpoint events, pending assignment to assistant messages
  let pendingCheckpointIds = $state<Record<string, string>>({});
  // Tracks which conv_ids have had their messages loaded from SQLite
  const loadedConvIds = new Set<string>();
  // File changes per conversation (loaded from SQLite)
  let fileChangesPerConv = $state<Record<string, FileChange[]>>({});
  // File changes reported by successful write tools before the turn reaches its
  // terminal checkpoint and is persisted to SQLite.
  let liveFileChangesPerConv = $state<Record<string, FileChange[]>>({});
  // Pending ask_user requests per conversation. Backend emits one when the
  // ask_user tool fires; the form clears on submit/cancel.
  let pendingUserInputs = $state<Record<string, UserInputRequest>>({});
  // Prevent approve/deny double submissions for the same durable tool call.
  // Different calls may still be clicked quickly; Rust serializes those per
  // conversation and advances each from the latest checkpoint tip.
  let resolvingUserInputIds = $state<Record<string, boolean>>({});
  let resolvingUserInputConvIds = $state<Record<string, boolean>>({});
  // Height of the input-area for dynamic message padding
  let inputAreaHeight = $state(120);
  let workspace = $state<WorkspaceContext | null>(null);
  let config = $state<AppConfig | null>(null);
  let isMemorySyncing = $state(false);
  let settingsOpen = $state(false);
  let onboardingOpen = $state(false);
  let settingsInitialNav = $state<
    | "general"
    | "channels"
    | "providers"
    | "defaults"
    | "agents"
    | "memory"
    | "websearch"
    | "hooks"
    | "extensions"
    | "about"
    | undefined
  >(undefined);
  let designOpen = $state(false);
  let draftsOpen = $state(false);
  let memoryOpen = $state(false);
  let rolesOpen = $state(false);
  let skillsOpen = $state(false);
  let navigationHistory = $state<AppNavigationHistory>(createNavigationHistory());
  let navigationTransitioning = $state(false);
  let navigationCaptureDepth = $state(0);
  let SettingsView = $state<LazyViewComponent | null>(null);
  let DesignView = $state<LazyViewComponent | null>(null);
  let DraftsView = $state<LazyViewComponent | null>(null);
  let MemoryView = $state<LazyViewComponent | null>(null);
  let RolesView = $state<LazyViewComponent | null>(null);
  let SkillsView = $state<LazyViewComponent | null>(null);
  let workspacePath = $state("");
  let recentWorkspaces = $state<RecentWorkspace[]>([]);
  let pendingWorkspacePath = $state<string | null>(null);
  let wslPickerOpen = $state(false);
  let wslPickerBusy = $state(false);
  let wslPickerError = $state("");
  let wslDistributions = $state<WslDistribution[]>([]);
  let wslDistribution = $state("");
  let wslLinuxPath = $state("");
  let launchContext = $state<{
    workspace: string | null;
    conversation_id: string | null;
    message_id: string | null;
  } | null>(null);
  let isDarkTheme = $state(false);
  let newConversationMemories = $state<AgentMemoryEntry[]>([]);
  let newConversationGeneratedReminder = $state<string | null>(null);
  let newConversationMemoryLoading = $state(true);
  let newConversationMemoryLoadGeneration = 0;
  let newConversationMemoryPrompt = $derived(
    buildNewConversationMemoryPrompt(
      newConversationMemories,
      workspacePath,
      config?.language ?? "zh",
      newConversationGeneratedReminder,
    ),
  );

  // ─── Branch / Re-execute state ────────────────────────────────────────────────
  // The conversation is a tree of checkpoints. Each tree node represents one turn
  // (user msg + assistant response) and carries its checkpoint_id. Siblings under a
  // common parent are alternate variants; the active path through the tree is what
  // the user sees. Nested branch arrows fall out naturally from rendering this path.
  let convTrees = $state<Record<string, ConvTree>>({});
  let checkpointLoadErrors = $state<Record<string, string>>({});
  // Per-conv: parent checkpoint id for the next finalized turn (used to attach a
  // re-execution as a sibling of the edited turn instead of as a tip-extension).
  // Value is null when the new sibling should sit at the root level.
  let pendingParentCk = $state<Record<string, string | null>>({});
  // The durable user-message identity at which a re-executed branch forks.
  let pendingForkMessageId = $state<Record<string, string | null>>({});
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
      retry_delay_ms: 1000,
      chat_queue: [],
      flash_queue: [],
    },
    flash_agents: {
      title: { enabled: true, prompt: "" },
      memory: { enabled: true, prompt: "" },
      skill_category: { enabled: true, prompt: "" },
      new_conversation_summary: { enabled: true, prompt: "" },
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
    context_compaction_threshold: 24000,
    context_compaction_prompt: "",
    web_search: {
      provider: "brave",
      brave_api_key: "",
      tavily_api_key: "",
      searxng_base_url: "",
    },
    html_preview: {
      fixed_height: 480,
    },
    fetch: {
      page_size: 12000,
    },
    launch_on_startup: false,
    diagnostic_log_collection_enabled: true,
    quick_chat_shortcut: DEFAULT_QUICK_CHAT_SHORTCUT,
    mention_palette_show_global_drafts: true,
    message_layout: "single",
    message_double_column_min_width: 1200,
    book_mode_font_size: 17,
    workspace_open_mode: "ask",
    memory_retrieval_enabled: true,
    remote_gateway: {
      enabled: false,
      allow_lan_access: false,
      allowed_workspaces: [],
    },
  };

  // Single source of truth: messages are derived from conversations[]
  let messages = $derived(conversations.find((c) => c.id === activeConvId)?.messages ?? []);

  let inputText = $state("");
  let inputAttachments = $state<ChatAttachment[]>([]);
  let commandPalettePreviewValue = $state("");
  let commandPalettePreviewAttachments = $state<ChatAttachment[]>([]);
  let pauseControlPreviewValue = $state("");
  let pauseControlPreviewAttachments = $state<ChatAttachment[]>([]);
  let pauseControlPreviewPaused = $state(false);
  let selectedModel = $state("");
  let reasoningEffortPreviewValue = $state<ReasoningEffort>("high");
  let permissionSettingsPreviewProfile = $state<PermissionProfile>(defaultPermissionProfile());
  let quickChatModel = $state("");
  let quickChatRole = $state(defaultRoleKey);
  let quickChatWorkspace = $state("");
  let quickChatRoles = $state<AgentRole[]>([]);
  let quickChatSubmitting = $state(false);
  let quickChatInputFocusRequest = $state(0);
  let quickChatFocusArmed = false;
  let quickChatFocusSuppressed = false;
  let unlistenQuickChatSettings: Promise<() => void> | null = null;
  let registeredQuickChatShortcut: string | null = null;
  let quickWindowTransition: Promise<void> = Promise.resolve();
  let defaultChatModelSaveQueue: Promise<void> = Promise.resolve();
  let modelReasoningEffortSaveQueue: Promise<void> = Promise.resolve();
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

  let modelOptions = $derived.by(() =>
    (config?.providers ?? [])
      .filter((provider) => provider.enabled)
      .flatMap((provider) =>
        provider.models.map((model) => ({
          value: encodeModelBinding(provider.id, model),
          label: `${model} · ${provider.name}`,
          selectedLabel: model,
        })),
      ),
  );

  let selectedModelProvider = $derived.by(() => {
    const binding = decodeModelBinding(selectedModel);
    if (!binding) return null;
    return config?.providers.find((provider) => provider.id === binding.providerId) ?? null;
  });
  let selectedReasoningEffort = $derived.by(() => {
    const binding = decodeModelBinding(selectedModel);
    if (!binding || !selectedModelProvider) return "medium" as ReasoningEffort;
    return (selectedModelProvider.model_reasoning_efforts?.[binding.model] ??
      "medium") as ReasoningEffort;
  });
  let selectedModelSupportsReasoning = $derived(selectedModelProvider?.provider === "chatgpt");

  let quickRoleOptions = $derived([
    {
      value: defaultRoleKey,
      label: $t("defaultRoleName"),
      description: $t("defaultRoleDescription"),
    },
    ...quickChatRoles.map((role) => ({
      value: role.id,
      label: role.name,
      description: role.description,
    })),
  ]);

  let quickWorkspaceOptions = $derived.by(() => {
    const options = [
      ...(quickChatWorkspace
        ? [
            {
              value: quickChatWorkspace,
              label:
                recentWorkspaces.find((recent) => recent.path === quickChatWorkspace)?.name ??
                quickChatWorkspace.split(/[/\\]/).filter(Boolean).pop() ??
                quickChatWorkspace,
              description: quickChatWorkspace,
            },
          ]
        : []),
      ...recentWorkspaces.map((recent) => ({
        value: recent.path,
        label: recent.name,
        description: recent.path,
      })),
    ];
    return options.filter(
      (option, index) =>
        options.findIndex((candidate) => candidate.value === option.value) === index,
    );
  });

  let currentNavigationLocation = $derived.by<AppNavigationLocation>(() => ({
    workspacePath,
    surface: designOpen
      ? "design"
      : draftsOpen
        ? "drafts"
        : memoryOpen
          ? "memory"
          : rolesOpen
            ? "roles"
            : skillsOpen
              ? "skills"
              : settingsOpen
                ? "settings"
                : "chat",
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
      isBookModePreview ||
      isWorkspaceSwitcherPreview ||
      isCommandPalettePreview ||
      isPauseControlPreview ||
      isReasoningEffortPreview ||
      isPermissionSettingsPreview ||
      isChannelsSettingsPreview ||
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
    if (!config) return;
    const fallback = encodeModelBinding(
      config.defaults.chat_model.provider_id,
      config.defaults.chat_model.model,
    );
    const nextSelectedModel = modelOptions.some((option) => option.value === fallback)
      ? fallback
      : (modelOptions[0]?.value ?? "");
    if (selectedModel !== nextSelectedModel) selectedModel = nextSelectedModel;
  });

  function updateDefaultChatModel(binding: DefaultModelBinding) {
    if (!config) return;
    config = {
      ...config,
      defaults: {
        ...config.defaults,
        chat_model: binding,
      },
    };
  }

  function handleModelChange(value: string) {
    const binding = decodeModelBinding(value);
    if (!binding || !config) return;
    if (
      config.defaults.chat_model.provider_id === binding.providerId &&
      config.defaults.chat_model.model === binding.model
    ) {
      return;
    }

    const requestedBinding: DefaultModelBinding = {
      provider_id: binding.providerId,
      model: binding.model,
    };
    updateDefaultChatModel(requestedBinding);
    if (!tauriAvailable) return;

    defaultChatModelSaveQueue = defaultChatModelSaveQueue.then(async () => {
      try {
        const savedBinding = await invoke<DefaultModelBinding>("set_default_chat_model", {
          binding: requestedBinding,
        });
        if (selectedModel === value) updateDefaultChatModel(savedBinding);
      } catch (error) {
        console.error("Failed to save default chat model:", error);
        if (selectedModel === value) {
          await loadSettings();
          alert(`Save failed: ${error}`);
        }
      }
    });
  }

  function updateModelReasoningEffort(providerId: string, model: string, effort: ReasoningEffort) {
    if (!config) return;
    config = {
      ...config,
      providers: config.providers.map((provider) =>
        provider.id === providerId
          ? {
              ...provider,
              model_reasoning_efforts: {
                ...(provider.model_reasoning_efforts ?? {}),
                [model]: effort,
              },
            }
          : provider,
      ),
    };
  }

  function handleReasoningEffortChange(effort: ReasoningEffort) {
    const binding = decodeModelBinding(selectedModel);
    if (!binding || selectedModelProvider?.provider !== "chatgpt") return;
    updateModelReasoningEffort(binding.providerId, binding.model, effort);
    if (!tauriAvailable) return;

    const requestedModel = selectedModel;
    modelReasoningEffortSaveQueue = modelReasoningEffortSaveQueue.then(async () => {
      try {
        const savedEffort = await invoke<ReasoningEffort>("set_model_reasoning_effort", {
          providerId: binding.providerId,
          model: binding.model,
          effort,
        });
        if (selectedModel === requestedModel) {
          updateModelReasoningEffort(binding.providerId, binding.model, savedEffort);
        }
      } catch (error) {
        console.error("Failed to save model reasoning effort:", error);
        if (selectedModel === requestedModel) {
          await loadSettings();
          showToast({ title: String(error), variant: "error" });
        }
      }
    });
  }

  // Streaming state for the currently visible conversation
  let isCurrentStreaming = $derived(activeConvId ? !!streamingConvIds[activeConvId] : false);
  let isCurrentStreamPaused = $derived(activeConvId ? !!streamPausedConvIds[activeConvId] : false);
  let currentStreamItems = $derived(activeConvId ? (convStreamItems[activeConvId] ?? []) : []);
  let currentStreamMessageId = $derived(
    activeConvId ? (streamAssistantMsgIds[activeConvId] ?? null) : null,
  );
  let isCurrentAwaitingStreamOutput = $derived(
    activeConvId ? !!awaitingStreamOutputConvIds[activeConvId] : false,
  );
  let currentMemoryRetrievalStage = $derived(
    activeConvId ? (memoryRetrievalStages[activeConvId] ?? null) : null,
  );
  let currentMemoryRetrievalCanSkip = $derived(
    activeConvId ? !!memoryRetrievalSkippableConvIds[activeConvId] : false,
  );
  const compactionOnlyConvIds = new Set<string>();
  let workspacePrefsSaveQueue: Promise<void> = Promise.resolve();

  function startStreamTiming(convId: string, startedAt = Date.now()) {
    clearAwaitingStreamOutput(convId);
    clearMemoryRetrievalStage(convId);
    streamStartedAt = { ...streamStartedAt, [convId]: startedAt };
    const { [convId]: _firstTokenAt, ...rest } = streamFirstTokenAt;
    streamFirstTokenAt = rest;
  }

  function recordFirstToken(convId: string, text: string) {
    if (!text || streamFirstTokenAt[convId]) return;
    streamFirstTokenAt = { ...streamFirstTokenAt, [convId]: Date.now() };
  }

  function clearAwaitingStreamOutput(convId: string) {
    if (!awaitingStreamOutputConvIds[convId]) return;
    const { [convId]: _awaiting, ...rest } = awaitingStreamOutputConvIds;
    awaitingStreamOutputConvIds = rest;
  }

  function clearMemoryRetrievalStage(convId: string) {
    const { [convId]: _stage, ...rest } = memoryRetrievalStages;
    const { [convId]: _skippable, ...restSkippable } = memoryRetrievalSkippableConvIds;
    memoryRetrievalStages = rest;
    memoryRetrievalSkippableConvIds = restSkippable;
  }

  function applyStreamMutation(convId: string, mutate: (items: StreamItem[]) => StreamItem[]) {
    const items = mutate(convStreamItems[convId] ?? []);
    convStreamItems = { ...convStreamItems, [convId]: items };
    persistStreamDraft(convId).catch(() => {});
    if (convId === activeConvId) void scrollStreamToBottom();
  }

  let currentFileChanges = $derived.by(() => {
    const persisted = activeConvId ? (fileChangesPerConv[activeConvId] ?? []) : [];
    const live = activeConvId ? (liveFileChangesPerConv[activeConvId] ?? []) : [];
    const all = [
      ...persisted,
      ...live.filter((change) => !persisted.some((saved) => saved.id === change.id)),
    ];
    // Restrict to checkpoints that belong to the currently active branch tail.
    // Without this filter, file changes from sibling branches would leak into the banner.
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

  async function loadMessagesForConv(convId: string, showLoadingState = true): Promise<void> {
    if (loadedConvIds.has(convId)) return;
    loadedConvIds.add(convId);
    if (!tauriAvailable) return;
    const messageIdsAtStart = showLoadingState
      ? undefined
      : new Set(
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

  async function hydrateConversation(
    convId: string,
    checkpoints: StartupConversationBundle["checkpoints"],
    savedTip: string | null,
    branches: Array<{ id: string; head_checkpoint_id: string | null }>,
    syncBackendHistory: boolean,
    messageIdsAtStart?: ReadonlySet<string>,
  ): Promise<void> {
    let tree = buildTreeFromCheckpoints(checkpoints, convTrees[convId]);
    if (savedTip) tree = selectActivePathToCheckpoint(tree, savedTip);
    if (savedTip) {
      const activeBranch = branches.find((branch) => branch.head_checkpoint_id === savedTip);
      if (activeBranch) {
        activeBranchIds = { ...activeBranchIds, [convId]: activeBranch.id };
      }
    }
    convTrees = { ...convTrees, [convId]: tree };
    const hydratedMessages = restorePendingUserInputFromCheckpoint(
      convId,
      computeActivePath(tree),
      checkpoints,
    );
    const idx = conversations.findIndex((conversation) => conversation.id === convId);
    if (idx !== -1) {
      const visible = conversations[idx].messages;
      const msgs = preserveMessagesAddedDuringHydration(
        visible,
        hydratedMessages,
        messageIdsAtStart,
      );
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
  ): ChatMessage[] {
    const assistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.checkpointId);
    if (!assistant?.checkpointId) return messages;

    const checkpoint = checkpoints.find(
      ({ meta }) => meta.checkpoint_id === assistant.checkpointId,
    );
    if (!checkpoint) return messages;
    const requests = pendingUserInputRequestsFromCheckpoint(convId, checkpoint);
    if (requests.length === 0) return messages;

    pendingUserInputs = { ...pendingUserInputs, [convId]: requests[0] };
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
    return restored;
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
   * event to `convStreamItems` loses the next form until a full refresh. */
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
      const existing =
        branches.find((branch) => branch.head_checkpoint_id === tip) ?? branches.at(-1);
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

  async function loadFileChangesForConv(convId: string): Promise<boolean> {
    if (!tauriAvailable) return false;
    try {
      const changes = await fetchFileChanges(convId);
      fileChangesPerConv = { ...fileChangesPerConv, [convId]: changes };
      return true;
    } catch {
      return false;
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
    const convId = activeConvId;
    if (!convId || resolvingUserInputIds[requestId] || resolvingUserInputConvIds[convId]) return;
    resolvingUserInputIds = { ...resolvingUserInputIds, [requestId]: true };
    resolvingUserInputConvIds = { ...resolvingUserInputConvIds, [convId]: true };
    try {
      if (convId) {
        const assistantMessageId = crypto.randomUUID();
        startStreamTiming(convId);
        streamingConvIds = { ...streamingConvIds, [convId]: true };
        // The approved card stays in the durable message list. Only output
        // produced after the resume belongs to this new stream message.
        convStreamItems = { ...convStreamItems, [convId]: [] };
        streamAssistantMsgIds = { ...streamAssistantMsgIds, [convId]: assistantMessageId };
        // The resume command spans the entire follow-up provider stream. Show
        // the answer immediately instead of leaving the editable form mounted.
        markUserInputResolved(convId, requestId, "answered", { values });
        await openAgent.resumeInterrupt({
          convId,
          interruptId: requestId,
          response: JSON.stringify({ values }),
          branchId: activeBranchIds[convId] ?? null,
          assistantMessageId,
        });
        clearPendingInput(convId, requestId);
      }
    } catch (err) {
      console.warn("resume_interrupted_chat failed", err);
      if (convId) {
        markUserInputResolved(convId, requestId, "pending", undefined);
        cleanupStreamState(convId);
      }
    } finally {
      const { [requestId]: _resolved, ...rest } = resolvingUserInputIds;
      resolvingUserInputIds = rest;
      const { [convId]: _conversation, ...remainingConversations } = resolvingUserInputConvIds;
      resolvingUserInputConvIds = remainingConversations;
    }
  }

  async function cancelUserInput(requestId: string) {
    const convId = activeConvId;
    const response = { cancelled: true };
    if (!convId || resolvingUserInputIds[requestId] || resolvingUserInputConvIds[convId]) return;
    resolvingUserInputIds = { ...resolvingUserInputIds, [requestId]: true };
    resolvingUserInputConvIds = { ...resolvingUserInputConvIds, [convId]: true };
    try {
      if (convId) {
        const assistantMessageId = crypto.randomUUID();
        startStreamTiming(convId);
        streamingConvIds = { ...streamingConvIds, [convId]: true };
        convStreamItems = { ...convStreamItems, [convId]: [] };
        streamAssistantMsgIds = { ...streamAssistantMsgIds, [convId]: assistantMessageId };
        markUserInputResolved(convId, requestId, "cancelled", response);
        await openAgent.resumeInterrupt({
          convId,
          interruptId: requestId,
          response: JSON.stringify(response),
          branchId: activeBranchIds[convId] ?? null,
          assistantMessageId,
        });
        clearPendingInput(convId, requestId);
      }
    } catch (err) {
      console.warn("cancel user input failed", err);
      if (convId) {
        markUserInputResolved(convId, requestId, "pending", undefined);
        cleanupStreamState(convId);
      }
    } finally {
      const { [requestId]: _resolved, ...rest } = resolvingUserInputIds;
      resolvingUserInputIds = rest;
      const { [convId]: _conversation, ...remainingConversations } = resolvingUserInputConvIds;
      resolvingUserInputConvIds = remainingConversations;
    }
  }

  function markUserInputResolved(
    convId: string,
    requestId: string,
    state: "pending" | "answered" | "cancelled",
    response: unknown,
  ) {
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
  ) {
    if (streamingConvIds[convId] || !tauriAvailable) return;
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
    const text = (newText ?? userMsg.content).trim();
    if (!text && sourceAttachments.length === 0) return;
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

    try {
      await invoke("rollback_to_checkpoint", { convId, checkpointId });
    } catch {
      return;
    }

    // Revert file changes belonging to checkpoints being rolled back.
    // Keep the SQLite records so switching back later can replay them.
    const cutMsgs = conv.messages.slice(userMsgIdx);
    const rolledBackCps = new Set(
      cutMsgs.filter((m) => m.role === "assistant" && m.checkpointId).map((m) => m.checkpointId!),
    );
    const allChanges = fileChangesPerConv[convId] ?? [];
    const toRevert = allChanges.filter((fc) => rolledBackCps.has(fc.checkpoint_id));
    for (const change of [...toRevert].reverse()) {
      await invoke("revert_file_change_keep", { changeId: change.id }).catch(() => {});
    }

    conversations[convIdx] = {
      ...conv,
      messages: conv.messages.slice(0, userMsgIdx),
      updatedAt: Date.now(),
    };

    // Tell finalize: attach the new turn as a sibling under newSiblingParentCk.
    pendingParentCk = { ...pendingParentCk, [convId]: newSiblingParentCk };
    pendingForkMessageId = { ...pendingForkMessageId, [convId]: userMsg.id };
    inputText = text;
    inputAttachments = resendAttachments;
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
    if (streamingConvIds[convId]) return;
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
      const newTreeView: ConvTree = { ...tree, activeChild: override };
      const newPath = computeActivePath(newTreeView);
      const targetTipCheckpoint = [...newPath]
        .reverse()
        .find((m) => m.role === "assistant" && m.checkpointId)?.checkpointId;
      await invoke("restore_agent_history", {
        convId,
        checkpointId: targetTipCheckpoint ?? null,
      }).catch((e) => console.warn("restore_agent_history failed", e));
    }

    const updatedTree: ConvTree = { ...tree, activeChild: override };
    let branchMessages = computeActivePath(updatedTree);
    if (tauriAvailable) {
      // A branch switch rebuilds messages from checkpoint records. Re-project a
      // pending ask_user from the selected tip's tool_use plus interrupt state,
      // just as a full conversation load does.
      const checkpoints = await fetchRenderableCheckpoints(convId).catch(() => []);
      branchMessages = restorePendingUserInputFromCheckpoint(convId, branchMessages, checkpoints);
    }
    const savedTip = [...branchMessages]
      .reverse()
      .find((message) => message.role === "assistant" && message.checkpointId)?.checkpointId;
    if (tauriAvailable && savedTip) {
      // Do not expose an approval card until its durable selected tip and
      // branch id are aligned. The resume command uses these values to reject
      // approvals aimed at a different branch.
      await invoke("set_active_branch_tip", { convId, checkpointId: savedTip });
      const branches = await invoke<Array<{ id: string; head_checkpoint_id: string | null }>>(
        "get_branches",
        { convId },
      ).catch(() => []);
      const branch = branches.find((item) => item.head_checkpoint_id === savedTip);
      if (branch) activeBranchIds = { ...activeBranchIds, [convId]: branch.id };
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
  ) {
    const text = newText.trim();
    if (!text && attachments.length === 0) return;
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return;
    const userMsg = conv.messages[userMsgIdx];
    if (!userMsg || userMsg.role !== "user") return;
    const assistantMsg = conv.messages[userMsgIdx + 1];
    if (!assistantMsg?.checkpointId) return;
    await reExecuteMsg(convId, userMsgIdx + 1, text, attachments);
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

  function persistQuickChatPreferences(): void {
    if (typeof window === "undefined") return;
    saveQuickChatPreferences(window.localStorage, {
      model: quickChatModel,
      role: quickChatRole,
      workspace: quickChatWorkspace,
    });
  }

  async function loadQuickChatRoles(workspace: string): Promise<void> {
    if (!tauriAvailable) {
      quickChatRoles = [];
      quickChatRole = defaultRoleKey;
      return;
    }
    quickChatRoles = await invoke<AgentRole[]>("list_agent_roles_for_workspace", {
      workspace,
    }).catch(() => []);
    if (
      quickChatRole !== defaultRoleKey &&
      !quickChatRoles.some((role) => role.id === quickChatRole)
    ) {
      quickChatRole = defaultRoleKey;
    }
  }

  async function initializeQuickChatSurface(): Promise<void> {
    await loadSettings();
    const preferences = loadQuickChatPreferences(window.localStorage);
    const fallbackModel = config
      ? encodeModelBinding(config.defaults.chat_model.provider_id, config.defaults.chat_model.model)
      : "";
    quickChatModel = resolveQuickChatModel(
      preferences.model,
      fallbackModel,
      modelOptions.map((option) => option.value),
    );
    quickChatWorkspace =
      preferences.workspace || config?.workspace || recentWorkspaces[0]?.path || "";
    if (!quickChatWorkspace && tauriAvailable) quickChatWorkspace = await homeDir();
    quickChatRole = preferences.role || defaultRoleKey;
    await loadQuickChatRoles(quickChatWorkspace);
    persistQuickChatPreferences();
    initialLoading = false;
  }

  async function reloadQuickChatSettings(): Promise<void> {
    const preferredModel = quickChatModel;
    await loadSettings();
    const fallbackModel = config
      ? encodeModelBinding(config.defaults.chat_model.provider_id, config.defaults.chat_model.model)
      : "";
    quickChatModel = resolveQuickChatModel(
      preferredModel,
      fallbackModel,
      modelOptions.map((option) => option.value),
    );
    persistQuickChatPreferences();
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

  async function handleRolesChanged(): Promise<void> {
    const previousRoleKey = selectedRoleKey;
    await loadAvailableRoles();
    if (selectedRoleKey === previousRoleKey) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(roleSelectionStorageKey(), selectedRoleKey);
    }
    restoringSurface = "new-conversation";
    activeConvId = null;
    cacheRestoreSurface("new-conversation", null);
    await reloadRoleConversations();
    await invoke("set_active_conversation", {
      convId: null,
      workspace: workspacePath || "",
    }).catch(() => {});
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
          workspacePath || null,
          searchConversationNextCursor,
          30,
          query,
          true,
          selectedRoleId,
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
        const page = await fetchConversationPage(
          workspacePath || null,
          null,
          30,
          normalized,
          true,
          selectedRoleId,
        );
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
    if (isDevInspectorWindow) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if ((config?.theme ?? "system") === "system") applyTheme("system");
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  });

  onMount(async () => {
    if (isDevInspectorWindow) return;
    if (isQuickChatSurface) {
      if (isQuickChatWindow) document.documentElement.classList.add("quick-chat-window");
      await initializeQuickChatSurface();
      if (isQuickChatWindow && tauriAvailable) {
        unlistenQuickChatSettings = listen("settings-changed", () => {
          void reloadQuickChatSettings();
        });
      }
      return;
    }
    const mountedAt = performance.now();
    let bootstrapReadyAt = mountedAt;
    let startupApplied = false;
    try {
      // Seed isDarkTheme before settings load so shikiTheme is correct from first render
      isDarkTheme = window.matchMedia("(prefers-color-scheme: dark)").matches;

      if (tauriAvailable) {
        // Register chat events before bootstrap. If one legacy conversation
        // cannot be restored, the fallback surface must still receive stream
        // chunks and terminal events for newly submitted turns.
        await setupGlobalEventListeners();
        const bootstrap = await invoke<StartupBootstrap>("get_startup_bootstrap");
        bootstrapReadyAt = performance.now();
        await applyStartupBootstrap(bootstrap);
        startupApplied = true;
        installDownloadHook();
        if (launchContext?.conversation_id) {
          await revealMemorySource(launchContext.conversation_id, launchContext.message_id ?? "");
        }
      } else {
        await loadSettings();
        await loadWorkspace();
        if (isChannelsSettingsPreview) {
          SettingsView = (await import("$lib/components/SettingsView.svelte")).default;
          settingsInitialNav = "channels";
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
      }
    } finally {
      if (config && !isChannelsSettingsPreview && !hasCompletedOnboarding()) onboardingOpen = true;
      const uiReadyAt = performance.now();
      initialLoading = false;
      await tick();
      if (tauriAvailable) {
        await invoke("reveal_main_window").catch(async () => {
          await getCurrentWindow()
            .show()
            .catch(() => {});
        });
        const revealedAt = performance.now();
        console.info("[startup] main window revealed", {
          bootstrapMs: Math.round(bootstrapReadyAt - mountedAt),
          applyAndListenersMs: Math.round(uiReadyAt - bootstrapReadyAt),
          revealMs: Math.round(revealedAt - uiReadyAt),
          mountedToVisibleMs: Math.round(revealedAt - mountedAt),
        });
      }
    }

    void loadNewConversationMemories();
    if (tauriAvailable) {
      void invoke<AgentCommandSpec[]>("get_agent_commands")
        .then((commandSpecs) => {
          agentCommandSpecs = commandSpecs;
        })
        .catch(() => {});
      pollMemoryStatus();
      if (!launchContext?.workspace) {
        void initializeTray();
        void initializeQuickChatShortcut().catch((error) => {
          console.warn("Failed to register quick chat shortcut", error);
        });
        void checkForAppUpdate();
      }
      if (!startupApplied && launchContext?.conversation_id) {
        void openMemorySource(launchContext.conversation_id, launchContext.message_id ?? "");
      }
    }
  });

  // ─── Global event listeners (set up once, route by conv_id) ──────────────────

  async function applyStartupBootstrap(bootstrap: StartupBootstrap) {
    config = normalizeConfigShape(bootstrap.config);
    applyTheme(config.theme ?? "system");
    await initI18n(config.language);
    workspacePath = bootstrap.workspace_path;
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
      streamingConvIds[convId] && streamAssistantMsgIds[convId] === assistantMessageId;
    if (!isSameRun) {
      convStreamItems = { ...convStreamItems, [convId]: [] };
      streamAssistantMsgIds = { ...streamAssistantMsgIds, [convId]: assistantMessageId };
      startStreamTiming(convId, startedAt);
    }
    streamingConvIds = { ...streamingConvIds, [convId]: true };
    awaitingStreamOutputConvIds = { ...awaitingStreamOutputConvIds, [convId]: true };
    if (config?.memory_retrieval_enabled) {
      memoryRetrievalStages = {
        ...memoryRetrievalStages,
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

    const eventRoleKey = event.role_id ?? defaultRoleKey;
    if (event.conv_id === activeConvId && eventRoleKey !== selectedRoleKey) {
      selectedRoleKey = eventRoleKey;
      window.localStorage.setItem(roleSelectionStorageKey(), eventRoleKey);
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

    register<{
      workspace: string | null;
      conversation_id: string | null;
      message_id: string | null;
    }>("workspace-window-open-request", (event) => {
      const { conversation_id, message_id } = event.payload;
      if (conversation_id) {
        void revealMemorySource(conversation_id, message_id ?? "");
      }
    });

    register<{ visible: boolean }>(DEV_MAIN_DEBUG_VISIBILITY_EVENT, (event) => {
      showMainDebugComponents = event.payload.visible;
    });
    register(ONBOARDING_OPEN_EVENT, () => {
      if (config) onboardingOpen = true;
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
          setLocale((config.language ?? "zh") as Locale);
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
      const idx = conversations.findIndex((conversation) => conversation.id === conv_id);
      if (idx === -1 || !title.trim()) return;
      conversations[idx] = { ...conversations[idx], title, updatedAt: Date.now() };
    });

    register<{
      task_kind: "title" | "memory" | "hook" | string;
      conv_id?: string | null;
      error: string;
    }>("flash-task-failed", (e) => {
      const taskLabel = {
        title: $t("flashTaskTitle"),
        memory: $t("flashTaskMemory"),
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

    register<{ workspace: string; reminder: string }>("memory-homepage-reminder-updated", (e) => {
      const { workspace: reminderWorkspace, reminder } = e.payload;
      if ((reminderWorkspace || "") !== (workspacePath || "")) return;
      const value = reminder.trim();
      const key = homepageReminderStorageKey(workspacePath, config?.language ?? "zh");
      newConversationGeneratedReminder = value || null;
      if (value) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
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

      if (streamingConvIds[source_conv_id]) {
        const { [source_conv_id]: _old, ...rest } = streamingConvIds;
        streamingConvIds = { ...rest, [conv_id]: true };
      }
      if (source_conv_id in convStreamItems) {
        const { [source_conv_id]: old, ...rest } = convStreamItems;
        convStreamItems = { ...rest, [conv_id]: old };
      }
      if (source_conv_id in streamAssistantMsgIds) {
        const { [source_conv_id]: old, ...rest } = streamAssistantMsgIds;
        streamAssistantMsgIds = { ...rest, [conv_id]: old };
      }
      if (source_conv_id in awaitingStreamOutputConvIds) {
        const { [source_conv_id]: old, ...rest } = awaitingStreamOutputConvIds;
        awaitingStreamOutputConvIds = { ...rest, [conv_id]: old };
      }
      if (source_conv_id in memoryRetrievalStages) {
        const { [source_conv_id]: old, ...rest } = memoryRetrievalStages;
        memoryRetrievalStages = { ...rest, [conv_id]: old };
      }
      if (source_conv_id in memoryRetrievalSkippableConvIds) {
        const { [source_conv_id]: old, ...rest } = memoryRetrievalSkippableConvIds;
        memoryRetrievalSkippableConvIds = { ...rest, [conv_id]: old };
      }
      if (compactionOnlyConvIds.has(source_conv_id)) {
        compactionOnlyConvIds.delete(source_conv_id);
        compactionOnlyConvIds.add(conv_id);
      }
      if (activeConvId === source_conv_id) {
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
      streamingConvIds = { ...streamingConvIds, [sub_conv_id]: true };
      convStreamItems = { ...convStreamItems, [sub_conv_id]: [] };
      streamAssistantMsgIds = {
        ...streamAssistantMsgIds,
        [sub_conv_id]: asst_msg_id ?? crypto.randomUUID(),
      };
      if (branch_id) {
        activeBranchIds = { ...activeBranchIds, [sub_conv_id]: branch_id };
      }
      startStreamTiming(sub_conv_id, taskMsg.timestamp);
    });

    // ask_user tool: backend emits with conv_id + form schema; we stash it per-conv
    // so switching convs doesn't lose an in-flight form.
    register<UserInputRequest>("chat-user-input-request", (e) => {
      const req = e.payload;
      const key = req.conv_id ?? activeConvId;
      if (!key) return;
      pendingUserInputs = { ...pendingUserInputs, [key]: req };
      if (!attachPendingUserInputToMessages(key, req)) {
        convStreamItems = {
          ...convStreamItems,
          [key]: appendUserInput(convStreamItems[key] ?? [], req),
        };
      }
      persistStreamDraft(key).catch(() => {});
      if (key === activeConvId) scrollStreamToBottom();
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
      streamingConvIds = { ...streamingConvIds, [conv_id]: true };
      convStreamItems = { ...convStreamItems, [conv_id]: [] };
      streamAssistantMsgIds = {
        ...streamAssistantMsgIds,
        [conv_id]: asst_msg_id ?? crypto.randomUUID(),
      };
      startStreamTiming(conv_id, Date.now());
      if (conv_id === activeConvId) scrollStreamToBottom();
    });

    register<{
      conv_id: string;
      kind: string;
      status: string;
    }>("goal-run-updated", (e) => {
      const { conv_id, kind, status } = e.payload;
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
        if (!streamingConvIds[conv_id]) {
          recoverUnannouncedChatStream(conv_id);
        }
        clearMemoryRetrievalStage(conv_id);
        const items = convStreamItems[conv_id] ?? [];
        const hasStreamOutput = items.some(
          (item) =>
            item.type === "text" ||
            item.type === "thinking" ||
            (item.type === "retry" &&
              item.items.some((nested) => nested.type === "text" || nested.type === "thinking")),
        );
        if (!hasStreamOutput && streamingConvIds[conv_id]) {
          awaitingStreamOutputConvIds = {
            ...awaitingStreamOutputConvIds,
            [conv_id]: true,
          };
          if (conv_id === activeConvId) scrollStreamToBottom();
        }
      },
      onMemoryRetrieval: (conv_id, stage) => {
        if (!streamingConvIds[conv_id]) {
          recoverUnannouncedChatStream(conv_id);
        }
        clearAwaitingStreamOutput(conv_id);
        memoryRetrievalStages = { ...memoryRetrievalStages, [conv_id]: stage };
        memoryRetrievalSkippableConvIds = {
          ...memoryRetrievalSkippableConvIds,
          [conv_id]: stage !== "completed" && stage !== "skipped",
        };
        if (conv_id === activeConvId) scrollStreamToBottom();
      },
      onChunk: (conv_id, text) => {
        if (text) clearAwaitingStreamOutput(conv_id);
        if (text) clearMemoryRetrievalStage(conv_id);
        recordFirstToken(conv_id, text);
        applyStreamMutation(conv_id, (items) => appendChunk(items, text));
      },
      onThinkingChunk: (conv_id, text) => {
        if (text) clearAwaitingStreamOutput(conv_id);
        if (text) clearMemoryRetrievalStage(conv_id);
        applyStreamMutation(conv_id, (items) => appendThinkingChunk(items, text));
      },
      onToolCall: (conv_id, name, args, toolUseId) => {
        let items = appendToolCall(convStreamItems[conv_id] ?? [], name, args, toolUseId);
        const pendingInput = pendingUserInputs[conv_id];
        if (pendingInput?.kind === "tool_approval") {
          items = appendUserInput(items, pendingInput);
        }
        convStreamItems = {
          ...convStreamItems,
          [conv_id]: items,
        };
        persistStreamDraft(conv_id).catch(() => {});
        if (conv_id === activeConvId) scrollStreamToBottom();
      },
      onToolResult: (conv_id, result, toolUseId) => {
        const pendingToolCall = toolUseId
          ? (convStreamItems[conv_id] ?? []).find(
              (item) =>
                item.type === "tool_call" &&
                item.toolUseId === toolUseId &&
                item.result === undefined,
            )
          : [...(convStreamItems[conv_id] ?? [])]
              .reverse()
              .find((item) => item.type === "tool_call" && item.result === undefined);
        const rolesMayHaveChanged =
          pendingToolCall?.type === "tool_call" && pendingToolCall.name === "dispatch_role";
        if (attachApprovedToolResult(conv_id, result, toolUseId)) {
          if (rolesMayHaveChanged) void loadAvailableRoles();
          return;
        }
        convStreamItems = {
          ...convStreamItems,
          [conv_id]: attachToolResult(convStreamItems[conv_id] ?? [], result, toolUseId),
        };
        if (rolesMayHaveChanged) void loadAvailableRoles();
        persistStreamDraft(conv_id).catch(() => {});
        if (conv_id === activeConvId) scrollStreamToBottom();
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
      },
      onRetry: (conv_id, attempt, maxAttempts, model, error, restoredCheckpoint) => {
        clearAwaitingStreamOutput(conv_id);
        const items = convStreamItems[conv_id] ?? [];
        const previousAttempts = items.filter((item) => item.type === "retry");
        const failedAttemptItems = items.filter((item) => item.type !== "retry");
        convStreamItems = {
          ...convStreamItems,
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
      onCompactionProgress: (conv_id, stage, error) => {
        const wasStreaming = !!streamingConvIds[conv_id];
        const previousItems = convStreamItems[conv_id] ?? [];
        const hadProgress = previousItems.some((item) => item.type === "compaction");
        const items = appendCompactionProgress(previousItems, stage, error);
        convStreamItems = { ...convStreamItems, [conv_id]: items };
        if (!wasStreaming && !["done", "skipped", "failed"].includes(stage)) {
          compactionOnlyConvIds.add(conv_id);
          streamingConvIds = { ...streamingConvIds, [conv_id]: true };
          streamAssistantMsgIds = { ...streamAssistantMsgIds, [conv_id]: crypto.randomUUID() };
        }
        if (["done", "skipped", "failed"].includes(stage) && compactionOnlyConvIds.has(conv_id)) {
          setTimeout(
            () => {
              compactionOnlyConvIds.delete(conv_id);
              cleanupStreamState(conv_id);
            },
            stage === "failed" ? 1600 : 400,
          );
        } else if (stage === "failed") {
          setTimeout(() => {
            convStreamItems = {
              ...convStreamItems,
              [conv_id]: appendCompactionProgress(convStreamItems[conv_id] ?? [], "done", null),
            };
          }, 1600);
        }
        if (
          conv_id === activeConvId &&
          !hadProgress &&
          items.some((item) => item.type === "compaction")
        ) {
          scrollStreamToBottom();
        }
      },
      onDone: (conv_id, asstMsgId, error) => {
        finalizeStreamedMessage(conv_id, false, asstMsgId, error);
      },
      onInterrupted: (conv_id) => {
        finalizeStreamedMessage(conv_id, false);
        // The live `chat-user-input-request` event has already attached the
        // next approval to its tool card. Do not re-project the complete
        // checkpoint here: replacing the conversation while the user clicks
        // through approvals causes a visible flash. Checkpoint loading remains
        // the recovery path when opening a conversation or restoring a view.
      },
      onCancelled: (conv_id) => {
        finalizeStreamedMessage(conv_id, true);
      },
    });
    await Promise.all([...registrations, chatEventRegistration]);
  }

  // Insert a freshly-finalized turn into the tree, then update the active path so the
  // newly-streamed variant is visible (and any in-place user-msg copy gets its checkpointId).
  function attachNewTurnToTree(conv_id: string, ckId: string, assistantMsg: ChatMessage) {
    const convIdx = conversations.findIndex((c) => c.id === conv_id);
    if (convIdx === -1) return;
    const visibleMsgs = conversations[convIdx].messages;
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
      conversations[convIdx] = { ...conversations[convIdx], messages: stamped };
    }

    // The checkpoint is the sole durable source for a compaction boundary.
    // Reload after a turn so its tagged system boundary is rendered in
    // chronological order, instead of manufacturing a boundary in the stream.
    loadedConvIds.delete(conv_id);
    // Reconcile the optimistic turn with its durable checkpoint without
    // replacing the visible transcript with the conversation-loading skeleton.
    void loadMessagesForConv(conv_id, false);
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

  function cleanupStreamState(conv_id: string) {
    const { [conv_id]: _items, ...restItems } = convStreamItems;
    const { [conv_id]: _streaming, ...restStreaming } = streamingConvIds;
    const { [conv_id]: _paused, ...restPaused } = streamPausedConvIds;
    const { [conv_id]: _asstId, ...restAsstIds } = streamAssistantMsgIds;
    const { [conv_id]: _startedAt, ...restStartedAt } = streamStartedAt;
    const { [conv_id]: _firstTokenAt, ...restFirstTokenAt } = streamFirstTokenAt;
    const { [conv_id]: _awaiting, ...restAwaiting } = awaitingStreamOutputConvIds;
    const { [conv_id]: _memoryStage, ...restMemoryStages } = memoryRetrievalStages;
    const { [conv_id]: _memorySkippable, ...restMemorySkippable } = memoryRetrievalSkippableConvIds;
    convStreamItems = restItems;
    streamingConvIds = restStreaming;
    streamPausedConvIds = restPaused;
    streamAssistantMsgIds = restAsstIds;
    streamStartedAt = restStartedAt;
    streamFirstTokenAt = restFirstTokenAt;
    awaitingStreamOutputConvIds = restAwaiting;
    memoryRetrievalStages = restMemoryStages;
    memoryRetrievalSkippableConvIds = restMemorySkippable;
  }

  function saveAssistantMessage(conv_id: string, msg: ChatMessage, checkpointId: string | null) {
    queueSaveChatMessage(conv_id, msg, checkpointId).catch(() => {});
  }

  function discardPersistedStreamDraft(conv_id: string) {
    void conv_id;
  }

  function finalizeStreamedMessage(
    conv_id: string,
    aborted: boolean,
    asstMsgId?: string,
    error?: string | null,
  ) {
    beginStreamCompletionTailAnchor(conv_id);
    let items = convStreamItems[conv_id] ?? [];
    if (error) {
      items = [...items, { type: "runtime_notice", kind: "error", reason: error }];
    } else if (aborted) {
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
      void loadFileChangesForConv(conv_id).then((loaded) => {
        if (loaded) clearLiveFileChanges(conv_id, finalizedLiveChangeIds);
      });
      cleanupStreamState(conv_id);
      void dispatchNextQueuedMessage(conv_id);
      return;
    }

    const checkpointId = pendingCheckpointIds[conv_id] ?? null;

    const completedAt = Date.now();
    const assistantMsg: ChatMessage = {
      id: asstMsgId ?? streamAssistantMsgIds[conv_id] ?? crypto.randomUUID(),
      role: "assistant",
      content: fullText,
      timestamp: completedAt,
      items: items.length > 0 ? [...items] : undefined,
      aborted: aborted || undefined,
      checkpointId: checkpointId ?? undefined,
      firstTokenAt: streamFirstTokenAt[conv_id],
      completedAt,
    };

    const convIdx = conversations.findIndex((c) => c.id === conv_id);
    if (convIdx === -1) {
      // Conv was deleted while streaming — drop the in-flight message instead of saving an orphan row.
      const { [conv_id]: _items, ...restItems } = convStreamItems;
      const { [conv_id]: _streaming, ...restStreaming } = streamingConvIds;
      const { [conv_id]: _ck, ...restCk } = pendingCheckpointIds;
      const { [conv_id]: _pp, ...restPp } = pendingParentCk;
      const { [conv_id]: _pf, ...restPf } = pendingForkMessageId;
      const { [conv_id]: _asstId, ...restAsstIds } = streamAssistantMsgIds;
      convStreamItems = restItems;
      streamingConvIds = restStreaming;
      pendingCheckpointIds = restCk;
      pendingParentCk = restPp;
      pendingForkMessageId = restPf;
      streamAssistantMsgIds = restAsstIds;
      return;
    }

    conversations[convIdx] = {
      ...conversations[convIdx],
      messages: [...conversations[convIdx].messages, assistantMsg],
      updatedAt: Date.now(),
    };

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
    void loadFileChangesForConv(conv_id).then((loaded) => {
      if (loaded) clearLiveFileChanges(conv_id, finalizedLiveChangeIds);
    });

    // Attach the just-completed turn to the conversation tree.
    if (checkpointId) {
      attachNewTurnToTree(conv_id, checkpointId, assistantMsg);
    }

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

    cleanupStreamState(conv_id);
    void dispatchNextQueuedMessage(conv_id);
  }

  function applyTheme(theme: string) {
    document.documentElement.classList.remove("dark", "light");
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      isDarkTheme = true;
    } else if (theme === "light") {
      document.documentElement.classList.add("light");
      isDarkTheme = false;
    } else {
      // "system" — apply the OS preference as a class so Streamdown's useDarkMode detects it
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      isDarkTheme = prefersDark;
      document.documentElement.classList.add(prefersDark ? "dark" : "light");
    }
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
      await invoke("set_workspace", { path: workspacePath });
      workspace = await invoke<WorkspaceContext>("get_workspace_context");
    } catch {}
  }

  async function loadSettings() {
    if (!tauriAvailable) {
      config = normalizeConfigShape(fallbackConfig);
      if (isChannelsSettingsPreview) {
        config = {
          ...config,
          theme: channelsSettingsPreviewTheme ?? config.theme,
          language: channelsSettingsPreviewLocale ?? config.language,
        };
      }
      applyTheme(
        bookModePreviewTheme ??
          channelsSettingsPreviewTheme ??
          permissionSettingsPreviewTheme ??
          pauseControlPreviewTheme ??
          commandPalettePreviewTheme ??
          workspaceSwitcherPreviewTheme ??
          reasoningEffortPreviewTheme ??
          quickChatPreviewTheme ??
          config.theme ??
          "system",
      );
      await initI18n(
        bookModePreviewLocale ??
          channelsSettingsPreviewLocale ??
          permissionSettingsPreviewLocale ??
          pauseControlPreviewLocale ??
          commandPalettePreviewLocale ??
          workspaceSwitcherPreviewLocale ??
          reasoningEffortPreviewLocale ??
          quickChatPreviewLocale ??
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

    let wasSyncing = isMemorySyncing;
    setInterval(async () => {
      try {
        const next = await invoke<boolean>("get_memory_status");
        if (wasSyncing && !next) {
          await loadNewConversationMemories();
        }
        wasSyncing = next;
        isMemorySyncing = next;
      } catch {}
    }, 2000);
  }

  async function loadNewConversationMemories() {
    const generation = ++newConversationMemoryLoadGeneration;
    newConversationMemoryLoading = true;
    if (!tauriAvailable) {
      newConversationMemories = [];
      newConversationGeneratedReminder = loadHomepageReminder(
        workspacePath,
        config?.language ?? "zh",
      );
      newConversationMemoryLoading = false;
      return;
    }

    try {
      const [globalMemories, projectMemories] = await Promise.all([
        invoke<AgentMemoryEntry[]>("get_agent_memories", { scope: "global", query: null }),
        workspacePath
          ? invoke<AgentMemoryEntry[]>("get_agent_memories", { scope: workspacePath, query: null })
          : Promise.resolve([]),
      ]);

      if (generation !== newConversationMemoryLoadGeneration) return;
      const seen = new Set<string>();
      newConversationMemories = [...projectMemories, ...globalMemories]
        .filter((memory) => {
          const key = memory.content.trim().replace(/\s+/g, " ");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 3);
      newConversationGeneratedReminder = loadHomepageReminder(
        workspacePath,
        config?.language ?? "zh",
      );
    } catch {
      if (generation !== newConversationMemoryLoadGeneration) return;
      newConversationMemories = [];
      newConversationGeneratedReminder = loadHomepageReminder(
        workspacePath,
        config?.language ?? "zh",
      );
    } finally {
      if (generation === newConversationMemoryLoadGeneration) {
        newConversationMemoryLoading = false;
      }
    }
  }

  function buildNewConversationMemoryPrompt(
    memories: AgentMemoryEntry[],
    currentWorkspace: string,
    language: Locale,
    generatedReminder: string | null,
  ) {
    const reminder = generatedReminder?.trim();
    if (reminder) return reminder;
    if (memories.length === 0) return null;

    const hasProjectMemory = currentWorkspace
      ? memories.some((memory) => memory.scope === currentWorkspace)
      : false;
    const hasGlobalMemory = memories.some((memory) => memory.scope === "global");

    if (language === "en") {
      if (hasProjectMemory && hasGlobalMemory) {
        return "I remember a bit about this project and how you like to work, so we can pick up naturally.";
      }
      if (hasProjectMemory) {
        return "I remember some context from this project, so you can tell me what to do next.";
      }
      return "I remember some of your preferences, so you can just tell me what you want to do.";
    }

    if (hasProjectMemory && hasGlobalMemory) {
      return "我还记得这个项目的一些上下文，也记得你的习惯；我们可以直接接着做。";
    }
    if (hasProjectMemory) {
      return "我还记得这个项目的一些上下文，直接说下一步就行。";
    }
    return "我还记得你的一些偏好和习惯，直接说想做什么就行。";
  }

  function homepageReminderStorageKey(currentWorkspace: string, language: Locale) {
    // Version the generated copy so older profile-style summaries are not shown
    // after the greeting contract changes.
    return `openagent_homepage_memory_greeting:v3:${language}:${currentWorkspace || "global"}`;
  }

  function loadHomepageReminder(currentWorkspace: string, language: Locale) {
    if (typeof window === "undefined") return null;
    const value = window.localStorage
      .getItem(homepageReminderStorageKey(currentWorkspace, language))
      ?.trim();
    return value || null;
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
    if (roleChanged) await reloadRoleConversations();
    if (tauriAvailable) {
      await invoke("set_active_conversation", {
        convId: null,
        workspace: workspacePath || "",
      }).catch(() => {});
    }
    void loadNewConversationMemories();
  }

  async function newConversation() {
    if (modelOptions.length === 0) {
      showToast({ title: $t("modelSetupRequired"), variant: "error" });
      openSettings("providers");
      return;
    }
    const newConversationSurfaceVisible =
      !mainContentLoading &&
      newConversationLayout &&
      !onboardingOpen &&
      !settingsOpen &&
      !designOpen &&
      !draftsOpen &&
      !memoryOpen &&
      !rolesOpen &&
      !skillsOpen;
    if (newConversationSurfaceVisible) return;
    if (settingsOpen) closeSettings();
    if (designOpen) designOpen = false;
    if (draftsOpen) draftsOpen = false;
    if (memoryOpen) memoryOpen = false;
    if (rolesOpen) rolesOpen = false;
    if (skillsOpen) skillsOpen = false;
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
      await reloadRoleConversations(id);
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

  async function openMemorySource(convId: string, messageId: string) {
    if (tauriAvailable) {
      const sourceWorkspace = await invoke<string | null>("get_conversation_workspace", {
        convId,
      }).catch(() => null);
      if (sourceWorkspace && sourceWorkspace !== workspacePath) {
        await addToRecentWorkspaces(sourceWorkspace);
        await invoke("open_workspace_window", {
          path: sourceWorkspace,
          conversationId: convId,
          messageId,
        });
        return;
      }
    }
    await revealMemorySource(convId, messageId);
  }

  async function revealMemorySource(convId: string, messageId: string) {
    navigationCaptureDepth += 1;
    try {
      memoryOpen = false;
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

  async function deleteConversation(id: string) {
    // If the conv is mid-stream, signal the backend to abort before we tear down local state.
    // This prevents a terminal checkpoint from being created after local state is removed.
    if (streamingConvIds[id]) {
      if (tauriAvailable) {
        await invoke("cancel_chat_message", { convId: id }).catch(() => {});
      }
      const { [id]: _s, ...rs } = streamingConvIds;
      const { [id]: _i, ...ri } = convStreamItems;
      const { [id]: _c, ...rc } = pendingCheckpointIds;
      const { [id]: _p, ...rp } = pendingParentCk;
      const { [id]: _pf, ...rpf } = pendingForkMessageId;
      const { [id]: _a, ...ra } = streamAssistantMsgIds;
      const { [id]: _awaiting, ...restAwaiting } = awaitingStreamOutputConvIds;
      const { [id]: _memoryStage, ...restMemoryStages } = memoryRetrievalStages;
      const { [id]: _memorySkippable, ...restMemorySkippable } = memoryRetrievalSkippableConvIds;
      streamingConvIds = rs;
      convStreamItems = ri;
      pendingCheckpointIds = rc;
      pendingParentCk = rp;
      pendingForkMessageId = rpf;
      streamAssistantMsgIds = ra;
      awaitingStreamOutputConvIds = restAwaiting;
      memoryRetrievalStages = restMemoryStages;
      memoryRetrievalSkippableConvIds = restMemorySkippable;
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

    conversations = conversations.filter((c) => c.id !== id);
    navigationHistory = removeNavigationLocations(
      navigationHistory,
      (location) => location.workspacePath === workspacePath && location.conversationId === id,
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
    attachments: ChatAttachment[] = inputAttachments,
    model = selectedModel,
  ) {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    if (!model || !modelOptions.some((option) => option.value === model)) {
      showToast({ title: $t("modelSetupRequired"), variant: "error" });
      openSettings("providers");
      return;
    }

    const text = rawText.trim() || (attachments.length > 0 ? $t("attachmentOnlyPrompt") : "");
    if (!text && attachments.length === 0) return;
    if (targetConvId && streamingConvIds[targetConvId]) return;
    if (!targetConvId && isCurrentStreaming) return;

    let convId = targetConvId;

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
      // Persist creation and the durable active selection atomically.
      await invoke("create_conversation", {
        id: newId,
        title: $t("newConv"),
        workspace: wsPath,
        parentConvId: null,
        roleId: selectedRoleId,
      }).catch(() => {});
    }

    if (clearInput) {
      inputText = "";
      inputAttachments = [];
    }

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
      items: attachments.map((attachment) => ({ type: "attachment", attachment })),
    };
    const convIdx = conversations.findIndex((c) => c.id === convId);
    const priorMessages = conversations[convIdx]?.messages ?? [];
    const isFirstUserMsg = !priorMessages.some((m) => m.role === "user");
    const newTitle = isFirstUserMsg ? text.slice(0, 48) : conversations[convIdx]?.title;

    conversations[convIdx] = {
      ...conversations[convIdx],
      messages: [...priorMessages, userMsg],
      title: newTitle ?? $t("newConv"),
      updatedAt: Date.now(),
    };

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
    startStreamTiming(convId, userMsg.timestamp);
    streamingConvIds = { ...streamingConvIds, [convId]: true };
    awaitingStreamOutputConvIds = {
      ...awaitingStreamOutputConvIds,
      [convId]: true,
    };
    if (config?.memory_retrieval_enabled) {
      memoryRetrievalStages = {
        ...memoryRetrievalStages,
        [convId]: "query_rewrite",
      };
    }
    convStreamItems = { ...convStreamItems, [convId]: [] };
    streamAssistantMsgIds = { ...streamAssistantMsgIds, [convId]: assistantMsgId };

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
    // Re-executing an historical message starts a visible branch. Ordinary
    // sends stay on the selected branch even though the provider may write
    // multiple recovery checkpoints for this one request.
    const branchId = await ensureActiveBranch(
      convId,
      convId in pendingParentCk ? parentCheckpointId : undefined,
      convId in pendingForkMessageId ? pendingForkMessageId[convId] : undefined,
    );

    await scrollToBottom();

    // Fire and forget — global listeners handle chunk/checkpoint/done events
    openAgent
      .submitInput({
        convId,
        text,
        parentCheckpointId,
        branchId,
        attachments: attachments.map((attachment) => attachment.path),
        modelBinding: decodeModelBinding(model),
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsgId,
      })
      .then(() => {
        // Events are the live path, but the completed checkpoint is authoritative.
        // If a terminal event was lost, reconcile instead of leaving a permanent
        // streaming row and sidebar dot.
        if (!streamingConvIds[convId]) return;
        loadedConvIds.delete(convId);
        void loadMessagesForConv(convId, false).finally(() => {
          if (!streamingConvIds[convId]) return;
          cleanupStreamState(convId);
          void dispatchNextQueuedMessage(convId);
        });
      })
      .catch((err: unknown) => {
        const errMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${err}`,
          timestamp: Date.now(),
        };
        const idx = conversations.findIndex((c) => c.id === convId);
        if (idx !== -1) {
          conversations[idx] = {
            ...conversations[idx],
            messages: [...conversations[idx].messages, errMsg],
            updatedAt: Date.now(),
          };
        }
        cleanupStreamState(convId!);
      });
  }

  async function sendMessage() {
    const text = inputText;
    const attachments = [...inputAttachments];
    if (!text.trim() && attachments.length === 0) return;

    if (text.trimStart().startsWith("/") && (await handleClientSlashInput(text))) {
      return;
    }

    if (activeConvId && streamingConvIds[activeConvId]) {
      const paused = !!streamPausedConvIds[activeConvId];
      queuedChatMessages = enqueueChatMessage(queuedChatMessages, activeConvId, {
        text,
        attachments,
        model: selectedModel,
      });
      await syncChatQueuePending(activeConvId);
      inputText = "";
      inputAttachments = [];
      if (paused) await setStreamPaused(activeConvId, false);
      return;
    }

    await dispatchQueuedOrImmediateMessage(text, activeConvId, attachments, selectedModel, true);
  }

  async function handleClientSlashInput(text: string): Promise<boolean> {
    try {
      const resolved = await invoke<ResolvedAgentInput>("resolve_agent_input", { text });
      if (resolved.type === "agent_command" && resolved.command === "compact") {
        inputText = "";
        await compactCurrentConversation();
        return true;
      }
      if (resolved.type !== "client_action") return false;
      const run = clientActionRun(resolved.action);
      if (!run) return false;
      inputText = "";
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
    model: string,
    clearInput: boolean,
  ) {
    await dispatchChatMessage(text, convId, clearInput, attachments, model);
  }

  async function dispatchNextQueuedMessage(convId: string) {
    if (streamingConvIds[convId]) return;
    const { next, queue } = dequeueChatMessage(queuedChatMessages, convId);
    if (!next) return;
    queuedChatMessages = queue;
    await syncChatQueuePending(convId);
    await dispatchQueuedOrImmediateMessage(next.text, convId, next.attachments, next.model, false);
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
    const previous = !!streamPausedConvIds[convId];
    streamPausedConvIds = { ...streamPausedConvIds, [convId]: paused };
    try {
      await openAgent.setConversationStreamPaused(convId, paused);
    } catch (error) {
      if (streamingConvIds[convId] && streamPausedConvIds[convId] === paused) {
        streamPausedConvIds = { ...streamPausedConvIds, [convId]: previous };
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
    memoryRetrievalStages = { ...memoryRetrievalStages, [convId]: "skipped" };
    memoryRetrievalSkippableConvIds = {
      ...memoryRetrievalSkippableConvIds,
      [convId]: false,
    };
    try {
      await openAgent.skipMemoryRetrieval(convId);
    } catch (error) {
      if (streamingConvIds[convId] && memoryRetrievalStages[convId] === "skipped") {
        memoryRetrievalStages = { ...memoryRetrievalStages, [convId]: previousStage };
        memoryRetrievalSkippableConvIds = {
          ...memoryRetrievalSkippableConvIds,
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

  async function scrollStreamToBottom() {
    if (!followStreamToBottom && Date.now() >= programmaticBottomScrollUntil) return;
    await tick();
    if ((!followStreamToBottom && Date.now() >= programmaticBottomScrollUntil) || !messagesEl)
      return;
    messagesEl.scrollTo({
      top: messagesEl.scrollHeight,
      behavior: "auto",
    });
    followStreamToBottom = true;
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

  let messagesResizeObs: ResizeObserver | null = null;

  $effect(() => {
    if (!messagesEl || !("ResizeObserver" in window)) return;
    messagesResizeObs?.disconnect();
    messagesResizeObs = new ResizeObserver(() => {
      if (followStreamToBottom || Date.now() < programmaticBottomScrollUntil) {
        scrollStreamToBottom();
      }
    });
    messagesResizeObs.observe(messagesEl);
    if (messagesEl.firstElementChild) {
      messagesResizeObs.observe(messagesEl.firstElementChild);
    }

    return () => {
      messagesResizeObs?.disconnect();
      messagesResizeObs = null;
    };
  });

  onMount(() => {
    return () => {
      if (bottomScrollRaf !== null) cancelAnimationFrame(bottomScrollRaf);
    };
  });

  // ─── Workspace ────────────────────────────────────────────────────────────────

  async function applyWorkspace(path: string) {
    if (path === workspacePath) return;

    workspaceLoading = true;
    const restoreHint = readWorkspaceRestoreHint(path);
    restoringSurface = restoreHint?.surface ?? "new-conversation";
    activeConvId = restoreHint?.conversationId ?? null;
    try {
      workspacePath = path;

      // Reset loaded tracking for old workspace's convs
      loadedConvIds.clear();
      conversations = [];
      conversationNextCursor = null;
      searchConversations = [];
      searchConversationNextCursor = null;
      conversationSearchGeneration += 1;

      // Load only the first page; the sidebar requests subsequent pages on scroll.
      if (tauriAvailable) {
        selectedRoleKey = storedRoleSelection(path);
        await loadAvailableRoles();
        const page = await fetchConversationPage(
          path || null,
          null,
          30,
          null,
          true,
          selectedRoleId,
        );
        conversations = page.conversations;
        conversationNextCursor = page.nextCursor;
      }

      // Restore the durable active conversation before loading ancillary workspace data.
      await restoreWorkspaceConversation(path);

      await addToRecentWorkspaces(path);

      if (!tauriAvailable) {
        workspace = {
          path,
          git_branch: null,
          has_agent_dir: false,
          environment: { kind: "local" },
        };
        await loadNewConversationMemories();
        return;
      }
      await invoke("set_workspace", { path: path || null });
      workspace = await invoke<WorkspaceContext>("get_workspace_context");
      await loadNewConversationMemories();
    } finally {
      workspaceLoading = false;
    }
  }

  async function openWorkspaceInNewWindow(
    path: string,
    conversationId?: string,
    messageId?: string,
  ) {
    if (!tauriAvailable) return;
    await addToRecentWorkspaces(path);
    await invoke("open_workspace_window", {
      path,
      conversationId: conversationId ?? null,
      messageId: messageId ?? null,
    });
  }

  async function requestWorkspace(path: string) {
    if (!path || path === workspacePath) return;
    const mode = config?.workspace_open_mode ?? "ask";
    if (mode === "ask") {
      pendingWorkspacePath = path;
      return;
    }
    if (mode === "new_window") await openWorkspaceInNewWindow(path);
    else await applyWorkspace(path);
  }

  async function resolveWorkspaceChoice(mode: "new_window" | "current_window") {
    const path = pendingWorkspacePath;
    pendingWorkspacePath = null;
    if (!path) return;
    if (config) {
      await saveSettings({ ...config, workspace_open_mode: mode });
    }
    if (mode === "new_window") await openWorkspaceInNewWindow(path);
    else await applyWorkspace(path);
  }

  async function addToRecentWorkspaces(path: string) {
    if (!path) return;
    const name = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
    recentWorkspaces = [{ path, name }, ...recentWorkspaces.filter((w) => w.path !== path)];
    if (!tauriAvailable) return;

    // Serialize writes and await the latest one at workspace-switch boundaries.
    // The old fire-and-forget call could be lost when the window closed immediately.
    const workspace = workspacePath;
    const recents = [...recentWorkspaces];
    workspacePrefsSaveQueue = workspacePrefsSaveQueue
      .catch(() => {})
      .then(() => invoke("save_workspace_prefs", { workspace, recentWorkspaces: recents }))
      .then(() => {});
    await workspacePrefsSaveQueue.catch(() => {});
  }

  async function pickWorkspace(applyToCurrentWindow = false) {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    const defaultPath = await homeDir();
    const selected = await openDialog({ directory: true, multiple: false, defaultPath });
    if (typeof selected === "string" && selected) {
      if (applyToCurrentWindow) await applyWorkspace(selected);
      else await requestWorkspace(selected);
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

  async function pickWslWorkspace() {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
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
      await requestWorkspace(selected);
    }
  }

  async function openSelectedWslWorkspace() {
    const target = await resolveSelectedWslWorkspace();
    if (!target) return;
    wslPickerOpen = false;
    await requestWorkspace(target.path);
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
    if (designOpen) designOpen = false;
    if (draftsOpen) draftsOpen = false;
    if (memoryOpen) memoryOpen = false;
    if (rolesOpen) rolesOpen = false;
    if (skillsOpen) skillsOpen = false;
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
      closeSettings();
      await switchConversation(conversationId);
    } finally {
      navigationCaptureDepth -= 1;
    }
  }

  async function saveSettings(nextConfig: AppConfig, baseConfig?: AppConfig) {
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
      return structuredClone(savedSnapshot);
    } catch (err: unknown) {
      if (shortcutChanged && !launchContext?.workspace) {
        await replaceQuickChatShortcut(previousShortcut).catch(() => {});
      }
      const conflict = `${err}`.includes("SETTINGS_CONFLICT:");
      if (conflict) await loadSettings();
      alert(`${$t(conflict ? "settingsSaveConflict" : "settingsSaveFailed")}: ${err}`);
      throw err;
    }
  }

  function completeOnboarding() {
    markOnboardingCompleted();
    onboardingOpen = false;
  }

  // ─── Design / Drafts / Memory ────────────────────────────────────────────────

  async function openDesign() {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    DesignView ??= (await import("$lib/components/DesignView.svelte")).default;
    if (settingsOpen) closeSettings();
    draftsOpen = false;
    memoryOpen = false;
    rolesOpen = false;
    skillsOpen = false;
    designOpen = true;
  }

  function closeDesign() {
    designOpen = false;
  }

  async function openDrafts() {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    DraftsView ??= (await import("$lib/components/DraftsView.svelte")).default;
    if (settingsOpen) closeSettings();
    designOpen = false;
    if (memoryOpen) memoryOpen = false;
    if (rolesOpen) rolesOpen = false;
    if (skillsOpen) skillsOpen = false;
    draftsOpen = true;
  }

  function closeDrafts() {
    draftsOpen = false;
  }

  async function openMemory() {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    MemoryView ??= (await import("$lib/components/MemoryView.svelte")).default;
    if (settingsOpen) closeSettings();
    designOpen = false;
    if (draftsOpen) draftsOpen = false;
    if (rolesOpen) rolesOpen = false;
    if (skillsOpen) skillsOpen = false;
    memoryOpen = true;
  }

  function closeMemory() {
    memoryOpen = false;
  }

  async function openRoles() {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    RolesView ??= (await import("$lib/components/RolesView.svelte")).default;
    if (settingsOpen) closeSettings();
    designOpen = false;
    draftsOpen = false;
    memoryOpen = false;
    skillsOpen = false;
    rolesOpen = true;
  }

  function closeRoles() {
    rolesOpen = false;
  }

  async function openSkills() {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    SkillsView ??= (await import("$lib/components/SkillsView.svelte")).default;
    if (settingsOpen) closeSettings();
    designOpen = false;
    if (draftsOpen) draftsOpen = false;
    if (memoryOpen) memoryOpen = false;
    if (rolesOpen) rolesOpen = false;
    skillsOpen = true;
  }

  function closeSkills() {
    skillsOpen = false;
  }

  function closeAuxiliarySurfaces(): void {
    if (settingsOpen) closeSettings();
    designOpen = false;
    draftsOpen = false;
    memoryOpen = false;
    rolesOpen = false;
    skillsOpen = false;
  }

  async function restoreNavigationLocation(location: AppNavigationLocation): Promise<void> {
    closeAuxiliarySurfaces();
    if (location.workspacePath !== workspacePath) {
      await applyWorkspace(location.workspacePath);
    }
    if (location.conversationId) {
      await switchConversation(location.conversationId);
    } else {
      await activateNewConversationSurface(location.roleKey);
    }

    switch (location.surface) {
      case "design":
        await openDesign();
        break;
      case "drafts":
        await openDrafts();
        break;
      case "memory":
        await openMemory();
        break;
      case "roles":
        await openRoles();
        break;
      case "skills":
        await openSkills();
        break;
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
        modelBinding: decodeModelBinding(selectedModel),
      });
      const compacted = outcome.type === "immediate_command" && outcome.changed;
      showToast({
        title: compacted ? $t("compactConversationStarted") : $t("compactConversationSkipped"),
        variant: compacted ? "success" : "info",
      });
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
      case "drafts":
        return () => openDrafts();
      case "memory":
        return () => openMemory();
      case "compact":
        return () => {
          void compactCurrentConversation();
        };
      case "goal":
        return () => {
          inputText = "/goal ";
        };
      case "graph":
        return () => {
          inputText = "/graph ";
        };
      case "skills":
        return () => openSkills();
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
      case "open_drafts":
        return () => openDrafts();
      case "open_memory":
        return () => openMemory();
      case "open_skills":
        return () => openSkills();
      case "open_settings":
        return () => openSettings();
      default:
        return null;
    }
  }

  let slashCommands = $derived.by<SlashCommand[]>(() =>
    agentCommandSpecs.flatMap((spec) => {
      const run = slashCommandRun(spec.name);
      if (!run) return [];
      return [
        {
          id: spec.name,
          name: spec.name,
          label: $t(spec.label_key as TranslationKeys),
          description: $t(spec.description_key as TranslationKeys),
          run,
        },
      ];
    }),
  );
  let commandPalettePreviewCommands = $derived.by<SlashCommand[]>(() =>
    [
      ["new", "slashCmdNewLabel", "slashCmdNewDesc"],
      ["model", "slashCmdModelLabel", "slashCmdModelDesc"],
      ["drafts", "slashCmdDraftsLabel", "slashCmdDraftsDesc"],
      ["memory", "slashCmdMemoryLabel", "slashCmdMemoryDesc"],
      ["compact", "slashCmdCompactLabel", "slashCmdCompactDesc"],
      ["goal", "slashCmdGoalLabel", "slashCmdGoalDesc"],
      ["graph", "slashCmdGraphLabel", "slashCmdGraphDesc"],
      ["skills", "slashCmdSkillsLabel", "slashCmdSkillsDesc"],
      ["settings", "slashCmdSettingsLabel", "slashCmdSettingsDesc"],
    ].map(([name, labelKey, descriptionKey]) => ({
      id: name,
      name,
      label: $t(labelKey as TranslationKeys),
      description: $t(descriptionKey as TranslationKeys),
      run: () => {},
    })),
  );

  // ─── Window Controls ─────────────────────────────────────────────────────────

  const appWindow = tauriAvailable ? getCurrentWindow() : null;
  const quickChatCompactSize = { width: 760, height: 190 };
  const quickChatExpandedSize = { width: 760, height: 500 };
  const winMinimize = () => appWindow?.minimize();
  const winMaximize = () => appWindow?.toggleMaximize();
  const winClose = () => (launchContext?.workspace ? appWindow?.close() : appWindow?.hide());

  async function getQuickChatWindow() {
    if (!tauriAvailable) return null;
    return isQuickChatWindow ? appWindow : await WebviewWindow.getByLabel("quick-chat");
  }

  async function showQuickChatWindow() {
    const quickWindow = await getQuickChatWindow();
    if (!quickWindow) return;
    await quickWindow.setSize(
      new LogicalSize(quickChatCompactSize.width, quickChatCompactSize.height),
    );
    await quickWindow.center();
    await quickWindow.setSize(
      new LogicalSize(quickChatExpandedSize.width, quickChatExpandedSize.height),
    );
    await quickWindow.unminimize().catch(() => {});
    await quickWindow.show();
    await quickWindow.setFocus();
    await emit(QUICK_CHAT_FOCUS_INPUT_EVENT);
  }

  async function hideQuickChatWindow() {
    const quickWindow = await getQuickChatWindow();
    if (!quickWindow) return;
    quickChatFocusArmed = false;
    quickChatFocusSuppressed = false;
    await quickWindow.hide();
    await quickWindow
      .setSize(new LogicalSize(quickChatCompactSize.width, quickChatCompactSize.height))
      .catch(() => {});
  }

  function queueQuickWindowTransition(operation: () => Promise<void>) {
    quickWindowTransition = quickWindowTransition
      .catch(() => {})
      .then(operation)
      .catch((error) => {
        console.warn("Quick chat window transition failed", error);
      });
    return quickWindowTransition;
  }

  async function toggleQuickChat() {
    const quickWindow = await getQuickChatWindow();
    if (!quickWindow) return;
    const visible = await quickWindow.isVisible();
    return queueQuickWindowTransition(() =>
      visible ? hideQuickChatWindow() : showQuickChatWindow(),
    );
  }

  function closeQuickChat() {
    return queueQuickWindowTransition(hideQuickChatWindow);
  }

  async function openFullAppFromQuickChat() {
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    quickChatFocusArmed = false;
    quickChatFocusSuppressed = true;
    try {
      if (quickChatWorkspace) {
        await invoke("open_workspace_window", {
          path: quickChatWorkspace,
          conversationId: null,
          messageId: null,
        });
      } else {
        const mainWindow = await WebviewWindow.getByLabel("main");
        await mainWindow?.show();
        await mainWindow?.setFocus();
      }
      await closeQuickChat();
    } catch (error) {
      showToast({ title: String(error), variant: "error" });
      await appWindow?.setFocus().catch(() => {});
      quickChatFocusSuppressed = false;
      quickChatFocusArmed = true;
    }
  }

  async function startQuickChatDrag(event: PointerEvent) {
    if (!isQuickChatWindow || !appWindow || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, textarea, select, a")) return;
    event.preventDefault();
    quickChatFocusArmed = false;
    quickChatFocusSuppressed = true;
    try {
      await appWindow.startDragging();
      await appWindow.setFocus().catch(() => {});
    } finally {
      quickChatFocusSuppressed = false;
      quickChatFocusArmed = true;
    }
  }

  function dismissQuickChatFromTransparentArea(event: PointerEvent) {
    if (!isQuickChatWindow || event.target !== event.currentTarget) return;
    void closeQuickChat();
  }

  async function replaceQuickChatShortcut(shortcut: string) {
    if (!tauriAvailable) return;
    const nextShortcut = normalizeQuickChatShortcut(shortcut);
    const previousShortcut = registeredQuickChatShortcut;
    if (previousShortcut === nextShortcut) return;
    if (previousShortcut) await unregister(previousShortcut);
    try {
      await register(nextShortcut, (event) => {
        if (event.state === "Pressed") void toggleQuickChat();
      });
      registeredQuickChatShortcut = nextShortcut;
    } catch (error) {
      if (previousShortcut) {
        try {
          await register(previousShortcut, (event) => {
            if (event.state === "Pressed") void toggleQuickChat();
          });
          registeredQuickChatShortcut = previousShortcut;
        } catch {
          registeredQuickChatShortcut = null;
        }
      }
      throw error;
    }
  }

  async function initializeQuickChatShortcut() {
    if (!tauriAvailable || registeredQuickChatShortcut) return;
    const shortcut = normalizeQuickChatShortcut(
      config?.quick_chat_shortcut ?? DEFAULT_QUICK_CHAT_SHORTCUT,
    );
    await unregister(shortcut).catch(() => {});
    await replaceQuickChatShortcut(shortcut);
  }

  function handleQuickChatKeydown(event: KeyboardEvent) {
    if (!isQuickChatSurface || event.key !== "Escape") return;
    event.preventDefault();
    void closeQuickChat();
  }

  async function sendQuickChatMessage() {
    if (quickChatSubmitting) return;
    const text = inputText;
    const attachments = [...inputAttachments];
    if (!text.trim() && attachments.length === 0) return;
    if (!tauriAvailable) {
      alert(browserModeNotice);
      return;
    }
    if (!quickChatModel || !modelOptions.some((option) => option.value === quickChatModel)) {
      showToast({ title: $t("modelSetupRequired"), variant: "error" });
      return;
    }

    if (!quickChatWorkspace) {
      showToast({ title: $t("switchWorkspace"), variant: "error" });
      return;
    }
    const model = quickChatModel;
    quickChatSubmitting = true;
    quickChatFocusArmed = false;
    quickChatFocusSuppressed = true;
    try {
      await invoke<string>("submit_quick_chat", {
        workspace: quickChatWorkspace,
        text: text.trim() || $t("attachmentOnlyPrompt"),
        attachments: attachments.map((attachment) => attachment.path),
        modelBinding: decodeModelBinding(model),
        roleId: quickChatRole === defaultRoleKey ? null : quickChatRole,
      });
      inputText = "";
      inputAttachments = [];
      await closeQuickChat();
    } catch (error) {
      showToast({ title: String(error), variant: "error" });
      await appWindow?.setFocus().catch(() => {});
      quickChatFocusSuppressed = false;
      quickChatFocusArmed = true;
    } finally {
      quickChatSubmitting = false;
    }
  }

  function handleQuickModelChange(value: string) {
    quickChatModel = value;
    persistQuickChatPreferences();
  }

  function handleQuickRoleChange(value: string) {
    quickChatRole = value;
    persistQuickChatPreferences();
  }

  async function handleQuickWorkspaceChange(value: string) {
    if (!value || value === quickChatWorkspace) return;
    quickChatWorkspace = value;
    quickChatRole = defaultRoleKey;
    await loadQuickChatRoles(value);
    persistQuickChatPreferences();
  }

  async function pickQuickChatWorkspace() {
    if (!tauriAvailable) return;
    quickChatFocusArmed = false;
    quickChatFocusSuppressed = true;
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: quickChatWorkspace || (await homeDir()),
      });
      if (typeof selected === "string" && selected) {
        quickChatWorkspace = selected;
        quickChatRole = defaultRoleKey;
        await loadQuickChatRoles(selected);
        persistQuickChatPreferences();
      }
      await appWindow?.setFocus().catch(() => {});
    } finally {
      quickChatFocusSuppressed = false;
      quickChatFocusArmed = true;
    }
  }

  async function handleQuickAttachmentPickerOpenChange(open: boolean) {
    if (!isQuickChatWindow || !appWindow) return;
    if (open) {
      quickChatFocusArmed = false;
      quickChatFocusSuppressed = true;
      return;
    }
    await appWindow.setFocus().catch(() => {});
    quickChatFocusSuppressed = false;
    quickChatFocusArmed = true;
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    window.localStorage.setItem(sidebarCollapsedStorageKey, String(sidebarCollapsed));
  }

  function resizeSidebar(width: number): void {
    sidebarWidth = clampSidebarWidth(width);
  }

  // Keep the webview's built-in context menu available while developing, but
  // do not expose browser actions (such as inspect/copy navigation) in builds.
  function handleContextMenu(event: MouseEvent) {
    if (!isDebugBuild) event.preventDefault();
  }

  onMount(() => {
    const unlistenQuickChatInputFocus = isQuickChatWindow
      ? listen(QUICK_CHAT_FOCUS_INPUT_EVENT, () => {
          quickChatInputFocusRequest += 1;
        })
      : null;
    const unlistenQuickChatFocus = appWindow?.onFocusChanged(({ payload: focused }) => {
      if (!isQuickChatWindow) return;
      if (quickChatFocusSuppressed) return;
      if (focused) {
        quickChatFocusArmed = true;
      } else if (quickChatFocusArmed) {
        void closeQuickChat();
      }
    });
    return () => {
      void unlistenQuickChatInputFocus?.then((dispose) => dispose());
      void unlistenQuickChatFocus?.then((dispose) => dispose());
      void unlistenQuickChatSettings?.then((dispose) => dispose());
      if (registeredQuickChatShortcut) {
        void unregister(registeredQuickChatShortcut).catch(() => {});
      }
    };
  });
</script>

<svelte:window oncontextmenu={handleContextMenu} onkeydown={handleQuickChatKeydown} />

<TooltipPrimitive.Provider delayDuration={500} skipDelayDuration={300}>
  {#if isDevInspectorWindow && DevInspector}
    <DevInspector />
  {:else if isBookModePreview}
    <AgentBookReader
      turns={bookModePreviewTurns}
      activeKey="book-preview-one"
      shikiTheme={bookModePreviewTheme === "dark" ? "github-dark" : "github-light"}
      mermaidConfig={mermaidConfigFor(bookModePreviewTheme === "dark")}
      fontSize={17}
      onClose={() => {}}
      onSubmitUserInput={() => {}}
      onCancelUserInput={() => {}}
    />
  {:else if isPermissionSettingsPreview}
    <main class="permission-settings-preview-stage">
      <section class="permission-settings-preview-card">
        <header>
          <h1>{$t("executionPermissions")}</h1>
          <p>{$t("executionPermissionsDescription")}</p>
        </header>
        <PermissionSettings
          profile={permissionSettingsPreviewProfile}
          onProfileChange={(profile) => (permissionSettingsPreviewProfile = profile)}
        />
      </section>
    </main>
  {:else if isWorkspaceSwitcherPreview}
    <main class="workspace-switcher-preview-stage">
      <WorkspaceSwitcher
        workspace={workspaceSwitcherPreviewWorkspace}
        workspacePath={workspaceSwitcherPreviewWorkspace.path ?? ""}
        recentWorkspaces={workspaceSwitcherPreviewRecents}
        tauriAvailable={true}
        browserModeNotice=""
        onPick={() => {}}
        onPickWsl={() => {}}
        onSelect={() => {}}
      />
    </main>
  {:else if isPauseControlPreview}
    <main class="command-palette-preview-stage">
      <MessageInput
        bind:value={pauseControlPreviewValue}
        bind:attachments={pauseControlPreviewAttachments}
        selectedModel=""
        modelOptions={[]}
        placeholder={$t("inputPlaceholder")}
        disabled={false}
        isStreaming
        isPaused={pauseControlPreviewPaused}
        sendDisabled={!pauseControlPreviewValue.trim()}
        sendTitle={$t("send")}
        pauseTitle={$t("pauseOutput")}
        resumeTitle={$t("resumeOutput")}
        stopTitle={$t("stopOutput")}
        enableMentions={false}
        showAttachments={false}
        showModelSelector={false}
        onSend={() => (pauseControlPreviewValue = "")}
        onStop={() => {}}
        onPause={() => (pauseControlPreviewPaused = true)}
        onResume={() => (pauseControlPreviewPaused = false)}
      />
    </main>
  {:else if isCommandPalettePreview}
    <main class="command-palette-preview-stage">
      <MessageInput
        bind:value={commandPalettePreviewValue}
        bind:attachments={commandPalettePreviewAttachments}
        selectedModel=""
        modelOptions={[]}
        placeholder={$t("inputPlaceholder")}
        disabled={false}
        isStreaming={false}
        sendDisabled={true}
        sendTitle={$t("send")}
        slashCommands={commandPalettePreviewCommands}
        enableMentions={false}
        showAttachments={false}
        showModelSelector={false}
        showStopButton={false}
        onSend={() => {}}
        onStop={() => {}}
      />
    </main>
  {:else if isReasoningEffortPreview}
    <main class="reasoning-effort-preview-stage">
      <section class="reasoning-effort-preview-card">
        <div class="reasoning-effort-preview-model">ChatGPT OAuth · gpt-5.6</div>
        <ReasoningEffortSelect
          value={reasoningEffortPreviewValue}
          contentSide="bottom"
          onValueChange={(value) => (reasoningEffortPreviewValue = value)}
        />
        <code>reasoning.effort = "{reasoningEffortPreviewValue}"</code>
      </section>
    </main>
  {:else if isQuickChatSurface}
    <div
      class="quick-chat-stage"
      role="presentation"
      onpointerdown={dismissQuickChatFromTransparentArea}
    >
      <QuickChat
        selectedModel={quickChatModel}
        {modelOptions}
        selectedRole={quickChatRole}
        roleOptions={quickRoleOptions}
        selectedWorkspace={quickChatWorkspace}
        workspaceOptions={quickWorkspaceOptions}
        shortcutLabel={formatQuickChatShortcut(
          config?.quick_chat_shortcut ?? DEFAULT_QUICK_CHAT_SHORTCUT,
        )}
        {workspaceLoading}
        onModelChange={handleQuickModelChange}
        onRoleChange={handleQuickRoleChange}
        onWorkspaceChange={handleQuickWorkspaceChange}
        onPickWorkspace={() => void pickQuickChatWorkspace()}
        onDragStart={startQuickChatDrag}
        onOpenFullApp={() => void openFullAppFromQuickChat()}
        onClose={() => void closeQuickChat()}
      >
        {#snippet composer()}
          <MessageInput
            bind:value={inputText}
            bind:attachments={inputAttachments}
            selectedModel={quickChatModel}
            {modelOptions}
            placeholder={tauriAvailable
              ? modelOptions.length
                ? $t("quickChatPlaceholder")
                : $t("modelSetupHint")
              : browserModeNotice}
            disabled={(!tauriAvailable && !isQuickChatPreview) || quickChatSubmitting}
            isStreaming={false}
            sendDisabled={(!inputText.trim() && inputAttachments.length === 0) ||
              !tauriAvailable ||
              quickChatSubmitting ||
              modelOptions.length === 0}
            sendTitle={$t("send")}
            slashCommands={[]}
            enableMentions={false}
            showAttachments
            showModelSelector={false}
            focusRequest={quickChatInputFocusRequest}
            onAttachmentPickerOpenChange={handleQuickAttachmentPickerOpenChange}
            onSend={sendQuickChatMessage}
            onStop={stopMessage}
          />
        {/snippet}
      </QuickChat>
    </div>
  {:else}
    <div
      class="app"
      class:sidebar-collapsed={sidebarCollapsed}
      style:--sidebar-width={`${sidebarWidth}px`}
    >
      <!-- ─── Sidebar ─────────────────────────────────────────────────────────────── -->
      <aside class="sidebar" class:collapsed={sidebarCollapsed} class:resizing={sidebarResizing}>
        <div class="sidebar-top" data-tauri-drag-region>
          {#if !sidebarCollapsed}
            <div class="sidebar-navigation-start" data-tauri-drag-region>
              <RoleSelector
                value={selectedRoleKey}
                roles={agentRoles}
                header
                onChange={(role) => void changeConversationRole(role)}
              />
            </div>
            <div class="sidebar-navigation-end" data-tauri-drag-region>
              <SidebarHistoryControls
                {canGoBack}
                {canGoForward}
                onBack={() => void navigateHistory(-1)}
                onForward={() => void navigateHistory(1)}
              />
              <SidebarCollapseButton collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
            </div>
          {:else}
            <SidebarCollapseButton collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          {/if}
        </div>
        {#if !sidebarCollapsed}
          <SidebarPrimaryActions
            searchQuery={conversationSearchQuery}
            onNew={newConversation}
            onSearch={handleConversationSearch}
          />

          {#if initialLoading || workspaceLoading}
            <LoadingSkeleton variant="sidebar" rows={8} label={$t("loadingContent")} />
          {:else}
            <ConversationList
              conversations={sidebarConversations}
              searchQuery={conversationSearchQuery}
              {activeConvId}
              {streamingConvIds}
              hasMore={sidebarHasMoreConversations}
              loadingMore={sidebarLoadingMoreConversations}
              onLoadMore={() => void loadNextConversationPage()}
              onSelect={(id) => {
                if (settingsOpen) closeSettings();
                if (designOpen) designOpen = false;
                if (draftsOpen) draftsOpen = false;
                if (memoryOpen) memoryOpen = false;
                if (rolesOpen) rolesOpen = false;
                if (skillsOpen) skillsOpen = false;
                void selectSidebarConversation(id);
              }}
              onTogglePin={togglePin}
              onDelete={deleteConversation}
            />
          {/if}

          <SidebarNav
            {designOpen}
            {draftsOpen}
            {memoryOpen}
            {rolesOpen}
            {skillsOpen}
            {settingsOpen}
            onToggleDesign={designOpen ? closeDesign : openDesign}
            onToggleDrafts={draftsOpen ? closeDrafts : openDrafts}
            onToggleMemory={memoryOpen ? closeMemory : openMemory}
            onToggleRoles={rolesOpen ? closeRoles : openRoles}
            onToggleSkills={skillsOpen ? closeSkills : openSkills}
            onToggleSettings={settingsOpen ? closeSettings : openSettings}
          />
          <SidebarResizeHandle
            width={sidebarWidth}
            ariaLabel={$t("resizeSidebar")}
            onResize={resizeSidebar}
            onResizeStateChange={(resizing) => (sidebarResizing = resizing)}
            onResizeEnd={saveSidebarWidth}
          />
        {/if}
      </aside>

      <!-- ─── Design Panel ───────────────────────────────────────────────────── -->
      {#if onboardingOpen && config}
        <OnboardingFlow
          {config}
          {workspacePath}
          onSave={saveSettings}
          onPickWorkspace={pickWorkspace}
          onComplete={completeOnboarding}
          {winMinimize}
          {winMaximize}
          {winClose}
        />
      {:else if designOpen && DesignView}
        <DesignView {workspace} onClose={closeDesign} {winMinimize} {winMaximize} {winClose} />
        <!-- ─── Drafts Panel ───────────────────────────────────────────────────── -->
      {:else if draftsOpen && DraftsView}
        <DraftsView {workspace} onClose={closeDrafts} {winMinimize} {winMaximize} {winClose} />
        <!-- ─── Memory Panel ───────────────────────────────────────────────────── -->
      {:else if memoryOpen && MemoryView}
        <MemoryView
          {workspace}
          {isMemorySyncing}
          onOpenSource={openMemorySource}
          {winMinimize}
          {winMaximize}
          {winClose}
        />
        <!-- ─── Roles Panel ─────────────────────────────────────────────────────── -->
      {:else if rolesOpen && RolesView}
        <RolesView
          {workspace}
          onRolesChanged={() => void handleRolesChanged()}
          {winMinimize}
          {winMaximize}
          {winClose}
        />
        <!-- ─── Skills Panel ────────────────────────────────────────────────────── -->
      {:else if skillsOpen && SkillsView}
        <SkillsView {workspace} {winMinimize} {winMaximize} {winClose} />
        <!-- ─── Settings Panel ──────────────────────────────────────────────────── -->
      {:else if settingsOpen && SettingsView}
        <SettingsView
          {config}
          {workspacePath}
          {isMemorySyncing}
          initialNav={settingsInitialNav}
          onSave={saveSettings}
          onOpenConversation={openHookConversation}
          {winMinimize}
          {winMaximize}
          {winClose}
        />
      {:else}
        <div class="main" class:sidebar-collapsed={sidebarCollapsed}>
          <!-- Title Bar -->
          <header class="title-bar" data-tauri-drag-region>
            <div class="title-bar-left">
              <WorkspaceSwitcher
                {workspace}
                {workspacePath}
                {recentWorkspaces}
                {tauriAvailable}
                {browserModeNotice}
                onPick={pickWorkspace}
                onPickWsl={pickWslWorkspace}
                onSelect={requestWorkspace}
              />
              {#if sidebarCollapsed}
                <Tooltip text={$t("newChat")} side="bottom">
                  <button
                    class="title-new-conversation"
                    type="button"
                    aria-label={$t("newChat")}
                    onclick={newConversation}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path
                        d="M11.75 4.25H5.5A1.75 1.75 0 0 0 3.75 6v8.5a1.75 1.75 0 0 0 1.75 1.75H14a1.75 1.75 0 0 0 1.75-1.75V8.25"
                      />
                      <path d="m9 11 6.35-6.35M12.75 4.25h3v3" />
                    </svg>
                  </button>
                </Tooltip>
                <RoleSelector
                  value={selectedRoleKey}
                  roles={agentRoles}
                  compact
                  onChange={(role) => void changeConversationRole(role)}
                />
              {/if}
              {#if workspace?.git_branch}
                <Tooltip text={`${$t("gitBranch")}: ${workspace.git_branch}`}>
                  <span class="branch-pill">⎇ {workspace.git_branch}</span>
                </Tooltip>
              {/if}
            </div>
            <div class="title-bar-drag-handle" data-tauri-drag-region aria-hidden="true"></div>
            <div class="title-actions">
              {#if isMemorySyncing}
                <Tooltip text="Memory syncing">
                  <span class="sync-dot">●</span>
                </Tooltip>
              {/if}
              <WindowControls
                onMinimize={winMinimize}
                onMaximize={winMaximize}
                onClose={winClose}
              />
            </div>
          </header>

          {#if !tauriAvailable}
            <div class="runtime-banner">{browserModeNotice}</div>
          {/if}

          <!-- Messages -->
          <main
            class="messages"
            bind:this={messagesEl}
            onscroll={handleMessagesScroll}
            onwheel={cancelBottomScrollFromUser}
            ontouchstart={cancelBottomScrollFromUser}
            onpointerdown={cancelBottomScrollFromUser}
          >
            {#if newConversationLayout}
              <div class="new-conversation-aurora" aria-hidden="true"></div>
            {/if}
            {#if mainContentLoading && restoringSurface !== "new-conversation"}
              <LoadingSkeleton variant="conversation" label={$t("loadingContent")} />
            {:else if !mainContentLoading}
              <MessageList
                {messages}
                scrollElement={messagesEl}
                isStreaming={isCurrentStreaming}
                isAwaitingStreamOutput={isCurrentAwaitingStreamOutput}
                memoryRetrievalStage={currentMemoryRetrievalStage}
                memoryRetrievalCanSkip={currentMemoryRetrievalCanSkip}
                {currentStreamItems}
                {currentStreamMessageId}
                {activeConvId}
                activeBranchId={activeConvId ? (activeBranchIds[activeConvId] ?? null) : null}
                debugMode={isDebugMode}
                activeTree={activeConvId ? convTrees[activeConvId] : undefined}
                paddingBottom={inputAreaHeight + 24}
                showApiKeyWarn={shouldShowDefaultProviderCredentialWarning(config)}
                {shikiTheme}
                {mermaidConfig}
                htmlPreviewConfig={config?.html_preview}
                messageLayout={config?.message_layout ?? "single"}
                messageDoubleColumnMinWidth={config?.message_double_column_min_width ?? 1200}
                bookModeFontSize={config?.book_mode_font_size ?? 17}
                tailAnchorToken={streamCompletionTailAnchor?.convId === activeConvId
                  ? streamCompletionTailAnchor.token
                  : null}
                onTailAnchorSettled={finishStreamCompletionTailAnchor}
                {newConversationMemoryPrompt}
                {newConversationMemoryLoading}
                showNewConversationContext={!newConversationLayout}
                checkpointLoadError={activeConvId
                  ? (checkpointLoadErrors[activeConvId] ?? null)
                  : null}
                onCommitEdit={commitEdit}
                onReExecute={reExecuteMsg}
                onSwitchBranch={switchBranchAt}
                onSubmitUserInput={submitUserInput}
                onCancelUserInput={cancelUserInput}
                onSkipMemoryRetrieval={skipCurrentMemoryRetrieval}
              />
            {/if}
          </main>

          <!-- Input -->
          <div
            class="input-area"
            class:input-area-streaming={isCurrentStreaming}
            class:input-area-new-conversation={newConversationLayout}
            bind:clientHeight={inputAreaHeight}
          >
            <div
              class="conversation-aurora"
              class:conversation-aurora-streaming={isCurrentStreaming}
              aria-hidden="true"
            ></div>
            {#if newConversationLayout}
              <NewConversationContext
                prompt={newConversationMemoryPrompt}
                loading={mainContentLoading || newConversationMemoryLoading}
                showApiKeyWarn={shouldShowDefaultProviderCredentialWarning(config)}
                placement="stack"
              />
            {/if}
            <div class="input-inner">
              {#if mainContentLoading}
                <LoadingSkeleton variant="composer" label={$t("loadingContent")} />
              {:else}
                {#if currentFileChanges.length > 0}
                  <FileChangeBanner
                    changes={currentFileChanges}
                    onRevert={handleRevertFileChange}
                  />
                {/if}
                {#if activeConvId}
                  <ChatQueue
                    items={queuedChatMessages[activeConvId] ?? []}
                    onRemove={(index) => removeQueuedMessage(activeConvId!, index)}
                    onClear={() => clearQueuedMessages(activeConvId!)}
                  />
                {/if}
                <MessageInput
                  bind:value={inputText}
                  bind:attachments={inputAttachments}
                  bind:selectedModel
                  {modelOptions}
                  placeholder={tauriAvailable
                    ? modelOptions.length
                      ? $t("inputPlaceholder")
                      : $t("modelSetupHint")
                    : browserModeNotice}
                  disabled={!tauriAvailable}
                  isStreaming={isCurrentStreaming}
                  isPaused={isCurrentStreamPaused}
                  sendDisabled={(!inputText.trim() && inputAttachments.length === 0) ||
                    !tauriAvailable ||
                    modelOptions.length === 0}
                  sendTitle={$t("send")}
                  pauseTitle={$t("pauseOutput")}
                  resumeTitle={$t("resumeOutput")}
                  stopTitle={$t("stopOutput")}
                  {slashCommands}
                  showGlobalDraftsInMentions={config?.mention_palette_show_global_drafts ?? true}
                  onConfigureModels={() => openSettings("providers")}
                  onModelChange={handleModelChange}
                  showReasoningEffort={selectedModelSupportsReasoning}
                  reasoningEffort={selectedReasoningEffort}
                  onReasoningEffortChange={handleReasoningEffortChange}
                  onSend={sendMessage}
                  onStop={stopMessage}
                  onPause={pauseCurrentStream}
                  onResume={resumeCurrentStream}
                />
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <Toast />
</TooltipPrimitive.Provider>

<Dialog.Root
  open={wslPickerOpen}
  onOpenChange={(open) => {
    wslPickerOpen = open;
    if (!open) wslPickerError = "";
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog wsl-workspace-dialog" aria-busy={wslPickerBusy}>
      <Dialog.Title class="dialog-title">{$t("wslWorkspaceTitle")}</Dialog.Title>
      <Dialog.Description class="workspace-choice-description">
        {$t("wslWorkspaceDescription")}
      </Dialog.Description>
      <form
        class="wsl-workspace-form"
        onsubmit={(event) => {
          event.preventDefault();
          void openSelectedWslWorkspace();
        }}
      >
        <label class="wsl-field">
          <span>{$t("wslDistribution")}</span>
          <select
            value={wslDistribution}
            disabled={wslPickerBusy || wslDistributions.length === 0}
            onchange={(event) => void selectWslDistribution(event.currentTarget.value)}
          >
            {#each wslDistributions as distribution (distribution.name)}
              <option value={distribution.name}>{distribution.name}</option>
            {/each}
          </select>
        </label>
        <label class="wsl-field">
          <span>{$t("wslLinuxPath")}</span>
          <div class="wsl-path-row">
            <input
              value={wslLinuxPath}
              disabled={wslPickerBusy || !wslDistribution}
              placeholder={$t("wslPathPlaceholder")}
              spellcheck="false"
              oninput={(event) => {
                wslLinuxPath = event.currentTarget.value;
                wslPickerError = "";
              }}
            />
            <button
              class="dialog-action-quiet wsl-browse-button"
              type="button"
              disabled={wslPickerBusy || !wslDistribution || !wslLinuxPath.trim()}
              onclick={() => void browseWslWorkspace()}
            >
              {$t("wslBrowse")}
            </button>
          </div>
        </label>
        {#if wslPickerBusy}
          <div class="wsl-status">{$t("wslLoading")}</div>
        {:else if wslPickerError}
          <div class="wsl-error" role="alert">
            <strong>{$t("wslLoadFailed")}</strong>
            <span>{wslPickerError}</span>
          </div>
        {/if}
        <div class="dialog-actions">
          <button
            class="dialog-action-quiet"
            type="button"
            onclick={() => {
              wslPickerOpen = false;
            }}
          >
            {$t("cancel")}
          </button>
          <button
            class="btn-primary"
            type="submit"
            disabled={wslPickerBusy || !wslDistribution || !wslLinuxPath.trim()}
          >
            {$t("wslOpen")}
          </button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root
  open={pendingWorkspacePath !== null}
  onOpenChange={(open) => {
    if (!open) pendingWorkspacePath = null;
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog workspace-choice-dialog">
      <Dialog.Title class="dialog-title">{$t("workspaceOpenDialogTitle")}</Dialog.Title>
      <Dialog.Description class="workspace-choice-description">
        {$t("workspaceOpenDialogDescription")}
      </Dialog.Description>
      <div class="workspace-choice-path">{pendingWorkspacePath}</div>
      <div class="dialog-actions">
        <button
          class="dialog-action-quiet"
          type="button"
          onclick={() => resolveWorkspaceChoice("current_window")}
        >
          {$t("workspaceSwitchCurrent")}
        </button>
        <button
          class="btn-primary"
          type="button"
          onclick={() => resolveWorkspaceChoice("new_window")}
        >
          {$t("workspaceCreateWindow")}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  @property --input-aurora-x-shift {
    syntax: "<percentage>";
    inherits: false;
    initial-value: 0%;
  }

  @property --input-aurora-y-shift {
    syntax: "<percentage>";
    inherits: false;
    initial-value: 0%;
  }

  @property --input-aurora-scale-shift {
    syntax: "<number>";
    inherits: false;
    initial-value: 0;
  }

  .quick-chat-stage {
    width: 100vw;
    height: 100vh;
    padding: 16px 16px 20px;
    overflow: visible;
    background: transparent;
  }

  :global(html.quick-chat-window),
  :global(html.quick-chat-window body) {
    background: transparent;
  }

  .app {
    --sidebar-width: 220px;
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
  }

  /* ─── Sidebar ─────────────────────────────────────────────────────────────── */

  .sidebar {
    position: relative;
    width: var(--sidebar-width);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    overflow: visible;
    user-select: none;
    transition: width 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .sidebar.collapsed {
    width: 0;
    background: transparent;
    border-right: 0;
    overflow: visible;
  }

  .sidebar.resizing {
    transition: none;
  }

  .sidebar-top {
    min-height: 50px;
    box-sizing: border-box;
    padding: 5px 4px 5px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2px;
  }

  .sidebar-navigation-start {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .sidebar-navigation-end {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
  }

  .sidebar.collapsed .sidebar-top {
    position: relative;
    z-index: 11;
    width: 48px;
    justify-content: center;
    padding-left: 4px;
  }

  .app.sidebar-collapsed :global(.design-header),
  .app.sidebar-collapsed :global(.drafts-header),
  .app.sidebar-collapsed :global(.memory-header),
  .app.sidebar-collapsed :global(.roles-header),
  .app.sidebar-collapsed :global(.skills-header),
  .app.sidebar-collapsed :global(.onboarding-header),
  .app.sidebar-collapsed :global(.settings-header) {
    padding-left: 56px;
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }
  }

  /* ─── Main ─────────────────────────────────────────────────────────────────── */

  .main {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* Title Bar */
  .title-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 48px;
    background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 80%, transparent 100%);
    user-select: none;
  }

  .main.sidebar-collapsed .title-bar {
    padding-left: 56px;
  }

  .runtime-banner {
    padding: 10px 16px;
    background: rgba(245, 158, 11, 0.12);
    border-bottom: 1px solid rgba(245, 158, 11, 0.24);
    color: #b45309;
    font-size: 12px;
    line-height: 1.5;
  }

  .title-bar-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .title-bar-drag-handle {
    align-self: stretch;
    flex: 1 1 96px;
    min-width: 64px;
    margin: 0 8px;
  }

  .title-new-conversation {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease;
  }

  .title-new-conversation:hover,
  .title-new-conversation:focus-visible {
    background: var(--surface2);
    color: var(--text);
    outline: none;
  }

  .title-new-conversation:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .title-new-conversation:active {
    background: color-mix(in srgb, var(--surface2) 78%, var(--text) 6%);
  }

  .title-new-conversation svg {
    width: 18px;
    height: 18px;
  }

  .branch-pill {
    font-size: 11px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    color: var(--text-muted);
    background: var(--surface2);
    border: 0;
    border-radius: 12px;
    padding: 2px 8px;
    white-space: nowrap;
    letter-spacing: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: min(220px, 32vw);
    flex-shrink: 1;
  }

  .title-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .sync-dot {
    color: var(--primary);
    font-size: 10px;
    margin-right: 2px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  /* Messages */
  .messages {
    position: relative;
    z-index: 1;
    flex: 1;
    overflow-y: auto;
    overflow-x: clip;
    display: flex;
    flex-direction: column;
    overflow-anchor: none;
  }

  /* Input */
  .input-area {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;
    padding-bottom: 16px;
    background: transparent;
    pointer-events: none;
  }

  .input-area::before {
    content: "";
    position: absolute;
    inset: -48px 0 0;
    z-index: 0;
    background: linear-gradient(to top, var(--bg) 0%, var(--bg) 60%, transparent 100%);
    opacity: 1;
    pointer-events: none;
    transition: opacity 420ms ease;
  }

  .conversation-aurora {
    position: absolute;
    left: 50%;
    top: calc(100% - 122px);
    width: min(calc(100% + 100px), 1064px);
    height: 210px;
    z-index: 0;
    background:
      radial-gradient(ellipse at 12% 62%, rgba(66, 133, 244, 0.34) 0 18%, transparent 43%),
      radial-gradient(ellipse at 36% 52%, rgba(161, 66, 244, 0.3) 0 16%, transparent 42%),
      radial-gradient(ellipse at 61% 64%, rgba(234, 67, 53, 0.32) 0 17%, transparent 44%),
      radial-gradient(ellipse at 84% 54%, rgba(251, 188, 5, 0.32) 0 18%, transparent 44%),
      radial-gradient(ellipse at 50% 78%, rgba(52, 168, 83, 0.3) 0 22%, transparent 50%);
    filter: blur(26px) saturate(1.35);
    opacity: 0.56;
    -webkit-mask-image:
      linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 18%, #000 100%);
    -webkit-mask-composite: source-in;
    mask-image:
      linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%),
      linear-gradient(to bottom, transparent 0%, #000 18%, #000 100%);
    mask-composite: intersect;
    pointer-events: none;
    --input-aurora-x-shift: 0%;
    --input-aurora-y-shift: 0%;
    --input-aurora-scale-shift: 0;
    transition:
      top 760ms cubic-bezier(0.16, 1, 0.3, 1),
      width 760ms cubic-bezier(0.16, 1, 0.3, 1),
      height 760ms cubic-bezier(0.16, 1, 0.3, 1),
      --input-aurora-x-shift 560ms cubic-bezier(0.16, 1, 0.3, 1),
      --input-aurora-y-shift 560ms cubic-bezier(0.16, 1, 0.3, 1),
      --input-aurora-scale-shift 560ms cubic-bezier(0.16, 1, 0.3, 1),
      opacity 420ms ease,
      filter 560ms cubic-bezier(0.16, 1, 0.3, 1);
    animation: input-area-aurora 7.5s ease-in-out infinite alternate;
  }

  .new-conversation-aurora {
    position: absolute;
    left: 50%;
    top: calc(50% - clamp(24px, 3vh, 40px));
    width: min(calc(100% - 96px), 1120px);
    height: clamp(260px, 34vh, 420px);
    z-index: 0;
    background:
      radial-gradient(ellipse at 18% 46%, rgba(66, 133, 244, 0.2) 0 18%, transparent 56%),
      radial-gradient(ellipse at 43% 58%, rgba(52, 168, 83, 0.1) 0 18%, transparent 58%),
      radial-gradient(ellipse at 66% 42%, rgba(161, 66, 244, 0.12) 0 18%, transparent 58%),
      radial-gradient(ellipse at 84% 60%, rgba(251, 188, 5, 0.08) 0 16%, transparent 56%),
      linear-gradient(180deg, rgba(232, 246, 255, 0.32), rgba(216, 237, 255, 0.18) 60%, transparent);
    filter: blur(72px) saturate(1.1);
    opacity: 0.9;
    pointer-events: none;
    transform: translate(-50%, -50%);
    animation: new-conversation-aurora 8s ease-in-out infinite alternate;
  }

  :global(html.dark) .new-conversation-aurora {
    display: none;
  }

  .input-area::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -26px;
    width: min(calc(100% + 24px), 988px);
    height: 90px;
    z-index: 1;
    background: linear-gradient(
      to top,
      rgba(245, 245, 247, 0.82),
      rgba(245, 245, 247, 0.08) 72%,
      transparent
    );
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0%,
      #000 10%,
      #000 90%,
      transparent 100%
    );
    mask-image: linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%);
    pointer-events: none;
    transform: translateX(-50%);
    transition:
      background 1.2s cubic-bezier(0.16, 1, 0.3, 1),
      opacity 420ms ease;
  }

  .conversation-aurora-streaming {
    --input-aurora-x-shift: 9%;
    --input-aurora-y-shift: 3%;
    --input-aurora-scale-shift: 0.2;
    opacity: 0.72;
    filter: blur(28px) saturate(1.45);
  }

  .input-area-new-conversation::before,
  .input-area-new-conversation::after {
    opacity: 0;
  }

  .input-area-new-conversation {
    top: 50%;
    bottom: auto;
    padding-bottom: 0;
    transform: translateY(-50%);
  }

  .input-area-new-conversation .conversation-aurora {
    opacity: 0;
  }

  .input-area-streaming::after {
    background: linear-gradient(
      to top,
      rgba(245, 245, 247, 0.62),
      rgba(245, 245, 247, 0.04) 72%,
      transparent
    );
  }

  :global(html.dark) .input-area::after {
    background: linear-gradient(
      to top,
      rgba(15, 17, 23, 0.76),
      rgba(15, 17, 23, 0.08) 72%,
      transparent
    );
  }

  .input-inner {
    position: relative;
    z-index: 2;
    max-width: 900px;
    margin: 0 auto;
    padding: 0 32px;
    pointer-events: auto;
  }

  .input-area-new-conversation .input-inner {
    max-width: 760px;
  }

  @media (prefers-color-scheme: dark) {
    .input-area::after {
      background: linear-gradient(
        to top,
        rgba(15, 17, 23, 0.76),
        rgba(15, 17, 23, 0.08) 72%,
        transparent
      );
    }

    :global(html.light) .input-area::after {
      background: linear-gradient(
        to top,
        rgba(245, 245, 247, 0.82),
        rgba(245, 245, 247, 0.08) 72%,
        transparent
      );
    }
  }

  @keyframes input-area-aurora {
    0% {
      transform: translate3d(
          calc(-50% - 5% - var(--input-aurora-x-shift)),
          calc(8% + var(--input-aurora-y-shift)),
          0
        )
        scale(calc(1.05 + var(--input-aurora-scale-shift)));
      background-position: 0% 50%;
    }
    50% {
      transform: translate3d(
          calc(-50% + 4% + var(--input-aurora-x-shift)),
          calc(3% - var(--input-aurora-y-shift)),
          0
        )
        scale(calc(1.12 + var(--input-aurora-scale-shift)));
      background-position: 100% 50%;
    }
    100% {
      transform: translate3d(
          calc(-50% - 2% - var(--input-aurora-x-shift)),
          calc(6% + var(--input-aurora-y-shift)),
          0
        )
        scale(calc(1.09 + var(--input-aurora-scale-shift)));
      background-position: 40% 100%;
    }
  }

  @keyframes new-conversation-aurora {
    0% {
      transform: translate3d(calc(-50% - 4%), calc(-50% + 4%), 0) scale(1.04);
    }
    50% {
      transform: translate3d(calc(-50% + 4%), calc(-50% - 2%), 0) scale(1.1);
    }
    100% {
      transform: translate3d(calc(-50% - 1%), calc(-50% + 2%), 0) scale(1.07);
    }
  }

  @media (max-width: 700px) {
    .new-conversation-aurora {
      width: calc(100% - 40px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .conversation-aurora,
    .new-conversation-aurora {
      animation: none;
      transition: none;
    }
  }

  /* ─── Dialogs ─────────────────────────────────────────────────────────────── */

  :global(.dialog-overlay) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(3px);
    z-index: 100;
  }

  :global(.dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--control-surface);
    border: 0;
    border-radius: 14px;
    padding: 24px;
    width: 480px;
    max-width: 95vw;
    max-height: 90vh;
    overflow-y: auto;
    z-index: 101;
    -webkit-backdrop-filter: blur(16px) saturate(1.08);
    backdrop-filter: blur(16px) saturate(1.08);
    box-shadow: var(--raised-shadow);
  }

  :global(.dialog-wide) {
    width: 700px;
  }

  :global(.workspace-choice-dialog) {
    width: 430px;
  }

  :global(.wsl-workspace-dialog) {
    width: 520px;
  }

  :global(.wsl-workspace-form) {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  :global(.wsl-field) {
    display: flex;
    flex-direction: column;
    gap: 7px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  :global(.wsl-field select),
  :global(.wsl-field input) {
    min-width: 0;
    height: 36px;
    border: 0;
    border-radius: 7px;
    outline: none;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-weight: 400;
    box-shadow: var(--control-shadow);
  }

  :global(.wsl-field select) {
    padding: 0 10px;
  }

  :global(.wsl-field input) {
    flex: 1;
    padding: 0 11px;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  }

  :global(.wsl-field select:focus),
  :global(.wsl-field input:focus) {
    box-shadow: var(--control-shadow), var(--focus-ring);
  }

  :global(.wsl-field select:disabled),
  :global(.wsl-field input:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }

  :global(.wsl-path-row) {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  :global(.wsl-browse-button) {
    flex-shrink: 0;
  }

  :global(.wsl-status) {
    color: var(--text-muted);
    font-size: 12px;
  }

  :global(.wsl-error) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-radius: 7px;
    padding: 9px 11px;
    background: color-mix(in srgb, #b42318 10%, var(--surface));
    color: #b42318;
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  :global(.workspace-choice-description) {
    margin: -8px 0 14px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.55;
  }

  :global(.workspace-choice-path) {
    padding: 9px 11px;
    border-radius: 7px;
    background: var(--bg);
    color: var(--text-secondary);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  :global(.dialog-title) {
    font-size: 17px;
    font-weight: 600;
    margin: 0 0 20px;
    color: var(--text);
    letter-spacing: -0.2px;
  }

  :global(.dialog-actions) {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 24px;
  }

  :global(.dialog-action-quiet) {
    padding: 6px 0;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
    transition: color 0.15s;
  }

  :global(.dialog-action-quiet:hover) {
    color: var(--text);
  }

  :global(.dialog-action-quiet:focus-visible) {
    border-radius: 3px;
    box-shadow: var(--focus-ring);
    outline: none;
  }

  :global(.btn-primary) {
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 9999px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.15s,
      transform 0.1s;
  }

  :global(.btn-primary:hover) {
    background: var(--primary-hover);
  }

  :global(.btn-primary:active) {
    transform: scale(0.95);
  }

  :global(.btn-secondary) {
    background: var(--surface2);
    color: var(--text);
    border: 0;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;
    box-shadow: var(--control-shadow);
    transition:
      background 0.15s,
      transform 0.1s;
  }

  :global(.btn-secondary:hover) {
    background: var(--border);
  }

  :global(.btn-secondary:active) {
    transform: scale(0.95);
  }

  :global(.btn-secondary.btn-sm) {
    padding: 6px 12px;
    font-size: 13px;
  }

  /* ─── Streamdown table overrides ─────────────────────────────────────────── */

  :global([data-streamdown-table]) {
    overflow-x: auto;
    margin: 10px 0 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  :global([data-streamdown-table] table) {
    width: 100%;
    border-collapse: collapse;
    min-width: 0;
  }

  :global([data-streamdown-thead]) {
    background: var(--surface2);
  }

  :global([data-streamdown-th]) {
    padding: 7px 12px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  :global([data-streamdown-td]) {
    padding: 7px 12px;
    font-size: 13px;
    color: var(--text);
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    min-width: 0;
    max-width: none;
    line-height: 1.5;
  }

  :global([data-streamdown-tbody] [data-streamdown-tr]:last-child [data-streamdown-td]) {
    border-bottom: none;
  }

  :global([data-streamdown-tbody] [data-streamdown-tr]:hover) {
    background: var(--surface2);
  }

  /* ─── Streamdown general prose overrides ─────────────────────────────────── */

  :global(.assistant-msg p) {
    margin: 0 0 10px;
    line-height: 1.47;
  }

  :global(.assistant-msg h1, .assistant-msg h2, .assistant-msg h3) {
    margin: 20px 0 6px;
    font-weight: 600;
    color: var(--text);
  }

  :global(.assistant-msg h1) {
    font-size: 21px;
    letter-spacing: -0.28px;
  }
  :global(.assistant-msg h2) {
    font-size: 17px;
    letter-spacing: -0.374px;
  }
  :global(.assistant-msg h3) {
    font-size: 15px;
    letter-spacing: -0.374px;
  }

  :global(.assistant-msg ul, .assistant-msg ol) {
    margin: 4px 0 10px;
    padding-left: 22px;
  }

  :global(.assistant-msg li) {
    margin: 3px 0;
    line-height: 1.47;
  }

  :global(.assistant-msg a) {
    color: var(--primary);
    text-decoration: none;
  }

  :global(.assistant-msg a:hover) {
    text-decoration: underline;
  }

  :global(.assistant-msg blockquote) {
    margin: 8px 0 10px;
    padding: 4px 14px;
    border-left: 3px solid var(--border);
    color: var(--text-muted);
  }

  :global(.assistant-msg :not(pre) > code:not([class])) {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 13px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    letter-spacing: 0;
  }

  :global([data-streamdown-code]) {
    border: none !important;
    margin: 8px 0 12px;
    border-radius: 8px;
    overflow: hidden;
  }

  :global(.assistant-msg pre) {
    background: var(--surface2);
    border-radius: 8px;
    padding: 14px 16px;
    margin: 8px 0 12px;
    overflow-x: auto;
  }

  /* Let Shiki control the background for highlighted blocks */
  :global(.assistant-msg [data-streamdown-code] pre) {
    background: transparent;
    border-radius: 0;
    padding: 12px 16px;
    margin: 0;
  }

  :global(.assistant-msg [data-streamdown-code] pre code) {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    letter-spacing: 0;
    line-height: 1.6;
  }

  :global(.assistant-msg pre code) {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    letter-spacing: 0;
    line-height: 1.6;
  }

  /* ─── Streamdown Mermaid overrides ───────────────────────────────────────── */

  /* Replace hardcoded Tailwind bg-white / border-gray-200 with theme vars */
  :global([data-streamdown-mermaid] > div) {
    background: var(--surface) !important;
    border-color: var(--border) !important;
    overflow: hidden !important;
  }

  /* Keep the panzoom target out of normal flow so zooming cannot stretch the
     Mermaid block. The parent is already position:relative in Streamdown. */
  :global([data-streamdown-mermaid] [data-mermaid-svg]) {
    position: absolute !important;
    inset: 0 !important;
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* Keep Mermaid's generated SVG at its natural layout size; panzoom handles
     fitting it into the fixed viewport. Forcing 100% width compresses wide
     diagrams such as sequence diagrams and Gantt charts. */
  :global([data-streamdown-mermaid] [data-mermaid-svg] > svg) {
    display: block;
    margin: 0;
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .grid .tick line) {
    opacity: 0.38 !important;
    stroke-width: 1 !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .grid .tick text) {
    fill: var(--text-muted) !important;
    font-size: 11px !important;
    font-weight: 500 !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .sectionTitle) {
    fill: var(--text-muted) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .taskText),
  :global([data-streamdown-mermaid] [data-mermaid-svg] .taskTextOutsideLeft),
  :global([data-streamdown-mermaid] [data-mermaid-svg] .taskTextOutsideRight) {
    fill: var(--text) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .today) {
    stroke-width: 1.5px !important;
    opacity: 0.7 !important;
  }

  /* Toolbar buttons (zoom/fit/download) — translucent icon-button per design.md button-icon style */
  :global([data-streamdown-mermaid] .mermaid-controls) {
    z-index: 2 !important;
  }

  :global([data-streamdown-mermaid] button) {
    background: transparent !important;
    color: var(--text-muted) !important;
    border-radius: 6px !important;
    transition:
      background 0.12s,
      color 0.12s !important;
  }
  :global([data-streamdown-mermaid] button:hover) {
    background: var(--surface2) !important;
    color: var(--text) !important;
  }
  :global([data-streamdown-mermaid] button:active) {
    transform: scale(0.95) !important;
  }

  /* Download popover — mirrors .ctx-menu-content from app.css. */
  :global([data-streamdown-mermaid] .download-menu) {
    position: absolute !important;
    top: calc(100% + 6px) !important;
    right: 0 !important;
    z-index: 3 !important;
    display: flex !important;
    flex-direction: column !important;
    min-width: 88px !important;
    margin: 0 !important;
    padding: var(--menu-content-padding) !important;
    background: var(--control-surface) !important;
    border: 0 !important;
    border-radius: var(--menu-content-radius) !important;
    -webkit-backdrop-filter: blur(12px) saturate(1.08) !important;
    backdrop-filter: blur(12px) saturate(1.08) !important;
    box-shadow: var(--raised-shadow) !important;
  }
  :global([data-streamdown-mermaid] .download-menu button) {
    display: flex !important;
    align-items: center !important;
    width: 100% !important;
    min-height: var(--menu-item-min-height) !important;
    height: auto !important;
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline) !important;
    margin: 0 !important;
    font-size: var(--menu-item-font-size) !important;
    line-height: var(--menu-item-line-height) !important;
    text-align: left !important;
    justify-content: flex-start !important;
    color: var(--text) !important;
    border-radius: var(--menu-item-radius) !important;
  }
  :global([data-streamdown-mermaid] .download-menu button + button) {
    margin-top: var(--menu-item-stack-gap) !important;
  }
  :global([data-streamdown-mermaid] .download-menu button:hover) {
    background: var(--surface2) !important;
    color: var(--text) !important;
  }

  /* ─── Settings Panel ─────────────────────────────────────────────────────── */
  .reasoning-effort-preview-stage {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 32px;
    box-sizing: border-box;
    background: var(--bg);
  }

  .permission-settings-preview-stage {
    min-height: 100vh;
    display: flex;
    justify-content: center;
    padding: 48px 24px;
    box-sizing: border-box;
    background: var(--bg);
  }

  .permission-settings-preview-card {
    width: min(680px, 100%);
  }

  .permission-settings-preview-card header {
    margin: 0 4px 18px;
  }

  .permission-settings-preview-card h1,
  .permission-settings-preview-card p {
    margin: 0;
  }

  .permission-settings-preview-card h1 {
    color: var(--text);
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.4px;
  }

  .permission-settings-preview-card p {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .workspace-switcher-preview-stage {
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 96px 32px 32px;
    box-sizing: border-box;
    background: var(--bg);
  }

  .command-palette-preview-stage {
    min-height: 100vh;
    display: flex;
    align-items: flex-end;
    padding: 16px 15px;
    box-sizing: border-box;
    background: var(--bg);
  }

  .command-palette-preview-stage :global(.input-wrapper) {
    width: 100%;
  }

  .workspace-switcher-preview-stage :global(.workspace-btn) {
    background: var(--control-surface);
    box-shadow: var(--control-shadow);
  }

  .reasoning-effort-preview-card {
    width: min(420px, calc(100vw - 48px));
    display: grid;
    gap: 18px;
    padding: 24px;
    box-sizing: border-box;
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--raised-shadow);
  }

  .reasoning-effort-preview-model {
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }

  .reasoning-effort-preview-card code {
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
