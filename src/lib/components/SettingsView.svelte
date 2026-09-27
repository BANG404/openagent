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
  import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
  import { onMount, tick, untrack } from "svelte";
  import { Tabs } from "bits-ui";
  import type {
    AgentPluginSummary,
    AgentPluginUpdateSummary,
    AgentMemoryEntry,
    AgentRole,
    AppConfig,
    AutomationHookConfig,
    AutomationHookEvent,
    PermissionProfile,
    ProviderConfig,
  } from "$lib/types";
  import { captureQuickChatShortcut } from "$lib/quickChatShortcut";
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
    providerConnectionFingerprint,
    providerRequestUrl,
    providerServiceName,
    repairModelBindings,
    replaceProviderModels,
    selectModelBindingProvider,
    settingsConfigChanged,
    type RetryQueueKind,
  } from "$lib/settingsConfig";
  import { t, tr, setLocale, type Locale, type TranslationKeys } from "$lib/i18n";
  import type { SettingsNav } from "$lib/settingsWindows";
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
  type ScheduledChatHook = {
    id: string;
    message: string;
    conv_id: string | null;
    role_id: string | null;
    schedule: string;
    recurring: boolean;
    created_at: number;
    next_run_at: number;
    triggered_conversations: {
      conv_id: string;
      title: string;
      triggered_at: number;
    }[];
    args: ScheduleChatHookArgs;
  };
  type ScheduleChatHookArgs = {
    message: string;
    delay_minutes?: number | null;
    run_at?: string | null;
    recurrence?: string | null;
    interval_minutes?: number | null;
    time_of_day?: string | null;
    weekdays?: string[] | null;
    conv_id?: string | null;
    role_id?: string | null;
  };

  let {
    config,
    workspacePath,
    initialNav,
    sections,
    onSave,
    onOpenConversation,
    onThemePreview,
  }: {
    config: AppConfig | null;
    workspacePath: string;
    initialNav?: SettingsNav;
    sections?: SettingsNav[];
    onSave: (config: AppConfig, baseConfig?: AppConfig) => Promise<AppConfig>;
    onOpenConversation: (conversationId: string) => Promise<void>;
    onThemePreview?: (theme: string) => void;
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
        "lifecycle",
        "schedules",
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
  let agentPlugins = $state<AgentPluginSummary[]>([]);
  let agentPluginUpdates = $state<AgentPluginUpdateSummary[]>([]);
  let agentPluginUpdatesLoading = $state(false);
  let agentPluginUpdating = $state<string | null>(null);
  let agentPluginRemoveId = $state<string | null>(null);
  let agentPluginRemoving = $state(false);
  let agentPluginsLoading = $state(false);
  let agentPluginStatus = $state("");
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
  let automationHookDraft = $state<AutomationHookConfig | null>(null);
  let scheduledHooks = $state<ScheduledChatHook[]>([]);
  let hookMessage = $state("");
  let hookMode = $state<"delay" | "run_at" | "interval_minutes" | "daily" | "weekdays" | "weekly">(
    "delay",
  );
  let hookDelayMinutes = $state(10);
  let hookRunAt = $state("");
  let hookTimeOfDay = $state("09:00");
  let hookIntervalMinutes = $state(60);
  let hookWeekdays = $state("mon,wed,fri");
  let hookRoleKey = $state("openagent");
  let hookRoles = $state<AgentRole[]>([]);
  let hookStatus = $state("");
  let editingHookId = $state<string | null>(null);
  let editingHookConversationId = $state<string | null>(null);
  let memoryScope = $state<"global" | "local">("global");
  let memoryUserContent = $state("");
  let memoryAgentEntries = $state<AgentMemoryEntry[]>([]);
  let memoryAgentSearch = $state("");
  let memoryLoading = $state(false);
  let memorySaving = $state(false);
  let memoryExtracting = $state(false);
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
    if (enabled) {
      void startCuaDriverDaemon().catch((error) => {
        console.error("Failed to start the Cua Driver daemon:", error);
      });
    }
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

  function setChatGroupsEnabled(enabled: boolean) {
    draftConfig.chat_groups_enabled = enabled;
    draftConfig.agent_plugins_enabled = {
      ...(draftConfig.agent_plugins_enabled ?? {}),
      "chat-groups": enabled,
    };
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
      if (previous !== undefined && previous !== next && server.enabled) {
        server.enabled = false;
        mcpTestStatus = {
          ...mcpTestStatus,
          [server.id]: { tone: "error", message: $t("configurationChangedReenable") },
        };
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
    if (visibleSections.has("schedules")) {
      refreshHooks().catch(() => {});
      refreshHookRoles().catch(() => {});
    }
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
    if (!isTauri() || !memoryScopeAvailable()) {
      memoryUserContent = "";
      memoryAgentEntries = [];
      return;
    }
    const agentScope = memoryAgentScope(scope);
    if (!agentScope) return;
    const requestSeq = ++memoryRequestSeq;
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
      memoryUserContent = userMemory;
      memoryAgentEntries = agentMemories;
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
    const requestSeq = ++memoryRequestSeq;
    memoryLoading = true;
    try {
      const entries = await desktopOpenAgent.invokeProduct("get_agent_memories", {
        scope: agentScope,
        query: memoryAgentSearch.trim() || null,
      });
      if (requestSeq === memoryRequestSeq) memoryAgentEntries = entries;
    } catch (err: unknown) {
      if (requestSeq === memoryRequestSeq) memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      if (requestSeq === memoryRequestSeq) memoryLoading = false;
    }
  }

  async function saveUserMemory() {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    memorySaving = true;
    memoryStatus = "";
    try {
      await desktopOpenAgent.invokeProduct("save_memory", {
        scope: memoryScope,
        content: memoryUserContent,
      });
      memoryStatus = tr("memorySaveSuccess");
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memorySaving = false;
    }
  }

  async function extractMemory() {
    memoryExtracting = true;
    memoryStatus = "";
    try {
      await desktopOpenAgent.invokeProduct("trigger_memory_agent", { convId: null });
      memoryStatus = tr("memoryExtractStarted");
      window.setTimeout(() => refreshMemory().catch(() => {}), 1200);
    } catch (err: unknown) {
      memoryStatus = `${tr("memoryOperationFailed")}: ${err}`;
    } finally {
      memoryExtracting = false;
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
    void scope;
    if (visibleSections.has("memory") && isTauri()) refreshMemory(scope, "").catch(() => {});
  });

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

  function automationHookEventLabel(event: AutomationHookEvent): string {
    const keys: Record<AutomationHookEvent, TranslationKeys> = {
      session_start: "automationHookSessionStart",
      session_end: "automationHookSessionEnd",
      user_prompt_submit: "automationHookUserPromptSubmit",
      subagent_start: "automationHookSubagentStart",
      subagent_stop: "automationHookSubagentStop",
      permission_request: "automationHookPermissionRequest",
      pre_compact: "automationHookPreCompact",
      post_compact: "automationHookPostCompact",
      stop: "automationHookStop",
      interrupt: "automationHookInterrupt",
      before_model: "automationHookBeforeModel",
      after_model: "automationHookAfterModel",
      before_tool: "automationHookBeforeTool",
      after_tool: "automationHookAfterTool",
    };
    return $t(keys[event]);
  }

  function beginAutomationHook(hook?: AutomationHookConfig) {
    automationHookDraft = hook
      ? structuredClone($state.snapshot(hook))
      : {
          id: crypto.randomUUID(),
          name: "",
          enabled: true,
          event: "before_tool",
          matcher: "",
          timeout_secs: 30,
          action: { type: "command", command: "" },
        };
  }

  function setAutomationHookAction(type: "command" | "agent_message") {
    if (!automationHookDraft || automationHookDraft.action.type === type) return;
    automationHookDraft.action = type === "command" ? { type, command: "" } : { type, message: "" };
  }

  function saveAutomationHook() {
    if (!automationHookDraft) return;
    const actionText =
      automationHookDraft.action.type === "command"
        ? automationHookDraft.action.command
        : automationHookDraft.action.message;
    if (!automationHookDraft.name.trim() || !actionText.trim()) return;
    const hook = structuredClone($state.snapshot(automationHookDraft));
    const index = draftConfig.automation_hooks.findIndex((item) => item.id === hook.id);
    draftConfig.automation_hooks =
      index < 0
        ? [...draftConfig.automation_hooks, hook]
        : draftConfig.automation_hooks.map((item) => (item.id === hook.id ? hook : item));
    automationHookDraft = null;
  }

  function removeAutomationHook(id: string) {
    draftConfig.automation_hooks = draftConfig.automation_hooks.filter((hook) => hook.id !== id);
    if (automationHookDraft?.id === id) automationHookDraft = null;
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
      const result = (await desktopOpenAgent.invokeProduct("test_mcp_server", {
        server: $state.snapshot(server),
      })) as McpProbeResult;
      mcpDiscoveredTools = {
        ...mcpDiscoveredTools,
        [id]: [...new Set(result.tools)].sort((left, right) => left.localeCompare(right)),
      };
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: {
          tone: "success",
          message: `${result.tools.length} ${$t("mcpToolCount")}, ${result.resources.length} ${$t("mcpResourceCount")}`,
        },
      };
    } catch (err: unknown) {
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: { tone: "error", message: `${$t("mcpTestFailed")}: ${err}` },
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
      const result = (await desktopOpenAgent.invokeProduct("test_mcp_server", {
        server: $state.snapshot(server),
      })) as McpProbeResult;
      mcpDiscoveredTools = {
        ...mcpDiscoveredTools,
        [id]: [...new Set(result.tools)].sort((left, right) => left.localeCompare(right)),
      };
      server.enabled = true;
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: {
          tone: "success",
          message: `${result.tools.length} ${$t("mcpToolCount")}, ${result.resources.length} ${$t("mcpResourceCount")}`,
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

  async function refreshHooks() {
    const definitions = (await desktopOpenAgent.invokeProduct("list_scheduled_chat_hooks", {})) as {
      record: Omit<ScheduledChatHook, "args">;
      args: ScheduleChatHookArgs;
    }[];
    scheduledHooks = definitions.map(({ record, args }) => ({ ...record, args }));
  }

  async function refreshHookRoles() {
    const roles = await desktopOpenAgent.invokeProduct("list_agent_roles", {}).catch(() => []);
    const seen = new Set<string>();
    hookRoles = roles.filter((role) => {
      if (seen.has(role.id)) return false;
      seen.add(role.id);
      return true;
    });
    if (hookRoleKey !== "openagent" && !seen.has(hookRoleKey)) hookRoleKey = "openagent";
  }

  function hookRoleName(roleId: string | null): string {
    if (!roleId) return $t("defaultRoleName");
    return hookRoles.find((role) => role.id === roleId)?.name ?? $t("unknownRole");
  }

  function formatHookTime(ts: number) {
    if (!ts) return "-";
    return new Date(ts * 1000).toLocaleString();
  }

  async function cancelHook(id: string) {
    await desktopOpenAgent.invokeProduct("cancel_scheduled_chat_hook", { id });
    if (editingHookId === id) resetHookEditor();
    await refreshHooks();
  }

  function hookArgs(): ScheduleChatHookArgs | null {
    const message = hookMessage.trim();
    if (!message) {
      hookStatus = tr("hookMessageRequired");
      return null;
    }
    const args: ScheduleChatHookArgs = { message };
    if (hookRoleKey !== "openagent") args.role_id = hookRoleKey;
    if (editingHookConversationId) args.conv_id = editingHookConversationId;
    if (hookMode === "delay") {
      args.delay_minutes = hookDelayMinutes;
    } else if (hookMode === "run_at") {
      args.run_at = hookRunAt;
    } else if (hookMode === "interval_minutes") {
      args.recurrence = "interval_minutes";
      args.interval_minutes = hookIntervalMinutes;
    } else if (hookMode === "daily" || hookMode === "weekdays") {
      args.recurrence = hookMode;
      args.time_of_day = hookTimeOfDay;
    } else {
      args.recurrence = "weekly";
      args.time_of_day = hookTimeOfDay;
      args.weekdays = hookWeekdays
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
    }
    return args;
  }

  function resetHookEditor() {
    editingHookId = null;
    editingHookConversationId = null;
    hookMessage = "";
    hookMode = "delay";
    hookDelayMinutes = 10;
    hookRunAt = "";
    hookTimeOfDay = "09:00";
    hookIntervalMinutes = 60;
    hookWeekdays = "mon,wed,fri";
    hookRoleKey = "openagent";
  }

  function editHook(hook: ScheduledChatHook) {
    editingHookId = hook.id;
    editingHookConversationId = hook.args.conv_id ?? null;
    hookMessage = hook.args.message;
    hookRoleKey = hook.args.role_id ?? "openagent";
    hookDelayMinutes = hook.args.delay_minutes ?? 10;
    hookRunAt = hook.args.run_at ?? "";
    hookIntervalMinutes = hook.args.interval_minutes ?? hook.args.delay_minutes ?? 60;
    hookTimeOfDay = hook.args.time_of_day ?? "09:00";
    hookWeekdays = hook.args.weekdays?.join(",") ?? "mon,wed,fri";
    hookMode =
      (hook.args.recurrence as typeof hookMode | null) ?? (hook.args.run_at ? "run_at" : "delay");
    hookStatus = "";
  }

  async function saveHook() {
    const args = hookArgs();
    if (!args) return;
    try {
      hookStatus = editingHookId
        ? await desktopOpenAgent.invokeProduct("update_scheduled_chat_hook", {
            id: editingHookId,
            args,
          })
        : await desktopOpenAgent.invokeProduct("schedule_chat_hook", { args });
      resetHookEditor();
      await refreshHooks();
    } catch (err: unknown) {
      hookStatus = `${err}`;
    }
  }

  function memoryScopeAvailable(scope = memoryScope) {
    return scope === "global" || Boolean(workspacePath);
  }

  async function refreshAgentPlugins() {
    if (!isTauri()) {
      agentPlugins = [];
      return;
    }
    agentPluginsLoading = true;
    agentPluginStatus = "";
    try {
      agentPlugins = await desktopOpenAgent.listAgentPlugins();
      void checkAgentPluginUpdates();
    } catch (error: unknown) {
      agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      agentPluginsLoading = false;
    }
  }

  async function checkAgentPluginUpdates(): Promise<void> {
    if (!isTauri()) return;
    agentPluginUpdatesLoading = true;
    try {
      agentPluginUpdates = await desktopOpenAgent.checkAgentPluginUpdates();
    } catch (error: unknown) {
      console.warn("Failed to check Agent Plugin updates:", error);
    } finally {
      agentPluginUpdatesLoading = false;
    }
  }

  async function updateAgentPlugin(pluginId: string): Promise<void> {
    if (!isTauri() || agentPluginUpdating) return;
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
    agentPluginStatus = "";
    try {
      await desktopOpenAgent.uninstallAgentPlugin(pluginId);
      agentPluginRemoveId = null;
      await refreshAgentPlugins();
      await emit("agent-plugins-changed").catch(() => {});
      agentPluginStatus = tr("pluginUninstalled");
    } catch (error: unknown) {
      agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      agentPluginRemoving = false;
    }
  }

  async function installAgentPlugin() {
    const selected = await openDialog({ multiple: false, directory: true });
    if (!selected || Array.isArray(selected)) return;
    agentPluginsLoading = true;
    agentPluginStatus = "";
    try {
      await desktopOpenAgent.installAgentPlugin(selected);
      await refreshAgentPlugins();
      await emit("agent-plugins-changed").catch(() => {});
      agentPluginStatus = tr("pluginInstalled");
    } catch (error: unknown) {
      agentPluginStatus = `${tr("pluginOperationFailed")}: ${String(error)}`;
    } finally {
      agentPluginsLoading = false;
    }
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
    get automationHookDraft() {
      return automationHookDraft;
    },
    get automationHookEventLabel() {
      return automationHookEventLabel;
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
    get agentPluginsLoading() {
      return agentPluginsLoading;
    },
    get agentPluginEnabled() {
      return agentPluginEnabled;
    },
    get setAgentPluginEnabled() {
      return setAgentPluginEnabled;
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
    get installAgentPlugin() {
      return installAgentPlugin;
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
    get beginAutomationHook() {
      return beginAutomationHook;
    },
    get cancelClearMemoryScope() {
      return cancelClearMemoryScope;
    },
    get cancelHook() {
      return cancelHook;
    },
    get channelSettingsNav() {
      return channelSettingsNav;
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
    get dropRetryQueueModel() {
      return dropRetryQueueModel;
    },
    get editHook() {
      return editHook;
    },
    get editingHookConversationId() {
      return editingHookConversationId;
    },
    get editingHookId() {
      return editingHookId;
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
    get extractMemory() {
      return extractMemory;
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
    get formatHookTime() {
      return formatHookTime;
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
    get hookArgs() {
      return hookArgs;
    },
    get hookDelayMinutes() {
      return hookDelayMinutes;
    },
    get hookIntervalMinutes() {
      return hookIntervalMinutes;
    },
    get hookMessage() {
      return hookMessage;
    },
    get hookMode() {
      return hookMode;
    },
    get hookRoleKey() {
      return hookRoleKey;
    },
    get hookRoleName() {
      return hookRoleName;
    },
    get hookRoles() {
      return hookRoles;
    },
    get hookRunAt() {
      return hookRunAt;
    },
    get hookStatus() {
      return hookStatus;
    },
    get hookTimeOfDay() {
      return hookTimeOfDay;
    },
    get hookWeekdays() {
      return hookWeekdays;
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
    get mcpConnectionFingerprints() {
      return mcpConnectionFingerprints;
    },
    get mcpDiscoveredTools() {
      return mcpDiscoveredTools;
    },
    get mcpDiscoveryFingerprints() {
      return mcpDiscoveryFingerprints;
    },
    get mcpTestStatus() {
      return mcpTestStatus;
    },
    get memoryAgentEntries() {
      return memoryAgentEntries;
    },
    get memoryAgentScope() {
      return memoryAgentScope;
    },
    get memoryAgentSearch() {
      return memoryAgentSearch;
    },
    get memoryBusy() {
      return memoryBusy;
    },
    get memoryClearCloseHandled() {
      return memoryClearCloseHandled;
    },
    get memoryClearDialogOpen() {
      return memoryClearDialogOpen;
    },
    get memoryClearInput() {
      return memoryClearInput;
    },
    get memoryExtracting() {
      return memoryExtracting;
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
    get memoryScopeAvailable() {
      return memoryScopeAvailable;
    },
    get memoryStatus() {
      return memoryStatus;
    },
    get memoryUserContent() {
      return memoryUserContent;
    },
    get modelConfigDialogOpen() {
      return modelConfigDialogOpen;
    },
    get modelConfigName() {
      return modelConfigName;
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
    get modelConfigSupportsVision() {
      return modelConfigSupportsVision;
    },
    get modelConfigThreshold() {
      return modelConfigThreshold;
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
    get moveRetryQueueModel() {
      return moveRetryQueueModel;
    },
    get onOpenConversation() {
      return onOpenConversation;
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
    get providerModels() {
      return providerModels;
    },
    get providerSearch() {
      return providerSearch;
    },
    get providerStatus() {
      return providerStatus;
    },
    get quickShortcutRecording() {
      return quickShortcutRecording;
    },
    get quickShortcutStatus() {
      return quickShortcutStatus;
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
    get refreshHookRoles() {
      return refreshHookRoles;
    },
    get refreshHooks() {
      return refreshHooks;
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
    get removeAutomationHook() {
      return removeAutomationHook;
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
    get resetHookEditor() {
      return resetHookEditor;
    },
    get rotateRemotePairingCode() {
      return rotateRemotePairingCode;
    },
    get saveAutomationHook() {
      return saveAutomationHook;
    },
    get saveDraftConfig() {
      return saveDraftConfig;
    },
    get saveHook() {
      return saveHook;
    },
    get saveModelConfig() {
      return saveModelConfig;
    },
    get saveUserMemory() {
      return saveUserMemory;
    },
    get scheduledHooks() {
      return scheduledHooks;
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
    get selectedProviderIndex() {
      return selectedProviderIndex;
    },
    get selectedSettingsSection() {
      return selectedSettingsSection;
    },
    get setAutomationHookAction() {
      return setAutomationHookAction;
    },
    get setCuaDriverEnabled() {
      return setCuaDriverEnabled;
    },
    get setChatGroupsEnabled() {
      return setChatGroupsEnabled;
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
