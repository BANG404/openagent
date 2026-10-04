<!-- eslint-disable max-lines -- settings surface is the composition root for the settings domains. -->
<script lang="ts">
  /* eslint-disable max-lines */
  import { setContext } from "svelte";
  import "./settings-view.css";
  import SettingsViewTabsPrimary from "./SettingsViewTabsPrimary.svelte";
  import SettingsViewTabsSecondary from "./SettingsViewTabsSecondary.svelte";
  import SettingsViewDialogs from "./SettingsViewDialogs.svelte";
  import { desktopOpenAgent, emit, invoke, listen } from "$lib/openagent/tauriClient";
  import { isTauri } from "@tauri-apps/api/core";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
  import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
  import { onMount, tick, untrack } from "svelte";
  import { Tabs } from "bits-ui";
  import type {
    AgentPluginSummary,
    AgentPluginInstallProgress,
    AgentPluginMarketplaceSummary,
    AgentPluginSidebarViewSummary,
    AgentPluginUpdateReport,
    AgentPluginUpdateSummary,
    AgentMemoryEntry,
    AppConfig,
    PermissionProfile,
    ProviderConfig,
  } from "$lib/types";
  import { captureQuickChatShortcut } from "$lib/quickChatShortcut";
  import { desktopPluginInstallQueue, type PluginInstallTask } from "$lib/agentPluginInstallQueue";
  import {
    normalizeConfigShape,
    type NormalizedAppConfig,
    type NormalizedMcpServerConfig,
  } from "$lib/config";
  import { applyDocumentTheme } from "$lib/appTheme";
  import { reportFrontendDiagnostic } from "$lib/frontendDiagnostics";
  import {
    CUA_DRIVER_COMMAND,
    CUA_DRIVER_ID,
    createCuaDriverServer,
    cuaDriverMcpArgs,
    isCuaDriverServerCurrent,
  } from "$lib/cuaDriver";
  import { cuaDriverEndpoint, startCuaDriverDaemon } from "$lib/openagent/cuaDriverHost";
  import {
    providerCatalogEntry,
    providerDefaultBaseUrl,
    providerIconPath,
  } from "$lib/providerCatalog";
  import {
    applyDetectedProviderModels,
    applyFetchedProviderModels,
    createProviderConfig,
    mcpConnectionFingerprint,
    mcpOAuthHintKey,
    providerConnectionFingerprint,
    providerRequestUrl,
    providerServiceName,
    repairModelBindings,
    replaceProviderModels,
    selectModelBindingProvider,
    settingsConfigChanged,
    shouldOfferMcpAuthorization,
    type McpOAuthCapability,
    type RetryQueueKind,
  } from "$lib/settingsConfig";
  import { t, tr, setLocale, type Locale, type TranslationKeys } from "$lib/i18n";
  import {
    agentPluginUpdateErrorKey,
    classifyAgentPluginUpdateCheck,
    coalesceAgentPluginUpdateCheck,
    type AgentPluginUpdateCheckOutcome,
    type AgentPluginUpdateFailure,
  } from "$lib/agentPluginUpdateCheck";
  import {
    BUNDLED_OFFICIAL_PLUGIN_REGISTRY,
    projectOfficialPluginCatalog,
    type OfficialPluginCatalogFilter,
    type OfficialPluginCatalogItem,
    type OfficialPluginRegistryEntry,
  } from "$lib/officialPluginRegistry";
  import type { SettingsNav } from "$lib/settingsWindows";
  import {
    pluginSidebarLifecycle,
    type PluginSidebarContext,
    type PluginSidebarLifecycle,
  } from "$lib/pluginSidebar";
  import type { RightSidebarPanel } from "$lib/rightSidebar";
  import { DEFAULT_APP_CONFIG } from "$lib/settingsDefaults";

  type StandardChannelKind = "feishu" | "telegram" | "qq" | "discord" | "slack";
  type ChannelSettingsNav = StandardChannelKind | "wechat" | "gateway";
  type ComponentVersions = {
    release: string;
    shell: string;
    runtime: string | null;
  };
  type ProviderStatus = {
    tone: "idle" | "loading" | "success" | "error";
    message: string;
  };
  type ProviderProbeResult = {
    ok: boolean;
    message: string;
    models: string[];
  };
  type McpProbeResult = {
    tools: string[];
    resources: string[];
    fingerprint: string;
  };
  // A probe reports the connected result or the failure message, together with
  // what the attempt revealed about OAuth. A connector that needs authorization
  // cannot describe itself through the result alone, because the probe fails.
  type McpProbeOutcome = {
    probe?: McpProbeResult;
    error?: string;
    oauth?: McpOAuthCapability;
    oauth_detail?: string;
  };
  type McpOAuthStart = {
    authorization_url: string;
  };
  type McpOAuthStatus = {
    authorized: boolean;
    expires_at?: number | null;
    error?: string | null;
  };
  type RemoteGatewayStatus = {
    enabled: boolean;
    url: string;
    lan_url: string | null;
    pairing_code: string;
  };
  type WechatChannelStatus = {
    enabled: boolean;
    state: "disabled" | "starting" | "awaiting_scan" | "connected" | "error";
    qr_image_data_url: string | null;
    account_id: string | null;
    error: string | null;
  };
  type ChannelStatus = {
    channel: StandardChannelKind;
    enabled: boolean;
    state: "disabled" | "starting" | "connected" | "error";
    account_id: string | null;
    error: string | null;
  };
  let {
    config,
    workspacePath,
    initialNav,
    sections,
    onSave,
    onOpenConversation,
    onThemePreview,
    onOpenPluginSidebarView,
    pluginSidebarContext = {
      hasWorkspace: workspacePath.trim().length > 0,
      hasConversation: false,
    },
  }: {
    config: AppConfig | null;
    workspacePath: string;
    initialNav?: SettingsNav;
    sections?: SettingsNav[];
    onSave: (config: AppConfig, baseConfig?: AppConfig) => Promise<AppConfig>;
    onOpenConversation: (conversationId: string) => Promise<void>;
    onThemePreview?: (theme: string) => void;
    /** Absent in the standalone settings window, which owns no right sidebar. */
    onOpenPluginSidebarView?: (panel: RightSidebarPanel) => void;
    pluginSidebarContext?: PluginSidebarContext;
  } = $props();

  const visibleSections = $derived(
    new Set(
      sections ?? [
        "general",
        "channels",
        "providers",
        "defaults",
        "execution",
        "agents",
        "memory",
        "extensions",
        "plugins",
        "about",
      ],
    ),
  );

  let componentVersions = $state<ComponentVersions>({
    release: "...",
    shell: "...",
    runtime: null,
  });

  let channelSettingsNav = $state<ChannelSettingsNav>("feishu");
  let selectedSettingsSection = $state<SettingsNav>("general");
  let initialSectionResolved = false;
  let lastInitialNav: SettingsNav | undefined;
  $effect(() => {
    const nextInitialNav = initialNav;
    const nextSection = nextInitialNav ?? sections?.[0] ?? "general";
    if (initialSectionResolved && nextInitialNav === lastInitialNav) return;
    initialSectionResolved = true;
    lastInitialNav = nextInitialNav;
    selectedSettingsSection = nextSection;
  });
  // Contextual entry points can override the ordinary General default after
  // this dynamically loaded Tabs root has finished registering its triggers.
  $effect(() => {
    if (!initialNav) return;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (document.querySelector<HTMLButtonElement>("[data-tabs-trigger][data-state=active]")) {
          return;
        }
        document
          .querySelector<HTMLButtonElement>(`[data-tabs-trigger][data-value="${initialNav}"]`)
          ?.click();
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  });
  let selectedProviderId = $state("default");
  let providerSearch = $state("");
  let providerFilter = $state<"all" | "enabled" | "disabled">("all");
  let modelSearch = $state("");
  let manualModelName = $state("");
  let providerStatus = $state<Record<string, ProviderStatus>>({});
  let modelLoading = $state<Record<string, boolean>>({});
  let chatgptOAuthAuthenticated = $state(false);

  type McpTestStatus = { tone: "idle" | "testing" | "success" | "error"; message: string };
  const isMcpSettingsPreview =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("mcp-settings-preview");
  let mcpTestStatus = $state<Record<string, McpTestStatus>>({});
  // The OAuth capability each connector's last probe revealed. An absent entry
  // means the connector has not been tested since it was last edited, which
  // keeps the authorization action visible rather than guessing about it.
  let mcpOAuthCapabilities = $state<Record<string, McpOAuthCapability>>({});
  let agentPlugins = $state<AgentPluginSummary[]>([]);
  let agentPluginMarketplaces = $state<AgentPluginMarketplaceSummary[]>([]);
  let agentPluginUpdates = $state<AgentPluginUpdateSummary[]>([]);
  let agentPluginUpdatesLoading = $state(false);
  let agentPluginUpdating = $state<string | null>(null);
  let agentPluginRemoveId = $state<string | null>(null);
  let agentPluginRemoving = $state(false);
  let agentPluginsLoading = $state(false);
  let agentPluginStatus = $state("");
  let agentPluginUpdateCheckStatus = $state<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  let officialPluginQuery = $state("");
  let officialPluginFilter = $state<OfficialPluginCatalogFilter>("all");
  let pluginManagementView = $state<"marketplace" | "installed">("marketplace");
  const pluginInstallQueue = desktopPluginInstallQueue;
  let agentPluginInstallTasks = $state<PluginInstallTask[]>(pluginInstallQueue.snapshot());
  let agentPluginRefreshSequence = 0;
  const pluginInstallStageKeys: Record<AgentPluginInstallProgress["stage"], TranslationKeys> = {
    preparing: "pluginInstallPreparing",
    downloading: "pluginInstallDownloading",
    validating: "pluginInstallValidating",
    installing: "pluginInstallCopying",
    connecting: "pluginInstallConnecting",
    complete: "pluginInstalled",
  };
  function agentPluginInstallMessage(task: PluginInstallTask): string {
    return task.status === "error"
      ? `${tr("pluginOperationFailed")}: ${task.error}`
      : tr(pluginInstallStageKeys[task.progress.stage]);
  }
  const officialPluginCards = $derived.by<OfficialPluginCatalogItem[]>(() =>
    projectOfficialPluginCatalog(BUNDLED_OFFICIAL_PLUGIN_REGISTRY, {
      installed: new Map(agentPlugins.map((plugin) => [plugin.id, plugin.version])),
      updates: new Set(
        agentPluginUpdates.filter((update) => update.update_available).map((update) => update.id),
      ),
      query: officialPluginQuery,
      filter: officialPluginFilter,
    }),
  );
  let mcpDiscoveredTools = $state<Record<string, string[]>>(
    isMcpSettingsPreview
      ? {
          "preview-mcp": [
            "create_design_asset",
            "delete_design_asset",
            "inspect_design_asset_with_a_very_long_tool_name",
          ],
        }
      : {},
  );
  let selectedMcpId = $state<string | null>(null);
  // Keep a newly added, incomplete MCP row local until its connection details
  // are usable. Otherwise normalization or a concurrent reload can replace it
  // before the user has finished entering the URL/command.
  let pendingMcpServerIds = $state(new Set<string>());
  let memoryScope = $state<"global" | "local">("global");
  let memoryUserContent = $state("");
  let memorySavedContent = $state("");
  const memoryDirty = $derived(memoryUserContent !== memorySavedContent);
  let memoryAgentEntries = $state<AgentMemoryEntry[]>([]);
  let memoryAgentSearch = $state("");
  let memoryLoading = $state(false);
  let memoryLoaded = $state(false);
  let memoryAgentLoading = $state(false);
  let memoryAgentRequestSeq = 0;
  let memorySearchTimer: ReturnType<typeof setTimeout> | undefined;
  let memorySaving = $state(false);
  let memoryRequestSeq = 0;
  let memoryStatus = $state("");
  let memoryBusy = $state(false);
  let memoryClearDialogOpen = $state(false);
  let memoryClearInput = $state("");
  let memoryClearCloseHandled = false;
  let modelConfigDialogOpen = $state(false);
  let modelConfigProviderId = $state("");
  let modelConfigOriginalName = $state("");
  let modelConfigName = $state("");
  let modelConfigThreshold = $state<string | number | undefined>("");
  let modelConfigSupportsReasoningEffort = $state(false);
  let modelConfigSupportsVision = $state(false);
  let autostartReady = $state(false);
  let autostartSyncing = $state(false);
  let autostartStatus = $state("");
  let autostartRequestSeq = 0;
  let lastAutostartTarget: boolean | null = null;
  let remoteGatewayStatus = $state<RemoteGatewayStatus | null>(null);
  let remoteGatewayMessage = $state("");
  let remoteGatewayBusy = $state(false);
  let copiedRemoteValue = $state<"url" | "lan" | "code" | null>(null);
  let remoteCopyTimer: ReturnType<typeof setTimeout> | null = null;
  let wechatChannelStatus = $state<WechatChannelStatus | null>(null);
  let wechatChannelBusy = $state(false);
  let wechatChannelMessage = $state("");
  let channelStatuses = $state<Partial<Record<StandardChannelKind, ChannelStatus>>>({});
  let wechatStatusTimer: ReturnType<typeof setInterval> | null = null;
  let draggedRetryQueue = $state<{ kind: RetryQueueKind; index: number } | null>(null);
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveInitialized = false;
  let suppressNextAutoSave = false;
  let pendingSave: Promise<void> = Promise.resolve();
  const providerConnectionFingerprints = new Map<string, string>();
  const mcpConnectionFingerprints = new Map<string, string>();

  let draftConfig = $state<NormalizedAppConfig>(
    normalizeConfigShape(untrack(() => config) ?? DEFAULT_APP_CONFIG),
  );
  const cuaDriverId = CUA_DRIVER_ID;
  let userMcpServers = $derived(
    draftConfig.mcp.servers.filter((server) => server.id !== cuaDriverId),
  );
  let permissionProfile = $derived(draftConfig.permission_profile as PermissionProfile);
  let quickShortcutRecording = $state(false);
  let quickShortcutStatus = $state<{
    tone: "idle" | "saving" | "success" | "error";
    message: string;
  }>({ tone: "idle", message: "" });
  // The page normally waits for settings to load before mounting this view.
  // Keep this guard as a second line of defence: a view initially mounted with
  // `config === null` must never autosave the empty fallback over providers.
  let initializedFromConfig = $state(false);
  let cuaDefaultApplied = $state(false);
  let acceptedConfigFingerprint = JSON.stringify(
    normalizeConfigShape(untrack(() => config) ?? DEFAULT_APP_CONFIG),
  );
  ensureSelectedProvider();
  ensureSelectedMcpServer();

  $effect(() => {
    if (!config) return;
    const incoming = normalizeConfigShape(config);
    const incomingFingerprint = JSON.stringify(incoming);
    if (!initializedFromConfig) {
      draftConfig = incoming;
      acceptedConfigFingerprint = incomingFingerprint;
      ensureSelectedProvider();
      ensureSelectedMcpServer();
      initializedFromConfig = true;
      return;
    }
    if (incomingFingerprint === acceptedConfigFingerprint) return;

    const draftFingerprint = JSON.stringify($state.snapshot(draftConfig));
    if (draftFingerprint === incomingFingerprint) {
      acceptedConfigFingerprint = incomingFingerprint;
      return;
    }
    // Preserve an unsaved local edit until the backend can merge it against
    // the exact base snapshot or report a conflict. Clean drafts hot-reload.
    if (draftFingerprint !== acceptedConfigFingerprint) return;

    suppressNextAutoSave = true;
    draftConfig = incoming;
    acceptedConfigFingerprint = incomingFingerprint;
    ensureSelectedProvider();
    ensureSelectedMcpServer();
  });

  function findCuaDriverServer(): NormalizedMcpServerConfig | undefined {
    return draftConfig.mcp.servers.find((server) => server.id === cuaDriverId);
  }

  function setCuaDriverEnabled(enabled: boolean) {
    draftConfig.agent_plugins_enabled = {
      ...(draftConfig.agent_plugins_enabled ?? {}),
      [cuaDriverId]: enabled,
    };
    const existing = findCuaDriverServer();
    if (existing) {
      existing.enabled = enabled;
      return;
    }
    const created = createCuaDriverServer(cuaDriverEndpoint());
    created.enabled = enabled;
    draftConfig.mcp.servers = [created, ...draftConfig.mcp.servers];
  }

  function agentPluginEnabled(pluginId: string): boolean {
    return draftConfig.agent_plugins_enabled?.[pluginId] ?? true;
  }

  function setAgentPluginEnabled(pluginId: string, enabled: boolean) {
    draftConfig.agent_plugins_enabled = {
      ...(draftConfig.agent_plugins_enabled ?? {}),
      [pluginId]: enabled,
    };
  }

  function pluginRequestsHostAccess(plugin: AgentPluginSummary): boolean {
    return plugin.capabilities.some((capability) =>
      ["desktop-control", "host-access", "computer-use"].includes(capability.toLowerCase()),
    );
  }

  function agentPluginHostAccess(pluginId: string): boolean {
    return draftConfig.agent_plugins_host_access?.[pluginId] ?? false;
  }

  function setAgentPluginHostAccess(pluginId: string, granted: boolean) {
    draftConfig.agent_plugins_host_access = {
      ...(draftConfig.agent_plugins_host_access ?? {}),
      [pluginId]: granted,
    };
  }

  /**
   * Resolves one declared sidebar view against the host context the main window
   * reported. The plugin manager shows the same lifecycle the right sidebar
   * applies, so an entry it disables is exactly a panel the sidebar hides.
   */
  function pluginSidebarLifecycleFor(
    plugin: AgentPluginSummary,
    view: AgentPluginSidebarViewSummary,
  ): PluginSidebarLifecycle {
    return pluginSidebarLifecycle(view, plugin, pluginSidebarContext);
  }

  let cuaDriver = $derived(findCuaDriverServer() ?? createCuaDriverServer(cuaDriverEndpoint()));

  $effect(() => {
    if (!initializedFromConfig || cuaDefaultApplied) return;
    const endpoint = cuaDriverEndpoint();
    // The desktop host owns the reserved endpoint, so an unresolved endpoint
    // means this surface cannot build the fixed launch shape yet.
    if (!endpoint) return;
    cuaDefaultApplied = true;
    const existing = findCuaDriverServer();
    if (!existing) {
      draftConfig.mcp.servers = [createCuaDriverServer(endpoint), ...draftConfig.mcp.servers];
      queueMicrotask(() => saveDraftConfig().catch(console.error));
      return;
    }
    if (isCuaDriverServerCurrent(existing, endpoint)) return;
    // Entries written by older OpenAgent builds carried a permission mode, a
    // user-selected socket, and manifest overrides. The launch topology is
    // fixed product policy now, so normalize the reserved entry before the
    // next settings save.
    existing.command = CUA_DRIVER_COMMAND;
    existing.args = cuaDriverMcpArgs(endpoint);
    existing.env = {};
    existing.plugin_owned = true;
    queueMicrotask(() => saveDraftConfig().catch(console.error));
  });

  function snapshotDraftConfig() {
    const snapshot = $state.snapshot(draftConfig) as AppConfig;
    const fallbackId = snapshot.providers[0]?.id ?? "";
    if (!snapshot.defaults.chat_model.provider_id)
      snapshot.defaults.chat_model.provider_id = fallbackId;
    if (!snapshot.defaults.flash_model.provider_id)
      snapshot.defaults.flash_model.provider_id = fallbackId;
    return snapshot;
  }

  function rebaseDraftValue(base: unknown, saved: unknown, edited: unknown): unknown {
    if (JSON.stringify(edited) === JSON.stringify(base)) return structuredClone(saved);
    if (
      base !== null &&
      saved !== null &&
      edited !== null &&
      typeof base === "object" &&
      typeof saved === "object" &&
      typeof edited === "object" &&
      !Array.isArray(base) &&
      !Array.isArray(saved) &&
      !Array.isArray(edited)
    ) {
      const baseRecord = base as Record<string, unknown>;
      const savedRecord = saved as Record<string, unknown>;
      const editedRecord = edited as Record<string, unknown>;
      const rebased: Record<string, unknown> = {};
      for (const key of new Set([
        ...Object.keys(baseRecord),
        ...Object.keys(savedRecord),
        ...Object.keys(editedRecord),
      ])) {
        rebased[key] = rebaseDraftValue(baseRecord[key], savedRecord[key], editedRecord[key]);
      }
      return rebased;
    }
    return structuredClone(edited);
  }

  function saveDraftConfig() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (!initializedFromConfig) return Promise.resolve();
    const snapshot = snapshotDraftConfig();
    const incompletePendingMcp = snapshot.mcp.servers.some((server) => {
      if (!pendingMcpServerIds.has(server.id)) return false;
      return server.transport === "http" ? !server.url.trim() : !server.command.trim();
    });
    if (incompletePendingMcp) return Promise.resolve();
    if (!settingsConfigChanged(snapshot, acceptedConfigFingerprint)) return Promise.resolve();
    const baseConfig = JSON.parse(acceptedConfigFingerprint) as AppConfig;
    pendingSave = pendingSave
      .catch(() => {})
      .then(async () => {
        try {
          const saved = normalizeConfigShape(await onSave(snapshot, baseConfig));
          const pluginEnablementChanged =
            JSON.stringify(saved.agent_plugins_enabled ?? {}) !==
            JSON.stringify(baseConfig.agent_plugins_enabled ?? {});
          const edited = snapshotDraftConfig();
          const rebased = normalizeConfigShape(
            rebaseDraftValue(snapshot, saved, edited) as AppConfig,
          );
          suppressNextAutoSave = true;
          draftConfig = rebased;
          acceptedConfigFingerprint = JSON.stringify(saved);
          for (const server of edited.mcp.servers) pendingMcpServerIds.delete(server.id);
          ensureSelectedProvider();
          ensureSelectedMcpServer();
          // The plugin manager lists each sidebar view through the installed
          // plugin summary, so an enablement save must re-read it; otherwise the
          // row keeps a stale lifecycle until the settings surface remounts.
          if (pluginEnablementChanged) void refreshAgentPlugins();
          // Runtime resolves authorization from saved configuration. Starting
          // from a switch handler races the save and sees the previous grant.
          if (
            saved.agent_plugins_host_access?.[cuaDriverId] &&
            saved.agent_plugins_enabled?.[cuaDriverId] !== false &&
            (!baseConfig.agent_plugins_host_access?.[cuaDriverId] ||
              baseConfig.agent_plugins_enabled?.[cuaDriverId] === false)
          ) {
            try {
              if (await startCuaDriverDaemon()) {
                await desktopOpenAgent.invokeProduct("refresh_mcp_servers", {});
              }
            } catch (error) {
              agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
            }
          }
        } catch (error) {
          reportFrontendDiagnostic("settings_save_failed", "SettingsView", error);
          await tick();
          if (config) {
            const latest = normalizeConfigShape(config);
            suppressNextAutoSave = true;
            draftConfig = latest;
            acceptedConfigFingerprint = JSON.stringify(latest);
            for (const id of pendingMcpServerIds) {
              if (!latest.mcp.servers.some((server) => server.id === id)) {
                pendingMcpServerIds.delete(id);
              }
            }
            ensureSelectedProvider();
            ensureSelectedMcpServer();
          }
          throw error;
        }
      });
    return pendingSave;
  }

  async function commitQuickChatShortcut(shortcut: string) {
    const previousShortcut = draftConfig.quick_chat_shortcut;
    quickShortcutRecording = false;
    if (shortcut === previousShortcut) {
      quickShortcutStatus = { tone: "idle", message: "" };
      return;
    }
    draftConfig.quick_chat_shortcut = shortcut;
    quickShortcutStatus = { tone: "saving", message: $t("quickShortcutSaving") };
    await tick();
    try {
      await saveDraftConfig();
      quickShortcutStatus = { tone: "success", message: $t("quickShortcutSaved") };
    } catch {
      draftConfig.quick_chat_shortcut = previousShortcut;
      quickShortcutStatus = { tone: "error", message: $t("quickShortcutUnavailable") };
    }
  }

  function handleQuickShortcutKeydown(event: KeyboardEvent) {
    if (!quickShortcutRecording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      quickShortcutRecording = false;
      quickShortcutStatus = { tone: "idle", message: "" };
      return;
    }
    const captured = captureQuickChatShortcut(event);
    if (captured.kind === "pending") return;
    if (captured.kind === "error") {
      quickShortcutStatus = {
        tone: "error",
        message:
          captured.reason === "modifier_required"
            ? $t("quickShortcutModifierRequired")
            : $t("quickShortcutUnsupported"),
      };
      return;
    }
    void commitQuickChatShortcut(captured.value);
  }

  $effect(() => {
    JSON.stringify(draftConfig);
    if (suppressNextAutoSave) {
      suppressNextAutoSave = false;
      return;
    }
    if (!autoSaveInitialized) {
      autoSaveInitialized = true;
      return;
    }
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveDraftConfig().catch(console.error), 600);
  });

  $effect(() => {
    if (!initializedFromConfig) return;
    for (const provider of draftConfig.providers) {
      const next = providerConnectionFingerprint(provider);
      const previous = providerConnectionFingerprints.get(provider.id);
      if (previous !== undefined && previous !== next && provider.enabled) {
        provider.enabled = false;
        repairDefaultModelBindings();
        providerStatus = {
          ...providerStatus,
          [provider.id]: { tone: "error", message: $t("configurationChangedReenable") },
        };
      }
      providerConnectionFingerprints.set(provider.id, next);
    }
    for (const server of draftConfig.mcp.servers) {
      const next = mcpConnectionFingerprint(server);
      const previous = mcpConnectionFingerprints.get(server.id);
      if (previous !== undefined && previous !== next) {
        // A capability describes one set of connection details, so editing any
        // of them retires the conclusion and restores the authorization action
        // until the connector is tested again.
        const { [server.id]: _retired, ...remainingCapabilities } = mcpOAuthCapabilities;
        mcpOAuthCapabilities = remainingCapabilities;
        if (server.enabled) {
          server.enabled = false;
          mcpTestStatus = {
            ...mcpTestStatus,
            [server.id]: { tone: "error", message: $t("configurationChangedReenable") },
          };
        }
      }
      mcpConnectionFingerprints.set(server.id, next);
    }
  });

  onMount(() => {
    if (!isTauri()) {
      autostartReady = true;
      return;
    }
    invoke<ComponentVersions>("get_component_versions")
      .then((versions) => {
        componentVersions = versions;
      })
      .catch(() => {});
    if (visibleSections.has("channels")) {
      refreshRemoteGateway().catch(() => {});
      refreshChannelStatuses().catch(() => {});
      refreshWechatChannel().catch(() => {});
      wechatStatusTimer = setInterval(() => {
        refreshChannelStatuses().catch(() => {});
        refreshWechatChannel().catch(() => {});
      }, 1500);
    }
    if (visibleSections.has("providers")) refreshChatgptAuthStatus().catch(() => {});
    if (visibleSections.has("plugins")) refreshAgentPlugins().catch(() => {});
    const unlistenPluginInstalls = pluginInstallQueue.subscribe((tasks) => {
      agentPluginInstallTasks = tasks;
    });
    const unlistenPluginChanges = visibleSections.has("plugins")
      ? listen("agent-plugins-changed", () => {
          void refreshAgentPlugins();
        })
      : Promise.resolve(() => {});
    const unlistenRemotePairingCode = visibleSections.has("channels")
      ? listen("remote-gateway-pairing-code-rotated", () => {
          refreshRemoteGateway().catch(() => {});
        })
      : Promise.resolve(() => {});
    if (visibleSections.has("general")) {
      isEnabled()
        .then((enabled) => {
          lastAutostartTarget = enabled;
          draftConfig.launch_on_startup = enabled;
        })
        .catch((err) => {
          autostartStatus = `${err}`;
        })
        .finally(() => {
          autostartReady = true;
        });
    } else {
      autostartReady = true;
    }
    return () => {
      unlistenPluginInstalls();
      void unlistenPluginChanges.then((dispose) => dispose());
      void unlistenRemotePairingCode.then((dispose) => dispose());
      if (remoteCopyTimer) clearTimeout(remoteCopyTimer);
      if (wechatStatusTimer) clearInterval(wechatStatusTimer);
      saveDraftConfig().catch(console.error);
    };
  });

  function memoryAgentScope(scope = memoryScope): string | null {
    if (scope === "global") return "global";
    return workspacePath || null;
  }

  async function refreshMemory(scope = memoryScope, query = memoryAgentSearch) {
    const preserveDraft = memoryDirty;
    const requestSeq = ++memoryRequestSeq;
    const agentRequestSeq = ++memoryAgentRequestSeq;
    memoryAgentLoading = false;
    if (!isTauri() || !memoryScopeAvailable(scope)) {
      memoryUserContent = "";
      memorySavedContent = "";
      memoryAgentEntries = [];
      memoryLoading = false;
      memoryLoaded = false;
      return;
    }
    const agentScope = memoryAgentScope(scope);
    if (!agentScope) return;
    memoryLoading = true;
    try {
      const [userMemory, agentMemories] = await Promise.all([
        desktopOpenAgent.invokeProduct("get_memory", { scope }),
        desktopOpenAgent.invokeProduct("get_agent_memories", {
          scope: agentScope,
          query: query.trim() || null,
        }),
      ]);
      if (requestSeq !== memoryRequestSeq) return;
      if (!preserveDraft) {
        memoryUserContent = userMemory;
        memorySavedContent = userMemory;
      }
      memoryLoaded = true;
      if (agentRequestSeq === memoryAgentRequestSeq) memoryAgentEntries = agentMemories;
    } catch (err: unknown) {
      if (requestSeq === memoryRequestSeq) memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      if (requestSeq === memoryRequestSeq) memoryLoading = false;
    }
  }

  async function refreshAgentMemories() {
    if (!isTauri() || !memoryScopeAvailable()) {
      memoryAgentEntries = [];
      return;
    }
    const agentScope = memoryAgentScope();
    if (!agentScope) return;
    const requestSeq = ++memoryAgentRequestSeq;
    memoryAgentLoading = true;
    try {
      const entries = await desktopOpenAgent.invokeProduct("get_agent_memories", {
        scope: agentScope,
        query: memoryAgentSearch.trim() || null,
      });
      if (requestSeq === memoryAgentRequestSeq) memoryAgentEntries = entries;
    } catch (err: unknown) {
      if (requestSeq === memoryAgentRequestSeq)
        memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      if (requestSeq === memoryAgentRequestSeq) memoryAgentLoading = false;
    }
  }

  function searchAgentMemories() {
    clearTimeout(memorySearchTimer);
    ++memoryAgentRequestSeq;
    memoryAgentLoading = true;
    memorySearchTimer = setTimeout(() => void refreshAgentMemories(), 250);
  }

  function discardMemoryDraft() {
    memoryUserContent = memorySavedContent;
    memoryStatus = "";
  }

  async function saveUserMemory() {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    memorySaving = true;
    memoryStatus = "";
    const content = memoryUserContent;
    try {
      await desktopOpenAgent.invokeProduct("save_memory", {
        scope: memoryScope,
        content,
      });
      memorySavedContent = content;
      memoryStatus = tr("memorySaveSuccess");
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memorySaving = false;
    }
  }

  async function removeAgentMemory(entry: AgentMemoryEntry) {
    if (!window.confirm(tr("memoryDeleteConfirm"))) return;
    memoryBusy = true;
    memoryStatus = "";
    try {
      await desktopOpenAgent.invokeProduct("delete_agent_memory", { id: entry.id });
      memoryAgentEntries = memoryAgentEntries.filter((item) => item.id !== entry.id);
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memoryBusy = false;
    }
  }

  function formatMemoryDate(timestamp: number): string {
    return new Intl.DateTimeFormat(draftConfig.language === "en" ? "en-US" : "zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp * 1000));
  }

  $effect(() => {
    const scope = memoryScope;
    if (!visibleSections.has("memory")) return;
    untrack(() => {
      clearTimeout(memorySearchTimer);
      ++memoryAgentRequestSeq;
      memoryAgentLoading = false;
      memoryAgentSearch = "";
      memoryUserContent = "";
      memorySavedContent = "";
      memoryAgentEntries = [];
      memoryLoaded = false;
      memoryStatus = "";
      refreshMemory(scope, "").catch(() => {});
    });
  });

  onMount(() => () => clearTimeout(memorySearchTimer));

  async function refreshRemoteGateway() {
    remoteGatewayStatus = (await desktopOpenAgent.invokeProduct(
      "get_remote_gateway_status",
      {},
    )) as RemoteGatewayStatus;
  }

  async function refreshWechatChannel() {
    wechatChannelStatus = (await desktopOpenAgent.invokeProduct(
      "get_wechat_channel_status",
      {},
    )) as WechatChannelStatus;
  }

  async function refreshChannelStatuses() {
    const statuses = (await desktopOpenAgent.invokeProduct(
      "get_channel_statuses",
      {},
    )) as ChannelStatus[];
    channelStatuses = Object.fromEntries(statuses.map((status) => [status.channel, status]));
  }

  function parseChannelIds(value: string) {
    return value
      .split(/[\s,，]+/)
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async function reconnectWechatChannel() {
    wechatChannelBusy = true;
    wechatChannelMessage = "";
    try {
      await desktopOpenAgent.invokeProduct("reset_wechat_channel", {});
      await refreshWechatChannel();
    } catch (error) {
      wechatChannelMessage = `${error}`;
    } finally {
      wechatChannelBusy = false;
    }
  }

  function toggleCurrentWorkspaceAccess() {
    if (!workspacePath) return;
    const allowed = draftConfig.remote_gateway.allowed_workspaces;
    draftConfig.remote_gateway.allowed_workspaces = allowed.includes(workspacePath)
      ? allowed.filter((path) => path !== workspacePath)
      : [...allowed, workspacePath];
  }

  async function rotateRemotePairingCode() {
    remoteGatewayBusy = true;
    remoteGatewayMessage = "";
    try {
      const pairing_code = await desktopOpenAgent.invokeProduct(
        "rotate_remote_gateway_pairing_code",
        {},
      );
      if (remoteGatewayStatus) remoteGatewayStatus = { ...remoteGatewayStatus, pairing_code };
    } catch (error) {
      remoteGatewayMessage = `${error}`;
    } finally {
      remoteGatewayBusy = false;
    }
  }

  async function copyRemoteGatewayValue(value: string, kind: "url" | "lan" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      copiedRemoteValue = kind;
      if (remoteCopyTimer) clearTimeout(remoteCopyTimer);
      remoteCopyTimer = setTimeout(() => {
        copiedRemoteValue = null;
      }, 1800);
    } catch (error) {
      remoteGatewayMessage = `${error}`;
    }
  }

  let filteredProviders = $derived.by(() => {
    const query = providerSearch.trim().toLowerCase();
    return draftConfig.providers.filter((provider) => {
      const matchesQuery =
        !query ||
        providerServiceName(provider).toLowerCase().includes(query) ||
        provider.provider.toLowerCase().includes(query) ||
        provider.base_url.toLowerCase().includes(query) ||
        provider.models.some((model) => model.toLowerCase().includes(query));
      const matchesFilter =
        providerFilter === "all" ||
        (providerFilter === "enabled" && provider.enabled) ||
        (providerFilter === "disabled" && !provider.enabled);
      return matchesQuery && matchesFilter;
    });
  });

  let filteredModels = $derived.by(() => {
    const query = modelSearch.trim().toLowerCase();
    const models = draftConfig.providers.find((p) => p.id === selectedProviderId)?.models ?? [];
    return query ? models.filter((m) => m.toLowerCase().includes(query)) : models;
  });

  let selectedProviderIndex = $derived(
    draftConfig.providers.findIndex((provider) => provider.id === selectedProviderId),
  );

  let selectedProvider = $derived(
    selectedProviderIndex >= 0 ? draftConfig.providers[selectedProviderIndex] : null,
  );
  let openAiApiModeOptions = $derived([
    { value: "responses", label: $t("responsesApi") },
    { value: "chat_completions", label: $t("chatCompletionsApi") },
  ]);

  function ensureSelectedProvider() {
    if (draftConfig.providers.some((provider) => provider.id === selectedProviderId)) return;
    selectedProviderId = draftConfig.providers[0]?.id ?? "";
  }

  function ensureSelectedMcpServer() {
    if (userMcpServers.some((server) => server.id === selectedMcpId)) return;
    selectedMcpId = userMcpServers[0]?.id ?? null;
  }

  function addProvider() {
    const provider = createProviderConfig();
    draftConfig.providers = [...draftConfig.providers, provider];
    selectedProviderId = provider.id;
  }

  $effect(() => {
    setLocale((draftConfig.language ?? "zh") as Locale);
  });

  $effect(() => {
    const theme = draftConfig.theme ?? "system";
    if (onThemePreview) onThemePreview(theme);
    else applyDocumentTheme(theme);
  });

  $effect(() => {
    const enabled = draftConfig.launch_on_startup;
    if (!autostartReady) return;
    if (lastAutostartTarget === enabled) return;
    lastAutostartTarget = enabled;
    syncAutostart(enabled);
  });

  async function syncAutostart(enabled: boolean) {
    const seq = ++autostartRequestSeq;
    autostartSyncing = true;
    autostartStatus = "";
    try {
      if (enabled) await enable();
      else await disable();
      if (seq === autostartRequestSeq) {
        const actual = await isEnabled();
        lastAutostartTarget = actual;
        draftConfig.launch_on_startup = actual;
      }
    } catch (err: unknown) {
      if (seq === autostartRequestSeq) {
        autostartStatus = `${err}`;
        try {
          const actual = await isEnabled();
          lastAutostartTarget = actual;
          draftConfig.launch_on_startup = actual;
        } catch {}
      }
    } finally {
      if (seq === autostartRequestSeq) autostartSyncing = false;
    }
  }

  function removeProvider(id: string) {
    draftConfig.providers = draftConfig.providers.filter((provider) => provider.id !== id);
    repairDefaultModelBindings();
    ensureSelectedProvider();
  }

  function getProviderUrl(provider: ProviderConfig) {
    return (
      provider.base_url.trim() || providerDefaultBaseUrl(provider.provider) || "Custom endpoint"
    );
  }

  function getProviderPreviewUrl(provider: ProviderConfig) {
    return providerRequestUrl(provider);
  }

  function setOpenAiApiMode(value: string) {
    if (!selectedProvider || selectedProvider.provider !== "openai") return;
    selectedProvider.openai_api_mode = value === "chat_completions" ? value : "responses";
    providerStatus = { ...providerStatus, [selectedProvider.id]: { tone: "idle", message: "" } };
  }

  function addManualModel(provider: ProviderConfig) {
    const model = manualModelName.trim();
    if (!model) return;
    replaceProviderModels(provider, [...provider.models, model]);
    manualModelName = "";
  }

  function getStatus(id: string): ProviderStatus {
    return providerStatus[id] ?? { tone: "idle", message: "" };
  }

  async function refreshChatgptAuthStatus() {
    chatgptOAuthAuthenticated = await desktopOpenAgent.invokeProduct("get_chatgpt_auth_status", {});
  }

  async function logoutChatgpt(id: string) {
    providerStatus = {
      ...providerStatus,
      [id]: { tone: "loading", message: $t("signingOutChatgpt") },
    };
    try {
      await desktopOpenAgent.invokeProduct("logout_chatgpt", {});
      chatgptOAuthAuthenticated = false;
      providerStatus = {
        ...providerStatus,
        [id]: { tone: "success", message: $t("chatgptSignedOut") },
      };
    } catch (err: unknown) {
      providerStatus = { ...providerStatus, [id]: { tone: "error", message: `${err}` } };
    }
  }

  async function testProvider(id: string) {
    const provider = draftConfig.providers.find((item) => item.id === id);
    if (!provider) return;
    providerStatus = {
      ...providerStatus,
      [id]: { tone: "loading", message: $t("checkingConnection") },
    };

    try {
      const result = (await desktopOpenAgent.invokeProduct("test_provider_connection", {
        request: { provider: $state.snapshot(provider) },
      })) as ProviderProbeResult;
      const normalizedModels = Array.from(
        new Set(result.models.map((model) => model.trim()).filter(Boolean)),
      ).sort();
      applyDetectedProviderModels(provider, normalizedModels, result.ok);
      repairDefaultModelBindings();
      if (result.ok && provider.provider === "chatgpt" && !provider.api_key.trim()) {
        chatgptOAuthAuthenticated = true;
      }
      providerStatus = {
        ...providerStatus,
        [id]: {
          tone: result.ok ? "success" : "error",
          message: `${result.message}${result.models.length ? ` 路 ${result.models.length} models` : ""}`,
        },
      };
    } catch (err: unknown) {
      providerStatus = { ...providerStatus, [id]: { tone: "error", message: `${err}` } };
    }
  }

  async function fetchModels(id: string) {
    const provider = draftConfig.providers.find((item) => item.id === id);
    if (!provider) return;
    modelLoading = { ...modelLoading, [id]: true };
    try {
      const models = await desktopOpenAgent.invokeProduct("fetch_provider_models", {
        request: { provider: $state.snapshot(provider) },
      });
      const enabled = applyFetchedProviderModels(
        provider,
        Array.from(new Set(models.map((model) => model.trim()).filter(Boolean))).sort(),
      );
      if (!enabled) {
        repairDefaultModelBindings();
        throw new Error($t("providerNoModelsReturned"));
      }
      repairDefaultModelBindings();
      providerStatus = {
        ...providerStatus,
        [id]: {
          tone: "success",
          message: `${$t("providerEnabledWithModels")} ${provider.models.length}`,
        },
      };
    } catch (err: unknown) {
      providerStatus = { ...providerStatus, [id]: { tone: "error", message: `${err}` } };
    } finally {
      modelLoading = { ...modelLoading, [id]: false };
    }
  }

  async function setProviderEnabled(id: string, enabled: boolean) {
    const provider = draftConfig.providers.find((item) => item.id === id);
    if (!provider) return;
    if (!enabled) {
      provider.enabled = false;
      repairDefaultModelBindings();
      return;
    }

    // Never persist a transient enabled state while the connection is being
    // checked. Autosave may run before a network request completes.
    provider.enabled = false;
    modelLoading = { ...modelLoading, [id]: true };
    providerStatus = {
      ...providerStatus,
      [id]: { tone: "loading", message: $t("checkingConnection") },
    };
    try {
      const models = await desktopOpenAgent.invokeProduct("fetch_provider_models", {
        request: { provider: $state.snapshot(provider) },
      });
      const normalizedModels = Array.from(
        new Set(models.map((model) => model.trim()).filter(Boolean)),
      ).sort();
      if (normalizedModels.length === 0) {
        throw new Error($t("providerNoModelsReturned"));
      }
      applyFetchedProviderModels(provider, normalizedModels);
      repairDefaultModelBindings();
      providerStatus = {
        ...providerStatus,
        [id]: {
          tone: "success",
          message: `${$t("providerEnabledWithModels")} ${normalizedModels.length}`,
        },
      };
    } catch (err: unknown) {
      provider.enabled = false;
      providerStatus = { ...providerStatus, [id]: { tone: "error", message: `${err}` } };
    } finally {
      modelLoading = { ...modelLoading, [id]: false };
    }
  }

  function setDefaultModel(kind: "chat_model" | "flash_model", providerId: string, model: string) {
    draftConfig.defaults[kind].provider_id = providerId;
    draftConfig.defaults[kind].model = model;
  }

  function selectBindingProvider(binding: AppConfig["defaults"]["chat_model"], providerId: string) {
    selectModelBindingProvider(draftConfig, binding, providerId);
  }

  function setModelCompactionThreshold(
    provider: ProviderConfig,
    modelName: string,
    rawValue: string | number | undefined,
  ) {
    const trimmed = `${rawValue ?? ""}`.trim();
    if (!trimmed) {
      delete provider.model_context_compaction_thresholds[modelName];
      provider.model_context_compaction_thresholds = {
        ...provider.model_context_compaction_thresholds,
      };
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    provider.model_context_compaction_thresholds[modelName] = Math.min(
      1_000_000,
      Math.max(1_000, Math.floor(parsed)),
    );
    provider.model_context_compaction_thresholds = {
      ...provider.model_context_compaction_thresholds,
    };
  }

  function openModelConfig(providerId: string, modelName: string) {
    const provider = draftConfig.providers.find((item) => item.id === providerId);
    if (!provider) return;
    modelConfigProviderId = providerId;
    modelConfigOriginalName = modelName;
    modelConfigName = modelName;
    modelConfigThreshold = `${provider.model_context_compaction_thresholds[modelName] ?? ""}`;
    modelConfigSupportsReasoningEffort =
      provider.provider === "chatgpt" ||
      provider.model_reasoning_effort_enabled?.[modelName] === true;
    modelConfigSupportsVision = provider.model_vision_enabled?.[modelName] === true;
    modelConfigDialogOpen = true;
  }

  function setModelReasoningEffortSupport(
    provider: ProviderConfig,
    modelName: string,
    enabled: boolean,
  ) {
    if (provider.provider === "chatgpt") return;
    const model_reasoning_effort_enabled = { ...(provider.model_reasoning_effort_enabled ?? {}) };
    if (enabled) model_reasoning_effort_enabled[modelName] = true;
    else delete model_reasoning_effort_enabled[modelName];
    provider.model_reasoning_effort_enabled = model_reasoning_effort_enabled;

    if (!enabled) {
      const model_reasoning_efforts = { ...(provider.model_reasoning_efforts ?? {}) };
      delete model_reasoning_efforts[modelName];
      provider.model_reasoning_efforts = model_reasoning_efforts;
    }
  }

  function setModelVisionSupport(provider: ProviderConfig, modelName: string, enabled: boolean) {
    const model_vision_enabled = { ...(provider.model_vision_enabled ?? {}) };
    if (enabled) model_vision_enabled[modelName] = true;
    else delete model_vision_enabled[modelName];
    provider.model_vision_enabled = model_vision_enabled;
  }

  function modelConfigUsesResponsesReasoning() {
    return (
      draftConfig.providers.find((provider) => provider.id === modelConfigProviderId)?.provider ===
      "chatgpt"
    );
  }

  function modelConfigValidationError() {
    const provider = draftConfig.providers.find((item) => item.id === modelConfigProviderId);
    const name = modelConfigName.trim();
    if (!provider || !name) return $t("modelNameRequired");
    if (name !== modelConfigOriginalName && provider.models.includes(name)) {
      return $t("modelNameExists");
    }
    const threshold = `${modelConfigThreshold ?? ""}`.trim();
    if (threshold) {
      const parsed = Number(threshold);
      if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 1_000_000) {
        return $t("modelCompactionThresholdRange");
      }
    }
    return "";
  }

  function saveModelConfig() {
    const provider = draftConfig.providers.find((item) => item.id === modelConfigProviderId);
    const nextName = modelConfigName.trim();
    if (!provider || modelConfigValidationError()) return;

    const previousName = modelConfigOriginalName;
    if (nextName !== previousName) {
      provider.models = provider.models.map((model) => (model === previousName ? nextName : model));
      for (const kind of ["chat_model", "flash_model"] as const) {
        const binding = draftConfig.defaults[kind];
        if (binding.provider_id === provider.id && binding.model === previousName) {
          binding.model = nextName;
        }
      }
      for (const kind of ["chat_queue", "flash_queue"] as const) {
        for (const binding of draftConfig.model_retry[kind]) {
          if (binding.provider_id === provider.id && binding.model === previousName) {
            binding.model = nextName;
          }
        }
      }
      const previousThreshold = provider.model_context_compaction_thresholds[previousName];
      delete provider.model_context_compaction_thresholds[previousName];
      if (previousThreshold !== undefined) {
        provider.model_context_compaction_thresholds[nextName] = previousThreshold;
      }
      const previousEffort = provider.model_reasoning_efforts[previousName];
      delete provider.model_reasoning_efforts[previousName];
      if (previousEffort !== undefined) provider.model_reasoning_efforts[nextName] = previousEffort;
      const enabled = provider.model_reasoning_effort_enabled?.[previousName] === true;
      const model_reasoning_effort_enabled = { ...(provider.model_reasoning_effort_enabled ?? {}) };
      delete model_reasoning_effort_enabled[previousName];
      if (enabled) model_reasoning_effort_enabled[nextName] = true;
      provider.model_reasoning_effort_enabled = model_reasoning_effort_enabled;
      const visionEnabled = provider.model_vision_enabled?.[previousName] === true;
      const model_vision_enabled = { ...(provider.model_vision_enabled ?? {}) };
      delete model_vision_enabled[previousName];
      if (visionEnabled) model_vision_enabled[nextName] = true;
      provider.model_vision_enabled = model_vision_enabled;
    }

    setModelCompactionThreshold(provider, nextName, modelConfigThreshold);
    setModelReasoningEffortSupport(provider, nextName, modelConfigSupportsReasoningEffort);
    setModelVisionSupport(provider, nextName, modelConfigSupportsVision);
    modelConfigDialogOpen = false;
  }

  function deleteConfiguredModel() {
    removeModel(modelConfigProviderId, modelConfigOriginalName);
    modelConfigDialogOpen = false;
  }

  function removeModel(providerId: string, modelName: string) {
    const provider = draftConfig.providers.find((item) => item.id === providerId);
    if (!provider) return;
    provider.models = provider.models.filter((model) => model !== modelName);
    delete provider.model_context_compaction_thresholds[modelName];
    provider.model_context_compaction_thresholds = {
      ...provider.model_context_compaction_thresholds,
    };
    delete provider.model_reasoning_efforts[modelName];
    provider.model_reasoning_efforts = { ...provider.model_reasoning_efforts };
    const model_reasoning_effort_enabled = { ...(provider.model_reasoning_effort_enabled ?? {}) };
    delete model_reasoning_effort_enabled[modelName];
    provider.model_reasoning_effort_enabled = model_reasoning_effort_enabled;
    const model_vision_enabled = { ...(provider.model_vision_enabled ?? {}) };
    delete model_vision_enabled[modelName];
    provider.model_vision_enabled = model_vision_enabled;
    repairDefaultModelBindings();
  }

  function providerModels(providerId: string) {
    const provider = draftConfig.providers.find((item) => item.id === providerId);
    return provider?.enabled ? provider.models : [];
  }

  function enabledProviderOptions() {
    return draftConfig.providers
      .filter((provider) => provider.enabled && provider.models.length > 0)
      .map((provider) => ({
        value: provider.id,
        label: providerServiceName(provider),
        icon: providerIconPath(provider.provider),
        iconFallback: providerCatalogEntry(provider.provider).badge,
      }));
  }

  function repairDefaultModelBindings() {
    repairModelBindings(draftConfig);
  }

  function addRetryQueueModel(kind: RetryQueueKind) {
    const provider = draftConfig.providers.find((item) => item.enabled && item.models.length > 0);
    if (!provider) return;
    draftConfig.model_retry[kind] = [
      ...draftConfig.model_retry[kind],
      {
        provider_id: provider?.id ?? "",
        model: provider?.models[0] ?? "",
      },
    ];
  }

  function updateRetryDelaySeconds(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (!Number.isFinite(input.valueAsNumber)) return;
    draftConfig.model_retry.retry_delay_ms = Math.min(
      60_000,
      Math.max(0, Math.round(input.valueAsNumber * 1000)),
    );
  }

  function removeRetryQueueModel(kind: RetryQueueKind, index: number) {
    draftConfig.model_retry[kind] = draftConfig.model_retry[kind].filter(
      (_, itemIndex) => itemIndex !== index,
    );
  }

  function startRetryQueueDrag(kind: RetryQueueKind, index: number, event: DragEvent) {
    draggedRetryQueue = { kind, index };
    event.dataTransfer?.setData("text/plain", `${kind}:${index}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function moveRetryQueueModel(kind: RetryQueueKind, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const queue = [...draftConfig.model_retry[kind]];
    const [binding] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, binding);
    draftConfig.model_retry[kind] = queue;
  }

  function dropRetryQueueModel(kind: RetryQueueKind, index: number, event: DragEvent) {
    event.preventDefault();
    if (draggedRetryQueue?.kind === kind) {
      moveRetryQueueModel(kind, draggedRetryQueue.index, index);
    }
    draggedRetryQueue = null;
  }

  // 鈹€鈹€鈹€ MCP helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  function addMcpServer() {
    const server: NormalizedMcpServerConfig = {
      id: crypto.randomUUID(),
      name: "MCP Server",
      enabled: false,
      transport: "http",
      url: "",
      bearer_token: "",
      headers: {},
      command: "",
      args: [],
      env: {},
      cwd: "",
      disabled_tools: [],
    };
    draftConfig.mcp.servers = [...draftConfig.mcp.servers, server];
    pendingMcpServerIds.add(server.id);
    selectedMcpId = server.id;
  }

  function removeMcpServer(id: string) {
    draftConfig.mcp.servers = draftConfig.mcp.servers.filter((s) => s.id !== id);
    pendingMcpServerIds.delete(id);
    if (selectedMcpId === id) {
      selectedMcpId = draftConfig.mcp.servers[0]?.id ?? null;
    }
  }

  // Probe a connector and record the OAuth capability the attempt revealed.
  // This is the only place a capability is written, so the rendered
  // authorization action can never disagree with the precheck behind it. The
  // status banner belongs to the explicit test action, so a quiet precheck
  // reports nothing here and leaves the caller to decide what to show.
  async function refreshMcpCapability(id: string): Promise<McpProbeOutcome | null> {
    const server = draftConfig.mcp.servers.find((item) => item.id === id);
    if (!server) return null;
    const outcome = (await desktopOpenAgent.invokeProduct("test_mcp_server", {
      server: $state.snapshot(server),
    })) as McpProbeOutcome;
    mcpOAuthCapabilities = { ...mcpOAuthCapabilities, [id]: outcome.oauth ?? "unknown" };
    return outcome;
  }

  async function testMcpServer(id: string) {
    const server = draftConfig.mcp.servers.find((s) => s.id === id);
    if (!server) return;
    const notReady = server.transport === "http" ? !server.url.trim() : !server.command.trim();
    if (notReady) return;
    // The reserved entry is only a client; its daemon has to accept
    // connections before the probe can attach to the shared endpoint.
    if (id === cuaDriverId) {
      try {
        await startCuaDriverDaemon();
      } catch (error) {
        mcpTestStatus = {
          ...mcpTestStatus,
          [id]: { tone: "error", message: `${$t("mcpTestFailed")}: ${error}` },
        };
        return;
      }
    }
    mcpTestStatus = { ...mcpTestStatus, [id]: { tone: "testing", message: $t("mcpTesting") } };
    mcpDiscoveredTools = { ...mcpDiscoveredTools, [id]: [] };
    try {
      const outcome = await refreshMcpCapability(id);
      if (!outcome) return;
      // A probe that could not connect now arrives as a value rather than a
      // rejection, so it is reported here with the banner the rejection used
      // to produce.
      if (!outcome.probe) {
        mcpTestStatus = {
          ...mcpTestStatus,
          [id]: { tone: "error", message: `${$t("mcpTestFailed")}: ${outcome.error ?? ""}` },
        };
        return;
      }
      const { probe } = outcome;
      mcpDiscoveredTools = {
        ...mcpDiscoveredTools,
        [id]: [...new Set(probe.tools)].sort((left, right) => left.localeCompare(right)),
      };
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: {
          tone: "success",
          message: `${probe.tools.length} ${$t("mcpToolCount")}, ${probe.resources.length} ${$t("mcpResourceCount")}`,
        },
      };
    } catch (err: unknown) {
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: { tone: "error", message: `${$t("mcpTestFailed")}: ${err}` },
      };
    }
  }

  async function authorizeMcpServer(id: string) {
    const server = draftConfig.mcp.servers.find((item) => item.id === id);
    if (!server || server.transport !== "http" || !server.url.trim()) return;
    mcpTestStatus = {
      ...mcpTestStatus,
      [id]: { tone: "testing", message: $t("mcpAuthorizationOpening") },
    };
    try {
      // Settle the capability before anything leaves the app. An endpoint that
      // cannot complete an OAuth flow must not send the user to a browser
      // first, and an untested connector is exactly the case this settles.
      const probed = await refreshMcpCapability(id);
      const capability = probed?.oauth ?? "unknown";
      if (!shouldOfferMcpAuthorization(capability)) {
        // The explanation replaces the action in place, so clearing the
        // transient banner is what confirms the click was understood.
        mcpTestStatus = {
          ...mcpTestStatus,
          [id]: { tone: "idle", message: $t(mcpOAuthHintKey(capability) ?? "mcpOAuthUnsupported") },
        };
        return;
      }
      const start = (await desktopOpenAgent.invokeProduct("begin_mcp_oauth", {
        server: $state.snapshot(server),
      })) as McpOAuthStart;
      await openExternalUrl(start.authorization_url);
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const status = (await desktopOpenAgent.invokeProduct("get_mcp_oauth_status", {
          server_id: id,
        })) as McpOAuthStatus;
        if (status.authorized) {
          await desktopOpenAgent.invokeProduct("refresh_mcp_servers", {});
          mcpTestStatus = {
            ...mcpTestStatus,
            [id]: { tone: "success", message: $t("mcpAuthorizationCompleted") },
          };
          return;
        }
        if (status.error) throw new Error(status.error);
      }
      throw new Error($t("mcpAuthorizationTimedOut"));
    } catch (err: unknown) {
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: { tone: "error", message: `${$t("mcpAuthorizationFailed")}: ${err}` },
      };
    }
  }

  async function setMcpEnabled(id: string, enabled: boolean) {
    const server = draftConfig.mcp.servers.find((item) => item.id === id);
    if (!server) return;
    if (!enabled) {
      server.enabled = false;
      return;
    }

    server.enabled = false;
    const notReady = server.transport === "http" ? !server.url.trim() : !server.command.trim();
    if (notReady) {
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: { tone: "error", message: $t("mcpConfigurationRequired") },
      };
      return;
    }

    mcpTestStatus = { ...mcpTestStatus, [id]: { tone: "testing", message: $t("mcpTesting") } };
    try {
      const outcome = await refreshMcpCapability(id);
      // Enabling is a claim that the connector works, so a probe that did not
      // connect must leave it off — including one that now reports the failure
      // as a value instead of rejecting.
      if (!outcome?.probe) {
        server.enabled = false;
        mcpTestStatus = {
          ...mcpTestStatus,
          [id]: { tone: "error", message: `${$t("mcpTestFailed")}: ${outcome?.error ?? ""}` },
        };
        return;
      }
      const { probe } = outcome;
      mcpDiscoveredTools = {
        ...mcpDiscoveredTools,
        [id]: [...new Set(probe.tools)].sort((left, right) => left.localeCompare(right)),
      };
      server.enabled = true;
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: {
          tone: "success",
          message: `${probe.tools.length} ${$t("mcpToolCount")}, ${probe.resources.length} ${$t("mcpResourceCount")}`,
        },
      };
    } catch (err: unknown) {
      server.enabled = false;
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: { tone: "error", message: `${$t("mcpTestFailed")}: ${err}` },
      };
    }
  }

  function setMcpToolEnabled(serverId: string, toolName: string, enabled: boolean) {
    const server = draftConfig.mcp.servers.find((item) => item.id === serverId);
    if (!server) return;
    const disabled = new Set(server.disabled_tools);
    if (enabled) disabled.delete(toolName);
    else disabled.add(toolName);
    server.disabled_tools = [...disabled].sort((left, right) => left.localeCompare(right));
  }

  function addEnvVar(idx: number) {
    draftConfig.mcp.servers[idx].env = { ...draftConfig.mcp.servers[idx].env, "": "" };
  }

  function removeEnvVar(idx: number, key: string) {
    const { [key]: _, ...rest } = draftConfig.mcp.servers[idx].env;
    draftConfig.mcp.servers[idx].env = rest;
  }

  function updateEnvKey(idx: number, oldKey: string, newKey: string) {
    const val = draftConfig.mcp.servers[idx].env[oldKey] ?? "";
    const { [oldKey]: _, ...rest } = draftConfig.mcp.servers[idx].env;
    draftConfig.mcp.servers[idx].env = { ...rest, [newKey]: val };
  }

  function addHeader(idx: number) {
    draftConfig.mcp.servers[idx].headers = { ...draftConfig.mcp.servers[idx].headers, "": "" };
  }

  function removeHeader(idx: number, key: string) {
    const { [key]: _, ...rest } = draftConfig.mcp.servers[idx].headers;
    draftConfig.mcp.servers[idx].headers = rest;
  }

  function updateHeaderKey(idx: number, oldKey: string, newKey: string) {
    const val = draftConfig.mcp.servers[idx].headers[oldKey] ?? "";
    const { [oldKey]: _, ...rest } = draftConfig.mcp.servers[idx].headers;
    draftConfig.mcp.servers[idx].headers = { ...rest, [newKey]: val };
  }

  let selectedMcpServer = $derived(userMcpServers.find((s) => s.id === selectedMcpId) ?? null);
  let selectedMcpIndex = $derived(draftConfig.mcp.servers.findIndex((s) => s.id === selectedMcpId));
  const mcpDiscoveryFingerprints = new Map<string, string>();

  $effect(() => {
    const server = selectedMcpServer;
    if (!server?.enabled || !isTauri()) return;
    const fingerprint = mcpConnectionFingerprint(server);
    if (mcpDiscoveryFingerprints.get(server.id) === fingerprint) return;
    mcpDiscoveryFingerprints.set(server.id, fingerprint);
    untrack(() => void testMcpServer(server.id));
  });

  function memoryScopeAvailable(scope = memoryScope) {
    return scope === "global" || Boolean(workspacePath);
  }

  async function refreshAgentPlugins() {
    if (!isTauri()) {
      agentPlugins = [];
      agentPluginMarketplaces = [];
      return;
    }
    agentPluginsLoading = true;
    const sequence = ++agentPluginRefreshSequence;
    agentPluginStatus = "";
    // The installed set is about to change, so the last explicit check result is
    // no longer a statement about the plugins on screen.
    agentPluginUpdateCheckStatus = null;
    try {
      const [plugins, marketplaces] = await Promise.allSettled([
        desktopOpenAgent.listAgentPlugins(),
        desktopOpenAgent.listAgentPluginMarketplaces(),
      ]);
      if (sequence !== agentPluginRefreshSequence) return;
      if (plugins.status === "fulfilled") agentPlugins = plugins.value;
      if (marketplaces.status === "fulfilled") agentPluginMarketplaces = marketplaces.value;
      const failure = [plugins, marketplaces].find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(failure.reason)}`;
      }
      void checkAgentPluginUpdates();
    } catch (error: unknown) {
      agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      if (sequence === agentPluginRefreshSequence) agentPluginsLoading = false;
    }
  }

  /**
   * Re-read the installed plugins for an explicit user refresh and announce it,
   * so the right sidebar rebuilds each mounted panel's package identity instead
   * of keeping the document it read before the plugin directory changed.
   */
  async function reloadAgentPlugins(): Promise<void> {
    await refreshAgentPlugins();
    await emit("agent-plugins-changed").catch(() => {});
  }

  async function checkAgentPluginUpdates(): Promise<AgentPluginUpdateReport | null> {
    if (!isTauri()) return null;
    agentPluginUpdatesLoading = true;
    try {
      // Startup, this surface, and the plugin-change listener can all ask at
      // once, and the check spends a quota shared with every other client on
      // this machine's address, so they share one run.
      const report = await coalesceAgentPluginUpdateCheck(() =>
        desktopOpenAgent.checkAgentPluginUpdates(),
      );
      agentPluginUpdates = report.updates;
      return report;
    } catch (error: unknown) {
      console.warn("Failed to check Agent Plugin updates:", error);
      return null;
    } finally {
      agentPluginUpdatesLoading = false;
    }
  }

  /** When the GitHub quota is reported to reset, in the user's own locale. */
  function formatRateLimitReset(resetAt: number): string {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(resetAt * 1000));
  }

  /**
   * Name the plugins whose release metadata could not be read, with the reason
   * each one gave.
   *
   * A bare count leaves the user with nothing to act on: it cannot separate an
   * unpublished local package from a GitHub outage. The reason is stated from
   * the classified kind so it reads in the user's language, and the raw
   * diagnostic stays on the plugin's own row.
   */
  function describeUpdateFailures(failures: AgentPluginUpdateFailure[]): string {
    const entry = tr("pluginUpdateFailureEntry");
    return failures
      .map((failure) => {
        const key = agentPluginUpdateErrorKey(failure.kind);
        return entry
          .replace("{name}", failure.id)
          .replace("{reason}", key === null ? failure.message : tr(key));
      })
      .join(tr("pluginUpdateFailureSeparator"));
  }

  /**
   * Turn a classified outcome into the one line the plugin page shows.
   *
   * A machine condition names the condition and what would lift it. Counting
   * every failed plugin as a broken package is what made an exhausted shared
   * quota look like six damaged plugins.
   */
  function agentPluginUpdateCheckMessage(
    outcome: AgentPluginUpdateCheckOutcome,
    fromCache: boolean,
  ): { tone: "success" | "error"; message: string } {
    const message = (() => {
      switch (outcome.kind) {
        case "failed":
          return { tone: "error" as const, message: tr("pluginUpdateCheckFailed") };
        case "rate_limited":
          return {
            tone: "error" as const,
            message: [
              tr("pluginUpdateRateLimited").replace("{count}", String(outcome.count)),
              outcome.resetAt === null
                ? ""
                : tr("pluginUpdateRateLimitedUntil").replace(
                    "{time}",
                    formatRateLimitReset(outcome.resetAt),
                  ),
            ]
              .filter(Boolean)
              .join(" "),
          };
        case "network_failed":
          return { tone: "error" as const, message: tr("pluginUpdateNetworkFailed") };
        case "available":
          return {
            tone: "success" as const,
            message: [
              tr("pluginUpdateDescription").replace("{count}", String(outcome.count)),
              outcome.failures.length === 0
                ? ""
                : tr("pluginUpdateDescriptionPartial")
                    .replace("{count}", String(outcome.failures.length))
                    .replace("{plugins}", describeUpdateFailures(outcome.failures)),
            ]
              .filter(Boolean)
              .join(" "),
          };
        case "incomplete":
          return {
            tone: "error" as const,
            message: tr("pluginUpdateCheckPartialFailure")
              .replace("{count}", String(outcome.failures.length))
              .replace("{plugins}", describeUpdateFailures(outcome.failures)),
          };
        case "current":
          return { tone: "success" as const, message: tr("pluginUpdateUpToDate") };
      }
    })();
    if (!fromCache) return message;
    // The check answers from a local freshness window instead of asking GitHub
    // again, so say the result may predate the click.
    return { ...message, message: `${message.message} ${tr("pluginUpdateFromCache")}` };
  }

  /**
   * Re-read GitHub release metadata for an explicit user request and report the
   * outcome. The check that follows loading the plugin directory stays silent so
   * an automatic network failure cannot replace an operation status; this manual
   * entry point always states what the check found.
   */
  async function runAgentPluginUpdateCheck(): Promise<void> {
    if (!isTauri() || agentPluginUpdatesLoading) return;
    agentPluginStatus = "";
    agentPluginUpdateCheckStatus = null;
    const { outcome, fromCache } = classifyAgentPluginUpdateCheck(await checkAgentPluginUpdates());
    agentPluginUpdateCheckStatus = agentPluginUpdateCheckMessage(outcome, fromCache);
  }

  async function updateAgentPlugin(pluginId: string): Promise<void> {
    if (!isTauri() || agentPluginUpdating || pluginInstallQueue.isInstalling(pluginId)) return;
    agentPluginUpdating = pluginId;
    agentPluginStatus = "";
    try {
      await desktopOpenAgent.updateAgentPlugin(pluginId);
      await refreshAgentPlugins();
      await emit("agent-plugins-changed").catch(() => {});
      agentPluginStatus = tr("pluginUpdated");
    } catch (error: unknown) {
      agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      agentPluginUpdating = null;
    }
  }

  function requestUninstallAgentPlugin(pluginId: string): void {
    if (pluginInstallQueue.isInstalling(pluginId)) return;
    const plugin = agentPlugins.find((item) => item.id === pluginId);
    if (!plugin || plugin.builtin) return;
    agentPluginRemoveId = pluginId;
  }

  function cancelUninstallAgentPlugin(): void {
    if (agentPluginRemoving) return;
    agentPluginRemoveId = null;
  }

  async function confirmUninstallAgentPlugin(): Promise<void> {
    const pluginId = agentPluginRemoveId;
    if (!pluginId || agentPluginRemoving || !isTauri()) return;
    agentPluginRemoving = true;
    ++agentPluginRefreshSequence;
    agentPluginStatus = "";
    try {
      await desktopOpenAgent.uninstallAgentPlugin(pluginId);
      agentPluginRemoveId = null;
      agentPlugins = agentPlugins.filter((plugin) => plugin.id !== pluginId);
      agentPluginUpdates = agentPluginUpdates.filter((plugin) => plugin.id !== pluginId);
      agentPluginMarketplaces = agentPluginMarketplaces.map((marketplace) => ({
        ...marketplace,
        plugins: marketplace.plugins.map((plugin) =>
          plugin.name === pluginId ? { ...plugin, installed: false } : plugin,
        ),
      }));
      await refreshAgentPlugins();
      await emit("agent-plugins-changed").catch(() => {});
      agentPluginStatus = tr("pluginUninstalled");
    } catch (error: unknown) {
      await refreshAgentPlugins();
      agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      agentPluginRemoving = false;
    }
  }

  async function runPluginInstall(
    key: string,
    pluginId: string | null,
    label: string,
    install: () => Promise<AgentPluginSummary>,
  ): Promise<void> {
    await pluginInstallQueue.run({
      key,
      pluginId,
      label,
      subscribe: (receive) => desktopOpenAgent.onAgentPluginInstallProgress(receive),
      install,
      activate: async (installed, progress) => {
        ++agentPluginRefreshSequence;
        agentPlugins = [...agentPlugins.filter((plugin) => plugin.id !== installed.id), installed];
        progress({ plugin_id: installed.id, stage: "connecting" });
        try {
          if (installed.id === cuaDriverId && agentPluginHostAccess(cuaDriverId)) {
            await startCuaDriverDaemon();
            await desktopOpenAgent.invokeProduct("refresh_mcp_servers", {});
          }
        } finally {
          await refreshAgentPlugins();
          await emit("agent-plugins-changed").catch(() => {});
        }
      },
    });
  }

  async function installAgentPlugin() {
    if (!isTauri()) return;
    const selected = await openDialog({ multiple: true, directory: true });
    if (!selected) return;
    await Promise.all(
      (Array.isArray(selected) ? selected : [selected]).map((source) =>
        runPluginInstall(`local:${source}`, null, source.split(/[\\/]/).pop() ?? source, () =>
          desktopOpenAgent.installAgentPlugin(source),
        ),
      ),
    );
  }

  async function installMarketplaceAgentPlugin(marketplacePath: string, pluginName: string) {
    if (!isTauri() || agentPluginUpdating === pluginName || agentPluginRemoveId === pluginName)
      return;
    await runPluginInstall(pluginName, pluginName, pluginName, () =>
      desktopOpenAgent.installMarketplaceAgentPlugin(marketplacePath, pluginName),
    );
  }

  async function installOfficialAgentPlugin(plugin: OfficialPluginRegistryEntry): Promise<void> {
    if (!isTauri() || agentPluginUpdating === plugin.id || agentPluginRemoveId === plugin.id)
      return;
    await runPluginInstall(plugin.id, plugin.id, plugin.displayName, () =>
      desktopOpenAgent.installOfficialAgentPlugin(plugin.id, plugin.displayName, plugin.sourceUrl),
    );
  }

  async function exportMemory() {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    memoryBusy = true;
    memoryStatus = "";
    try {
      const content = await desktopOpenAgent.invokeProduct("export_memory_backup", {
        scope: memoryScope,
      });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `openagent-memory-${memoryScope}-${stamp}.json`;
      const savedPath = await invoke<string>("save_download_file", {
        filename,
        content,
        encoding: "utf8",
      });
      memoryStatus = `${tr("memoryExported")} ${savedPath}`;
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memoryBusy = false;
    }
  }

  async function importMemory(replace: boolean) {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected || Array.isArray(selected)) return;

    memoryBusy = true;
    memoryStatus = "";
    try {
      const content = await invoke<string>("read_text_file", { path: selected });
      const result = await desktopOpenAgent.invokeProduct("import_memory_backup", {
        scope: memoryScope,
        content,
        replace,
      });
      memoryStatus = `${tr("memoryImported")} ${result.agent_memories_imported} ${tr("memoryAgentEntries")}`;
      await refreshMemory();
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memoryBusy = false;
    }
  }

  async function clearMemoryScope() {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    memoryClearInput = "";
    memoryClearDialogOpen = true;
  }

  async function confirmClearMemoryScope() {
    const confirmationText = tr("memoryClearConfirmText");
    if (memoryClearInput !== confirmationText) {
      return;
    }
    memoryBusy = true;
    memoryStatus = "";
    try {
      await desktopOpenAgent.invokeProduct("clear_memory", { scope: memoryScope });
      memoryStatus = tr("memoryCleared");
      await refreshMemory();
      memoryClearCloseHandled = true;
      memoryClearDialogOpen = false;
      memoryClearInput = "";
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memoryBusy = false;
    }
  }

  function cancelClearMemoryScope() {
    memoryClearCloseHandled = true;
    memoryClearDialogOpen = false;
    memoryClearInput = "";
    memoryStatus = tr("memoryClearCancelled");
  }

  setContext("settings-view", {
    get acceptedConfigFingerprint() {
      return acceptedConfigFingerprint;
    },
    get addEnvVar() {
      return addEnvVar;
    },
    get addHeader() {
      return addHeader;
    },
    get addManualModel() {
      return addManualModel;
    },
    get addMcpServer() {
      return addMcpServer;
    },
    get addProvider() {
      return addProvider;
    },
    get addRetryQueueModel() {
      return addRetryQueueModel;
    },
    get autoSaveInitialized() {
      return autoSaveInitialized;
    },
    get autoSaveTimer() {
      return autoSaveTimer;
    },
    get autostartReady() {
      return autostartReady;
    },
    get autostartRequestSeq() {
      return autostartRequestSeq;
    },
    get autostartStatus() {
      return autostartStatus;
    },
    get autostartSyncing() {
      return autostartSyncing;
    },
    get agentPlugins() {
      return agentPlugins;
    },
    get agentPluginMarketplaces() {
      return agentPluginMarketplaces;
    },
    get officialPluginCards() {
      return officialPluginCards;
    },
    get officialPluginQuery() {
      return officialPluginQuery;
    },
    set officialPluginQuery(value: string) {
      officialPluginQuery = value;
    },
    get officialPluginFilter() {
      return officialPluginFilter;
    },
    set officialPluginFilter(value: OfficialPluginCatalogFilter) {
      officialPluginFilter = value;
    },
    get pluginManagementView() {
      return pluginManagementView;
    },
    set pluginManagementView(value: "marketplace" | "installed") {
      pluginManagementView = value;
    },
    get agentPluginInstallTasks() {
      return agentPluginInstallTasks;
    },
    get agentPluginInstalling() {
      return (key: string) =>
        agentPluginInstallTasks.some((task) => task.key === key && task.status === "running");
    },
    get agentPluginInstallMessage() {
      return agentPluginInstallMessage;
    },
    get agentPluginsLoading() {
      return agentPluginsLoading;
    },
    get agentPluginEnabled() {
      return agentPluginEnabled;
    },
    get setAgentPluginEnabled() {
      return setAgentPluginEnabled;
    },
    get pluginRequestsHostAccess() {
      return pluginRequestsHostAccess;
    },
    get agentPluginHostAccess() {
      return agentPluginHostAccess;
    },
    get setAgentPluginHostAccess() {
      return setAgentPluginHostAccess;
    },
    get agentPluginUpdates() {
      return agentPluginUpdates;
    },
    get agentPluginUpdatesLoading() {
      return agentPluginUpdatesLoading;
    },
    get agentPluginUpdating() {
      return agentPluginUpdating;
    },
    get agentPluginRemoveDialogOpen() {
      return agentPluginRemoveId !== null;
    },
    get agentPluginRemoveName() {
      return (
        agentPlugins.find((plugin) => plugin.id === agentPluginRemoveId)?.name ??
        agentPluginRemoveId ??
        ""
      );
    },
    get agentPluginRemoving() {
      return agentPluginRemoving;
    },
    get agentPluginStatus() {
      return agentPluginStatus;
    },
    get agentPluginUpdateCheckStatus() {
      return agentPluginUpdateCheckStatus;
    },
    get installAgentPlugin() {
      return installAgentPlugin;
    },
    get installMarketplaceAgentPlugin() {
      return installMarketplaceAgentPlugin;
    },
    get installOfficialAgentPlugin() {
      return installOfficialAgentPlugin;
    },
    get updateAgentPlugin() {
      return updateAgentPlugin;
    },
    get requestUninstallAgentPlugin() {
      return requestUninstallAgentPlugin;
    },
    get cancelUninstallAgentPlugin() {
      return cancelUninstallAgentPlugin;
    },
    get confirmUninstallAgentPlugin() {
      return confirmUninstallAgentPlugin;
    },
    get refreshAgentPlugins() {
      return refreshAgentPlugins;
    },
    get reloadAgentPlugins() {
      return reloadAgentPlugins;
    },
    get runAgentPluginUpdateCheck() {
      return runAgentPluginUpdateCheck;
    },
    get cancelClearMemoryScope() {
      return cancelClearMemoryScope;
    },
    get channelSettingsNav() {
      return channelSettingsNav;
    },
    set channelSettingsNav(value) {
      channelSettingsNav = value;
    },
    get channelStatuses() {
      return channelStatuses;
    },
    get chatgptOAuthAuthenticated() {
      return chatgptOAuthAuthenticated;
    },
    get clearMemoryScope() {
      return clearMemoryScope;
    },
    get commitQuickChatShortcut() {
      return commitQuickChatShortcut;
    },
    get componentVersions() {
      return componentVersions;
    },
    get config() {
      return config;
    },
    get confirmClearMemoryScope() {
      return confirmClearMemoryScope;
    },
    get copiedRemoteValue() {
      return copiedRemoteValue;
    },
    get copyRemoteGatewayValue() {
      return copyRemoteGatewayValue;
    },
    get cuaDefaultApplied() {
      return cuaDefaultApplied;
    },
    get cuaDriver() {
      return cuaDriver;
    },
    get cuaDriverId() {
      return cuaDriverId;
    },
    get deleteConfiguredModel() {
      return deleteConfiguredModel;
    },
    get draftConfig() {
      return draftConfig;
    },
    get draggedRetryQueue() {
      return draggedRetryQueue;
    },
    set draggedRetryQueue(value) {
      draggedRetryQueue = value;
    },
    get dropRetryQueueModel() {
      return dropRetryQueueModel;
    },
    get enabledProviderOptions() {
      return enabledProviderOptions;
    },
    get ensureSelectedMcpServer() {
      return ensureSelectedMcpServer;
    },
    get ensureSelectedProvider() {
      return ensureSelectedProvider;
    },
    get exportMemory() {
      return exportMemory;
    },
    get fetchModels() {
      return fetchModels;
    },
    get filteredModels() {
      return filteredModels;
    },
    get filteredProviders() {
      return filteredProviders;
    },
    get findCuaDriverServer() {
      return findCuaDriverServer;
    },
    get formatMemoryDate() {
      return formatMemoryDate;
    },
    get getProviderPreviewUrl() {
      return getProviderPreviewUrl;
    },
    get getProviderUrl() {
      return getProviderUrl;
    },
    get getStatus() {
      return getStatus;
    },
    get handleQuickShortcutKeydown() {
      return handleQuickShortcutKeydown;
    },
    get importMemory() {
      return importMemory;
    },
    get initialNav() {
      return initialNav;
    },
    get initialSectionResolved() {
      return initialSectionResolved;
    },
    get initializedFromConfig() {
      return initializedFromConfig;
    },
    get isMcpSettingsPreview() {
      return isMcpSettingsPreview;
    },
    get lastAutostartTarget() {
      return lastAutostartTarget;
    },
    get lastInitialNav() {
      return lastInitialNav;
    },
    get logoutChatgpt() {
      return logoutChatgpt;
    },
    get manualModelName() {
      return manualModelName;
    },
    set manualModelName(value) {
      manualModelName = value;
    },
    get mcpConnectionFingerprints() {
      return mcpConnectionFingerprints;
    },
    get mcpDiscoveredTools() {
      return mcpDiscoveredTools;
    },
    get mcpDiscoveryFingerprints() {
      return mcpDiscoveryFingerprints;
    },
    mcpOAuthHint(id: string) {
      return mcpOAuthHintKey(mcpOAuthCapabilities[id]);
    },
    mcpOAuthOffered(id: string) {
      return shouldOfferMcpAuthorization(mcpOAuthCapabilities[id]);
    },
    get mcpTestStatus() {
      return mcpTestStatus;
    },
    get memoryAgentEntries() {
      return memoryAgentEntries;
    },
    get memoryLoaded() {
      return memoryLoaded;
    },
    get memoryAgentLoading() {
      return memoryAgentLoading;
    },
    get memoryDirty() {
      return memoryDirty;
    },
    get discardMemoryDraft() {
      return discardMemoryDraft;
    },
    get searchAgentMemories() {
      return searchAgentMemories;
    },
    get memoryAgentScope() {
      return memoryAgentScope;
    },
    get memoryAgentSearch() {
      return memoryAgentSearch;
    },
    set memoryAgentSearch(value) {
      memoryAgentSearch = value;
    },
    get memoryBusy() {
      return memoryBusy;
    },
    get memoryClearCloseHandled() {
      return memoryClearCloseHandled;
    },
    set memoryClearCloseHandled(value) {
      memoryClearCloseHandled = value;
    },
    get memoryClearDialogOpen() {
      return memoryClearDialogOpen;
    },
    set memoryClearDialogOpen(value) {
      memoryClearDialogOpen = value;
    },
    get memoryClearInput() {
      return memoryClearInput;
    },
    set memoryClearInput(value) {
      memoryClearInput = value;
    },
    get memoryLoading() {
      return memoryLoading;
    },
    get memoryRequestSeq() {
      return memoryRequestSeq;
    },
    get memorySaving() {
      return memorySaving;
    },
    get memoryScope() {
      return memoryScope;
    },
    set memoryScope(value) {
      memoryScope = value;
    },
    get memoryScopeAvailable() {
      return memoryScopeAvailable;
    },
    get memoryStatus() {
      return memoryStatus;
    },
    get memoryUserContent() {
      return memoryUserContent;
    },
    set memoryUserContent(value) {
      memoryUserContent = value;
    },
    get modelConfigDialogOpen() {
      return modelConfigDialogOpen;
    },
    set modelConfigDialogOpen(value) {
      modelConfigDialogOpen = value;
    },
    get modelConfigName() {
      return modelConfigName;
    },
    set modelConfigName(value) {
      modelConfigName = value;
    },
    get modelConfigOriginalName() {
      return modelConfigOriginalName;
    },
    get modelConfigProviderId() {
      return modelConfigProviderId;
    },
    get modelConfigSupportsReasoningEffort() {
      return modelConfigSupportsReasoningEffort;
    },
    set modelConfigSupportsReasoningEffort(value) {
      modelConfigSupportsReasoningEffort = value;
    },
    get modelConfigSupportsVision() {
      return modelConfigSupportsVision;
    },
    set modelConfigSupportsVision(value) {
      modelConfigSupportsVision = value;
    },
    get modelConfigThreshold() {
      return modelConfigThreshold;
    },
    set modelConfigThreshold(value) {
      modelConfigThreshold = value;
    },
    get modelConfigUsesResponsesReasoning() {
      return modelConfigUsesResponsesReasoning;
    },
    get modelConfigValidationError() {
      return modelConfigValidationError;
    },
    get modelLoading() {
      return modelLoading;
    },
    get modelSearch() {
      return modelSearch;
    },
    set modelSearch(value) {
      modelSearch = value;
    },
    get moveRetryQueueModel() {
      return moveRetryQueueModel;
    },
    get onOpenConversation() {
      return onOpenConversation;
    },
    get onOpenPluginSidebarView() {
      return onOpenPluginSidebarView;
    },
    get pluginSidebarContext() {
      return pluginSidebarContext;
    },
    get pluginSidebarLifecycleFor() {
      return pluginSidebarLifecycleFor;
    },
    get onSave() {
      return onSave;
    },
    get onThemePreview() {
      return onThemePreview;
    },
    get openAiApiModeOptions() {
      return openAiApiModeOptions;
    },
    get openModelConfig() {
      return openModelConfig;
    },
    get parseChannelIds() {
      return parseChannelIds;
    },
    get pendingMcpServerIds() {
      return pendingMcpServerIds;
    },
    get pendingSave() {
      return pendingSave;
    },
    get permissionProfile() {
      return permissionProfile;
    },
    get providerConnectionFingerprints() {
      return providerConnectionFingerprints;
    },
    get providerFilter() {
      return providerFilter;
    },
    set providerFilter(value) {
      providerFilter = value;
    },
    get providerModels() {
      return providerModels;
    },
    get providerSearch() {
      return providerSearch;
    },
    set providerSearch(value) {
      providerSearch = value;
    },
    get providerStatus() {
      return providerStatus;
    },
    get quickShortcutRecording() {
      return quickShortcutRecording;
    },
    set quickShortcutRecording(value) {
      quickShortcutRecording = value;
    },
    get quickShortcutStatus() {
      return quickShortcutStatus;
    },
    set quickShortcutStatus(value) {
      quickShortcutStatus = value;
    },
    get rebaseDraftValue() {
      return rebaseDraftValue;
    },
    get reconnectWechatChannel() {
      return reconnectWechatChannel;
    },
    get refreshAgentMemories() {
      return refreshAgentMemories;
    },
    get refreshChannelStatuses() {
      return refreshChannelStatuses;
    },
    get refreshChatgptAuthStatus() {
      return refreshChatgptAuthStatus;
    },
    get refreshMemory() {
      return refreshMemory;
    },
    get refreshRemoteGateway() {
      return refreshRemoteGateway;
    },
    get refreshWechatChannel() {
      return refreshWechatChannel;
    },
    get remoteCopyTimer() {
      return remoteCopyTimer;
    },
    get remoteGatewayBusy() {
      return remoteGatewayBusy;
    },
    get remoteGatewayMessage() {
      return remoteGatewayMessage;
    },
    get remoteGatewayStatus() {
      return remoteGatewayStatus;
    },
    get removeAgentMemory() {
      return removeAgentMemory;
    },
    get removeEnvVar() {
      return removeEnvVar;
    },
    get removeHeader() {
      return removeHeader;
    },
    get removeMcpServer() {
      return removeMcpServer;
    },
    get removeModel() {
      return removeModel;
    },
    get removeProvider() {
      return removeProvider;
    },
    get removeRetryQueueModel() {
      return removeRetryQueueModel;
    },
    get repairDefaultModelBindings() {
      return repairDefaultModelBindings;
    },
    get rotateRemotePairingCode() {
      return rotateRemotePairingCode;
    },
    get saveDraftConfig() {
      return saveDraftConfig;
    },
    get saveModelConfig() {
      return saveModelConfig;
    },
    get saveUserMemory() {
      return saveUserMemory;
    },
    get sections() {
      return sections;
    },
    get selectBindingProvider() {
      return selectBindingProvider;
    },
    get selectedMcpId() {
      return selectedMcpId;
    },
    set selectedMcpId(value) {
      selectedMcpId = value;
    },
    get selectedMcpIndex() {
      return selectedMcpIndex;
    },
    get selectedMcpServer() {
      return selectedMcpServer;
    },
    get selectedProvider() {
      return selectedProvider;
    },
    get selectedProviderId() {
      return selectedProviderId;
    },
    set selectedProviderId(value) {
      selectedProviderId = value;
    },
    get selectedProviderIndex() {
      return selectedProviderIndex;
    },
    get selectedSettingsSection() {
      return selectedSettingsSection;
    },
    get setCuaDriverEnabled() {
      return setCuaDriverEnabled;
    },
    get setDefaultModel() {
      return setDefaultModel;
    },
    get setMcpEnabled() {
      return setMcpEnabled;
    },
    get setMcpToolEnabled() {
      return setMcpToolEnabled;
    },
    get setModelCompactionThreshold() {
      return setModelCompactionThreshold;
    },
    get setModelReasoningEffortSupport() {
      return setModelReasoningEffortSupport;
    },
    get setModelVisionSupport() {
      return setModelVisionSupport;
    },
    get setOpenAiApiMode() {
      return setOpenAiApiMode;
    },
    get setProviderEnabled() {
      return setProviderEnabled;
    },
    get snapshotDraftConfig() {
      return snapshotDraftConfig;
    },
    get startRetryQueueDrag() {
      return startRetryQueueDrag;
    },
    get suppressNextAutoSave() {
      return suppressNextAutoSave;
    },
    get syncAutostart() {
      return syncAutostart;
    },
    get testMcpServer() {
      return testMcpServer;
    },
    get authorizeMcpServer() {
      return authorizeMcpServer;
    },
    get testProvider() {
      return testProvider;
    },
    get toggleCurrentWorkspaceAccess() {
      return toggleCurrentWorkspaceAccess;
    },
    get updateEnvKey() {
      return updateEnvKey;
    },
    get updateHeaderKey() {
      return updateHeaderKey;
    },
    get updateRetryDelaySeconds() {
      return updateRetryDelaySeconds;
    },
    get userMcpServers() {
      return userMcpServers;
    },
    get visibleSections() {
      return visibleSections;
    },
    get wechatChannelBusy() {
      return wechatChannelBusy;
    },
    get wechatChannelMessage() {
      return wechatChannelMessage;
    },
    get wechatChannelStatus() {
      return wechatChannelStatus;
    },
    get wechatStatusTimer() {
      return wechatStatusTimer;
    },
    get workspacePath() {
      return workspacePath;
    },
  });
</script>

<svelte:window onkeydown={handleQuickShortcutKeydown} />

<div
  class="application-settings-scope settings-panel"
  class:single-section={visibleSections.size === 1}
>
  <Tabs.Root
    bind:value={selectedSettingsSection}
    orientation="vertical"
    activationMode="manual"
    class="settings-body"
  >
    <SettingsViewTabsPrimary />
    <SettingsViewTabsSecondary />
  </Tabs.Root>
</div>

<SettingsViewDialogs />
