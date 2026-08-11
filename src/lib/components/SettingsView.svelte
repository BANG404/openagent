<script lang="ts">
  import { invoke, listen } from "$lib/openagent/tauriClient";
  import { isTauri } from "@tauri-apps/api/core";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
  import { onMount, tick, untrack } from "svelte";
  import { ContextMenu, Dialog, Tabs } from "bits-ui";
  import type {
    AgentRole,
    AppConfig,
    McpServerConfig,
    PermissionProfile,
    ProviderConfig,
  } from "$lib/types";
  import {
    captureQuickChatShortcut,
    DEFAULT_QUICK_CHAT_SHORTCUT,
    formatQuickChatShortcut,
  } from "$lib/quickChatShortcut";
  import { normalizeConfigShape } from "$lib/config";
  import { reportFrontendDiagnostic } from "$lib/frontendDiagnostics";
  import { appUpdateState, checkForAppUpdate } from "$lib/appUpdater";
  import {
    PROVIDER_CATALOG,
    providerCatalogEntry,
    providerDefaultBaseUrl,
    providerIconPath,
    providerRequiresApiKey,
  } from "$lib/providerCatalog";
  import {
    applyFetchedProviderModels,
    createProviderConfig,
    mcpConnectionFingerprint,
    providerConnectionFingerprint,
    repairModelBindings,
    replaceProviderModels,
    selectModelBindingProvider,
    settingsConfigChanged,
    type RetryQueueKind,
  } from "$lib/settingsConfig";
  import { t, tr, setLocale, type Locale } from "$lib/i18n";
  import WindowControls from "./WindowControls.svelte";
  import Tooltip from "./Tooltip.svelte";
  import Select from "./ui/Select.svelte";
  import Switch from "./ui/Switch.svelte";
  import SettingsStatusToggle from "./ui/SettingsStatusToggle.svelte";
  import PermissionSettings from "./PermissionSettings.svelte";
  import AgentPluginsSettings from "./AgentPluginsSettings.svelte";

  type SettingsNav =
    | "general"
    | "channels"
    | "providers"
    | "defaults"
    | "agents"
    | "memory"
    | "websearch"
    | "hooks"
    | "plugins"
    | "extensions"
    | "about";
  type StandardChannelKind = "feishu" | "telegram" | "qq" | "discord" | "slack";
  type ChannelSettingsNav = StandardChannelKind | "wechat" | "gateway";
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
  const approvalModeDescriptionKey = {
    manual: "approvalModeManualDescription",
    auto: "approvalModeAutoDescription",
    off: "approvalModeOffDescription",
  } as const;
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
    isMemorySyncing,
    initialNav,
    onSave,
    onOpenConversation,
    winMinimize,
    winMaximize,
    winClose,
  }: {
    config: AppConfig | null;
    workspacePath: string;
    isMemorySyncing: boolean;
    initialNav?: SettingsNav;
    onSave: (config: AppConfig, baseConfig?: AppConfig) => Promise<AppConfig>;
    onOpenConversation: (conversationId: string) => Promise<void>;
    winMinimize: () => void;
    winMaximize: () => void;
    winClose: () => void;
  } = $props();

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
      new_conversation_summary: { enabled: true, prompt: "" },
      hook: { enabled: true, prompt: "" },
      tool_approval: { enabled: false, prompt: "" },
    },
    approval_mode: "off",
    mcp: { servers: [] },
    theme: "system",
    language: "zh",
    launch_on_startup: false,
    onboarding_completed: false,
    diagnostic_log_collection_enabled: true,
    quick_chat_shortcut: DEFAULT_QUICK_CHAT_SHORTCUT,
    mention_palette_show_global_drafts: true,
    message_layout: "single",
    message_double_column_min_width: 1200,
    book_mode_font_size: 17,
    workspace_open_mode: "ask",
    agent_turn_limit_enabled: false,
    agent_max_turns: 10,
    context_compaction_enabled: true,
    context_compaction_threshold: 200000,
    context_compaction_prompt: "",
    memory_retrieval_enabled: true,
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
    remote_gateway: {
      enabled: false,
      allow_lan_access: false,
      allowed_workspaces: [],
    },
  };

  let channelSettingsNav = $state<ChannelSettingsNav>("feishu");
  // Contextual entry points can override the ordinary General default after
  // this dynamically loaded Tabs root has finished registering its triggers.
  $effect(() => {
    if (!initialNav) return;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
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
  let mcpTestStatus = $state<Record<string, McpTestStatus>>({});
  let selectedMcpId = $state<string | null>(null);
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

  let draftConfig = $state<AppConfig>(
    normalizeConfigShape(untrack(() => config) ?? fallbackConfig),
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
  let acceptedConfigFingerprint = JSON.stringify(
    normalizeConfigShape(untrack(() => config) ?? fallbackConfig),
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
    refreshHooks().catch(() => {});
    refreshHookRoles().catch(() => {});
    refreshRemoteGateway().catch(() => {});
    refreshChannelStatuses().catch(() => {});
    refreshWechatChannel().catch(() => {});
    wechatStatusTimer = setInterval(() => {
      refreshChannelStatuses().catch(() => {});
      refreshWechatChannel().catch(() => {});
    }, 1500);
    refreshChatgptAuthStatus().catch(() => {});
    const unlistenRemotePairingCode = listen("remote-gateway-pairing-code-rotated", () => {
      refreshRemoteGateway().catch(() => {});
    });
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
    return () => {
      void unlistenRemotePairingCode.then((dispose) => dispose());
      if (remoteCopyTimer) clearTimeout(remoteCopyTimer);
      if (wechatStatusTimer) clearInterval(wechatStatusTimer);
      saveDraftConfig().catch(console.error);
    };
  });

  async function refreshRemoteGateway() {
    remoteGatewayStatus = await invoke<RemoteGatewayStatus>("get_remote_gateway_status");
  }

  async function refreshWechatChannel() {
    wechatChannelStatus = await invoke<WechatChannelStatus>("get_wechat_channel_status");
  }

  async function refreshChannelStatuses() {
    const statuses = await invoke<ChannelStatus[]>("get_channel_statuses");
    channelStatuses = Object.fromEntries(statuses.map((status) => [status.channel, status]));
  }

  function channelStatusKey(state: ChannelStatus["state"] | undefined) {
    switch (state) {
      case "starting":
        return "channelStarting";
      case "connected":
        return "channelConnected";
      case "error":
        return "channelError";
      default:
        return "channelDisabled";
    }
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
      await invoke("reset_wechat_channel");
      await refreshWechatChannel();
    } catch (error) {
      wechatChannelMessage = `${error}`;
    } finally {
      wechatChannelBusy = false;
    }
  }

  function wechatStatusKey(state: WechatChannelStatus["state"] | undefined) {
    switch (state) {
      case "starting":
        return "wechatChannelStarting";
      case "awaiting_scan":
        return "wechatChannelAwaitingScan";
      case "connected":
        return "wechatChannelConnected";
      case "error":
        return "wechatChannelError";
      default:
        return "wechatChannelDisabled";
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
      const pairing_code = await invoke<string>("rotate_remote_gateway_pairing_code");
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
        provider.name.toLowerCase().includes(query) ||
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

  function ensureSelectedProvider() {
    if (draftConfig.providers.some((provider) => provider.id === selectedProviderId)) return;
    selectedProviderId = draftConfig.providers[0]?.id ?? "";
  }

  function ensureSelectedMcpServer() {
    if (draftConfig.mcp.servers.some((server) => server.id === selectedMcpId)) return;
    selectedMcpId = draftConfig.mcp.servers[0]?.id ?? null;
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
    document.documentElement.classList.remove("dark", "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
    else if (theme === "light") document.documentElement.classList.add("light");
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
    return provider.base_url.trim() || providerDefaultBaseUrl(provider.provider);
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
    chatgptOAuthAuthenticated = await invoke<boolean>("get_chatgpt_auth_status");
  }

  async function logoutChatgpt(id: string) {
    providerStatus = {
      ...providerStatus,
      [id]: { tone: "loading", message: $t("signingOutChatgpt") },
    };
    try {
      await invoke<boolean>("logout_chatgpt");
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
      const result = await invoke<ProviderProbeResult>("test_provider_connection", {
        request: { provider: $state.snapshot(provider) },
      });
      replaceProviderModels(provider, Array.from(new Set(result.models)).sort());
      if (provider.models.length === 0 && provider.enabled) {
        provider.enabled = false;
        repairDefaultModelBindings();
      }
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
      const models = await invoke<string[]>("fetch_provider_models", {
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
      const models = await invoke<string[]>("fetch_provider_models", {
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
    modelConfigDialogOpen = true;
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
    }

    setModelCompactionThreshold(provider, nextName, modelConfigThreshold);
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
        label: provider.name,
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
    const server: McpServerConfig = {
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
    };
    draftConfig.mcp.servers = [...draftConfig.mcp.servers, server];
    selectedMcpId = server.id;
  }

  function removeMcpServer(id: string) {
    draftConfig.mcp.servers = draftConfig.mcp.servers.filter((s) => s.id !== id);
    if (selectedMcpId === id) {
      selectedMcpId = draftConfig.mcp.servers[0]?.id ?? null;
    }
  }

  async function testMcpServer(id: string) {
    const server = draftConfig.mcp.servers.find((s) => s.id === id);
    if (!server) return;
    const notReady = server.transport === "http" ? !server.url.trim() : !server.command.trim();
    if (notReady) return;
    mcpTestStatus = { ...mcpTestStatus, [id]: { tone: "testing", message: $t("mcpTesting") } };
    try {
      const result = await invoke<McpProbeResult>("test_mcp_server", {
        server: $state.snapshot(server),
      });
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
      const result = await invoke<McpProbeResult>("test_mcp_server", {
        server: $state.snapshot(server),
      });
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

  let selectedMcpServer = $derived(
    draftConfig.mcp.servers.find((s) => s.id === selectedMcpId) ?? null,
  );
  let selectedMcpIndex = $derived(draftConfig.mcp.servers.findIndex((s) => s.id === selectedMcpId));

  async function refreshHooks() {
    const definitions = await invoke<
      { record: Omit<ScheduledChatHook, "args">; args: ScheduleChatHookArgs }[]
    >("list_scheduled_chat_hooks");
    scheduledHooks = definitions.map(({ record, args }) => ({ ...record, args }));
  }

  async function refreshHookRoles() {
    const [localRoles, globalRoles] = await Promise.all([
      invoke<AgentRole[]>("list_agent_roles", { scope: "local" }).catch(() => []),
      invoke<AgentRole[]>("list_agent_roles", { scope: "global" }).catch(() => []),
    ]);
    const seen = new Set<string>();
    hookRoles = [...localRoles, ...globalRoles].filter((role) => {
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
    await invoke("cancel_scheduled_chat_hook", { id });
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
        ? await invoke<string>("update_scheduled_chat_hook", { id: editingHookId, args })
        : await invoke<string>("schedule_chat_hook", { args });
      resetHookEditor();
      await refreshHooks();
    } catch (err: unknown) {
      hookStatus = `${err}`;
    }
  }

  function memoryScopeAvailable(scope = memoryScope) {
    return scope === "global" || Boolean(workspacePath);
  }

  async function exportMemory() {
    if (!memoryScopeAvailable()) {
      memoryStatus = tr("memoryNoWorkspace");
      return;
    }
    memoryBusy = true;
    memoryStatus = "";
    try {
      const content = await invoke<string>("export_memory_backup", { scope: memoryScope });
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
      const result = await invoke<{
        user_memory_imported: boolean;
        agent_memories_imported: number;
      }>("import_memory_backup", { scope: memoryScope, content, replace });
      memoryStatus = `${tr("memoryImported")} ${result.agent_memories_imported} ${tr("memoryAgentEntries")}`;
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
      await invoke("clear_memory", { scope: memoryScope });
      memoryStatus = tr("memoryCleared");
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
</script>

<svelte:window onkeydown={handleQuickShortcutKeydown} />

<div class="settings-panel">
  <div class="settings-header" data-tauri-drag-region>
    <span class="settings-header-title">{$t("settingsTitle")}</span>
    <div class="title-actions">
      {#if isMemorySyncing}
        <Tooltip text="Memory syncing">
          <span class="sync-dot">*</span>
        </Tooltip>
      {/if}
      <WindowControls onMinimize={winMinimize} onMaximize={winMaximize} onClose={winClose} />
    </div>
  </div>

  <Tabs.Root value="general" orientation="vertical" activationMode="manual" class="settings-body">
    <Tabs.List class="settings-nav-col">
      <div class="settings-nav-items">
        <Tabs.Trigger value="general" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="2.4" />
            <path
              d="M8 1.8v1.4M8 12.8v1.4M3.6 3.6l1 1M11.4 11.4l1 1M1.8 8h1.4M12.8 8h1.4M3.6 12.4l1-1M11.4 4.6l1-1"
            />
          </svg>
          {$t("general")}
        </Tabs.Trigger>
        <Tabs.Trigger value="channels" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3 4.2h10v7.6H3z" />
            <path d="m5.2 6.4 2.1 1.7a1.1 1.1 0 0 0 1.4 0l2.1-1.7" />
            <path d="M5 2.2v2M11 2.2v2M5 11.8v2M11 11.8v2" />
          </svg>
          {$t("channels")}
        </Tabs.Trigger>
        <Tabs.Trigger value="providers" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="2.5" y="3" width="11" height="3.5" rx="1" />
            <rect x="2.5" y="9.5" width="11" height="3.5" rx="1" />
            <path d="M5 4.75h.01M5 11.25h.01M8 6.5v3" />
          </svg>
          {$t("providers")}
        </Tabs.Trigger>
        <Tabs.Trigger value="defaults" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path
              d="M8 2.2l1.7 3.5 3.8.6-2.8 2.7.7 3.8L8 11l-3.4 1.8.7-3.8-2.8-2.7 3.8-.6L8 2.2z"
            />
          </svg>
          {$t("defaultModels")}
        </Tabs.Trigger>
        <Tabs.Trigger value="agents" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4.2 4.2h7.6v5.2H8.7L6 12v-2.6H4.2z" />
            <path d="M6 6.2h4M6 8h2.6" />
          </svg>
          {$t("flashAgents")}
        </Tabs.Trigger>
        <Tabs.Trigger value="memory" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <ellipse cx="8" cy="3.5" rx="5" ry="1.8" />
            <path d="M3 3.5v6.8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V3.5" />
            <path d="M3 7c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" />
          </svg>
          {$t("memoryManagement")}
        </Tabs.Trigger>
        <Tabs.Trigger value="websearch" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3.2 3.2" />
          </svg>
          {$t("webSearch")}
        </Tabs.Trigger>
        <Tabs.Trigger value="extensions" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v2.8a3.5 3.5 0 0 1-7 0V5.5zM8 11.8v1.7" />
          </svg>
          {$t("extensions")}
        </Tabs.Trigger>
        <Tabs.Trigger value="plugins" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6.2 2.5h3.6v2.2h2.2v3.6H9.8v2.2H6.2V8.3H4V4.7h2.2V2.5Z" />
            <path d="M8 10.5v3" />
          </svg>
          {$t("agentPlugins")}
        </Tabs.Trigger>
        <Tabs.Trigger value="hooks" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="5.5" />
            <path d="M8 4.8V8l2.2 1.4" />
          </svg>
          {$t("hooks")}
        </Tabs.Trigger>
      </div>
      <div class="settings-nav-bottom">
        <Tabs.Trigger value="about" class="settings-nav-item">
          <svg
            class="nav-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="5.5" />
            <path d="M8 7.5v3.2M8 5.2h.01" />
          </svg>
          {$t("about")}
        </Tabs.Trigger>
      </div>
    </Tabs.List>

    <Tabs.Content value="general" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("appearance")}</h4>
          <div class="settings-card">
            <div class="settings-card-row">
              <span class="label-text">{$t("theme")}</span>
              <div class="settings-card-control">
                <Select
                  bind:value={draftConfig.theme}
                  items={[
                    { value: "system", label: $t("themeSystem") },
                    { value: "light", label: $t("themeLight") },
                    { value: "dark", label: $t("themeDark") },
                  ]}
                  ariaLabel={$t("theme")}
                />
              </div>
            </div>
            <div class="settings-card-row">
              <span class="label-text">{$t("language")}</span>
              <div class="settings-card-control">
                <Select
                  bind:value={draftConfig.language}
                  items={[
                    { value: "zh", label: "中文" },
                    { value: "en", label: "English" },
                  ]}
                  ariaLabel={$t("language")}
                />
              </div>
            </div>
            <div class="settings-card-row">
              <span class="label-text">{$t("messageLayout")}</span>
              <div class="settings-card-control">
                <Select
                  bind:value={draftConfig.message_layout}
                  items={[
                    { value: "single", label: $t("messageLayoutSingle") },
                    { value: "responsive_double", label: $t("messageLayoutResponsiveDouble") },
                  ]}
                  ariaLabel={$t("messageLayout")}
                />
              </div>
            </div>
            {#if draftConfig.message_layout === "responsive_double"}
              <label class="settings-card-row">
                <span class="settings-card-copy">
                  <span class="label-text">{$t("messageDoubleColumnMinWidth")}</span>
                  <span class="detail-hint">{$t("messageDoubleColumnHint")}</span>
                </span>
                <input
                  type="number"
                  class="detail-input execution-number-input"
                  min="960"
                  max="2400"
                  step="40"
                  bind:value={draftConfig.message_double_column_min_width}
                />
              </label>
            {/if}
            <label class="settings-card-row">
              <span class="settings-card-copy">
                <span class="label-text">{$t("bookModeFontSize")}</span>
                <span class="detail-hint">{$t("bookModeFontSizeHint")}</span>
              </span>
              <input
                type="number"
                class="detail-input execution-number-input"
                min="14"
                max="24"
                step="1"
                bind:value={draftConfig.book_mode_font_size}
              />
            </label>
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("quickChat")}</h4>
          <div class="shortcut-setting-row">
            <div class="shortcut-setting-copy">
              <span class="label-text">{$t("quickShortcutLabel")}</span>
              <p class="detail-hint">{$t("quickShortcutHint")}</p>
            </div>
            <div class="shortcut-setting-controls">
              <button
                type="button"
                class="shortcut-recorder"
                class:recording={quickShortcutRecording}
                aria-label={$t("quickShortcutLabel")}
                aria-pressed={quickShortcutRecording}
                onclick={() => {
                  quickShortcutRecording = true;
                  quickShortcutStatus = { tone: "idle", message: "" };
                }}
                onblur={() => (quickShortcutRecording = false)}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="2" y="3.25" width="12" height="9.5" rx="2" />
                  <path d="M4.5 6h.01M7 6h.01M9.5 6h.01M12 6h.01M5.25 9.5h5.5" />
                </svg>
                <span>
                  {quickShortcutRecording
                    ? $t("quickShortcutRecording")
                    : formatQuickChatShortcut(draftConfig.quick_chat_shortcut)}
                </span>
              </button>
              <button
                type="button"
                class="dialog-action-quiet shortcut-reset"
                disabled={draftConfig.quick_chat_shortcut === DEFAULT_QUICK_CHAT_SHORTCUT}
                onclick={() => void commitQuickChatShortcut(DEFAULT_QUICK_CHAT_SHORTCUT)}
              >
                {$t("reset")}
              </button>
            </div>
          </div>
          {#if quickShortcutStatus.message}
            <div
              class="shortcut-status {quickShortcutStatus.tone}"
              role={quickShortcutStatus.tone === "error" ? "alert" : "status"}
            >
              {quickShortcutStatus.message}
            </div>
          {/if}
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("workspaceBehavior")}</h4>
          <div class="settings-card">
            <div class="settings-card-row">
              <span class="settings-card-copy">
                <span class="label-text">{$t("workspaceSelectionBehavior")}</span>
                <span class="detail-hint">{$t("workspaceSelectionBehaviorHint")}</span>
              </span>
              <div class="settings-card-control">
                <Select
                  bind:value={draftConfig.workspace_open_mode}
                  items={[
                    { value: "ask", label: $t("workspaceOpenAsk") },
                    { value: "new_window", label: $t("workspaceOpenNewWindow") },
                    { value: "current_window", label: $t("workspaceOpenCurrentWindow") },
                  ]}
                  ariaLabel={$t("workspaceSelectionBehavior")}
                />
              </div>
            </div>
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("approvalMode")}</h4>
          <div class="settings-card">
            <div class="settings-card-row">
              <span class="settings-card-copy">
                <span class="label-text"
                  >{$t(approvalModeDescriptionKey[draftConfig.approval_mode])}</span
                >
                <span class="detail-hint">{$t("approvalPermissionIndependent")}</span>
              </span>
              <div class="settings-card-control">
                <Select
                  bind:value={draftConfig.approval_mode}
                  items={[
                    {
                      value: "manual",
                      label: $t("approvalModeManual"),
                      description: $t("approvalModeManualDescription"),
                    },
                    {
                      value: "auto",
                      label: $t("approvalModeAuto"),
                      description: $t("approvalModeAutoDescription"),
                    },
                    {
                      value: "off",
                      label: $t("approvalModeOff"),
                      description: $t("approvalModeOffDescription"),
                    },
                  ]}
                  ariaLabel={$t("approvalMode")}
                />
              </div>
            </div>
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("executionPermissions")}</h4>
          <p class="detail-section-intro">{$t("executionPermissionsDescription")}</p>
          <PermissionSettings
            profile={permissionProfile}
            onProfileChange={(profile) => (draftConfig.permission_profile = profile)}
          />
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("privacyDiagnostics")}</h4>
          <div class="startup-row">
            <div class="startup-copy">
              <span class="label-text">{$t("diagnosticLogCollection")}</span>
              <p class="detail-hint">{$t("diagnosticLogCollectionHint")}</p>
            </div>
            <Switch
              bind:checked={draftConfig.diagnostic_log_collection_enabled}
              ariaLabel={$t("diagnosticLogCollection")}
            />
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("startup")}</h4>
          <div class="startup-row">
            <div class="startup-copy">
              <span class="label-text">{$t("launchOnStartup")}</span>
              <p class="detail-hint">{$t("launchOnStartupHint")}</p>
            </div>
            <Switch
              bind:checked={draftConfig.launch_on_startup}
              disabled={!autostartReady || autostartSyncing}
              ariaLabel={$t("launchOnStartup")}
            />
          </div>
          {#if autostartStatus}
            <div class="provider-status error" style="margin-top:8px">{autostartStatus}</div>
          {/if}
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("mentionPalette")}</h4>
          <div class="startup-row">
            <div class="startup-copy">
              <span class="label-text">{$t("showGlobalDraftsInMentions")}</span>
              <p class="detail-hint">{$t("showGlobalDraftsInMentionsHint")}</p>
            </div>
            <Switch
              bind:checked={draftConfig.mention_palette_show_global_drafts}
              ariaLabel={$t("showGlobalDraftsInMentions")}
            />
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("htmlPreview")}</h4>
          <div class="settings-card">
            <label class="settings-card-row">
              <span class="label-text">{$t("htmlPreviewFixedHeight")}</span>
              <input
                type="number"
                class="detail-input execution-number-input"
                min="160"
                max="1200"
                step="20"
                bind:value={draftConfig.html_preview.fixed_height}
              />
            </label>
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("agentExecution")}</h4>
          <div class="execution-settings">
            <div class="execution-setting">
              <div class="startup-row execution-toggle-row">
                <div class="startup-copy">
                  <span class="label-text">{$t("agentTurnLimit")}</span>
                  <p class="detail-hint">{$t("agentTurnLimitHint")}</p>
                </div>
                <Switch
                  bind:checked={draftConfig.agent_turn_limit_enabled}
                  ariaLabel={$t("agentTurnLimit")}
                />
              </div>
              <label class="execution-value-row">
                <span class="label-text">{$t("agentMaxTurns")}</span>
                <input
                  type="number"
                  class="detail-input execution-number-input"
                  min="1"
                  max="1000"
                  step="1"
                  disabled={!draftConfig.agent_turn_limit_enabled}
                  bind:value={draftConfig.agent_max_turns}
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </Tabs.Content>

    <Tabs.Content value="channels" class="settings-tab-panel">
      <div class="channel-settings-layout">
        <nav class="channel-settings-list" aria-label={$t("channels")}>
          <div class="channel-settings-list-items">
            <button
              type="button"
              class:active={channelSettingsNav === "feishu"}
              class="channel-settings-item"
              onclick={() => (channelSettingsNav = "feishu")}
            >
              <span class="channel-settings-icon feishu" aria-hidden="true">
                <img src="/assets/channels/feishu.jpeg" alt="" />
              </span>
              <span class="channel-settings-item-copy"
                ><strong>{$t("feishuChannel")}</strong><span>{$t("feishuChannelSubtitle")}</span
                ></span
              >
            </button>
            <button
              type="button"
              class:active={channelSettingsNav === "telegram"}
              class="channel-settings-item"
              onclick={() => (channelSettingsNav = "telegram")}
            >
              <span class="channel-settings-icon telegram" aria-hidden="true">
                <img src="/assets/channels/telegram.png" alt="" />
              </span>
              <span class="channel-settings-item-copy"
                ><strong>{$t("telegramChannel")}</strong><span>{$t("telegramChannelSubtitle")}</span
                ></span
              >
            </button>
            <button
              type="button"
              class:active={channelSettingsNav === "qq"}
              class="channel-settings-item"
              onclick={() => (channelSettingsNav = "qq")}
            >
              <span class="channel-settings-icon qq" aria-hidden="true">
                <img src="/assets/channels/qq.svg" alt="" />
              </span>
              <span class="channel-settings-item-copy"
                ><strong>{$t("qqChannel")}</strong><span>{$t("qqChannelSubtitle")}</span></span
              >
            </button>
            <button
              type="button"
              class:active={channelSettingsNav === "wechat"}
              class="channel-settings-item"
              onclick={() => (channelSettingsNav = "wechat")}
            >
              <span class="channel-settings-icon wechat" aria-hidden="true">
                <img src="/assets/channels/wechat.png" alt="" />
              </span>
              <span class="channel-settings-item-copy"
                ><strong>{$t("wechatChannel")}</strong><span>{$t("wechatChannelSubtitle")}</span
                ></span
              >
            </button>
            <button
              type="button"
              class:active={channelSettingsNav === "discord"}
              class="channel-settings-item"
              onclick={() => (channelSettingsNav = "discord")}
            >
              <span class="channel-settings-icon discord" aria-hidden="true">
                <img src="/assets/channels/discord.svg" alt="" />
              </span>
              <span class="channel-settings-item-copy"
                ><strong>{$t("discordChannel")}</strong><span>{$t("discordChannelSubtitle")}</span
                ></span
              >
            </button>
            <button
              type="button"
              class:active={channelSettingsNav === "slack"}
              class="channel-settings-item"
              onclick={() => (channelSettingsNav = "slack")}
            >
              <span class="channel-settings-icon slack" aria-hidden="true">
                <img src="/assets/channels/slack.svg" alt="" />
              </span>
              <span class="channel-settings-item-copy"
                ><strong>{$t("slackChannel")}</strong><span>{$t("slackChannelSubtitle")}</span
                ></span
              >
            </button>
            <button
              type="button"
              class:active={channelSettingsNav === "gateway"}
              class="channel-settings-item"
              onclick={() => (channelSettingsNav = "gateway")}
            >
              <span class="channel-settings-icon gateway" aria-hidden="true">
                <img src="/assets/channels/gateway.svg" alt="" />
              </span>
              <span class="channel-settings-item-copy"
                ><strong>{$t("remoteGateway")}</strong><span>{$t("remoteGatewaySubtitle")}</span
                ></span
              >
            </button>
          </div>
        </nav>
        <div class="settings-content-col channel-settings-detail">
          {#if channelSettingsNav === "feishu"}
            <section class="detail-section">
              <div class="detail-section-header remote-gateway-heading">
                <div>
                  <h4 class="detail-section-title">{$t("feishuChannel")}</h4>
                  <p class="remote-gateway-subtitle">{$t("feishuChannelSubtitle")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(channelStatusKey(channelStatuses.feishu?.state))}
                  statusActive={channelStatuses.feishu?.state === "connected"}
                  toggleLabel={$t("channelEnabled")}
                  bind:checked={draftConfig.channels!.feishu!.enabled}
                  ariaLabel={$t("channelEnabled")}
                />
              </div>
              <div class="channel-config-card">
                <label class="detail-label">
                  <span class="label-text">{$t("channelAppId")}</span>
                  <input class="detail-input" bind:value={draftConfig.channels!.feishu!.app_id} />
                </label>
                <label class="detail-label">
                  <span class="label-text">{$t("channelAppSecret")}</span>
                  <input
                    type="password"
                    class="detail-input"
                    bind:value={draftConfig.channels!.feishu!.app_secret}
                  />
                </label>
                <div class="detail-label">
                  <span class="label-text">{$t("feishuDomain")}</span>
                  <Select
                    bind:value={draftConfig.channels!.feishu!.domain}
                    items={[
                      { value: "feishu", label: $t("feishuDomainChina") },
                      { value: "lark", label: $t("feishuDomainInternational") },
                    ]}
                    ariaLabel={$t("feishuDomain")}
                  />
                </div>
                <label class="detail-label">
                  <span class="label-text">{$t("channelAllowedChatIds")}</span>
                  <textarea
                    class="detail-input hook-textarea channel-allowlist"
                    value={draftConfig.channels!.feishu!.allowed_chat_ids.join("\n")}
                    placeholder={$t("channelAllowlistPlaceholder")}
                    oninput={(event) =>
                      (draftConfig.channels!.feishu!.allowed_chat_ids = parseChannelIds(
                        event.currentTarget.value,
                      ))}></textarea>
                </label>
              </div>
              {#if channelStatuses.feishu?.error}
                <div class="provider-status error">{channelStatuses.feishu.error}</div>
              {/if}
            </section>
          {:else if channelSettingsNav === "telegram"}
            <section class="detail-section">
              <div class="detail-section-header remote-gateway-heading">
                <div>
                  <h4 class="detail-section-title">{$t("telegramChannel")}</h4>
                  <p class="remote-gateway-subtitle">{$t("telegramChannelSubtitle")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(channelStatusKey(channelStatuses.telegram?.state))}
                  statusActive={channelStatuses.telegram?.state === "connected"}
                  toggleLabel={$t("channelEnabled")}
                  bind:checked={draftConfig.channels!.telegram!.enabled}
                  ariaLabel={$t("channelEnabled")}
                />
              </div>
              <div class="channel-config-card">
                <label class="detail-label">
                  <span class="label-text">{$t("channelBotToken")}</span>
                  <input
                    type="password"
                    class="detail-input"
                    bind:value={draftConfig.channels!.telegram!.bot_token}
                  />
                </label>
                <label class="detail-label">
                  <span class="label-text">{$t("channelAllowedChatIds")}</span>
                  <textarea
                    class="detail-input hook-textarea channel-allowlist"
                    value={draftConfig.channels!.telegram!.allowed_chat_ids.join("\n")}
                    placeholder={$t("channelAllowlistPlaceholder")}
                    oninput={(event) =>
                      (draftConfig.channels!.telegram!.allowed_chat_ids = parseChannelIds(
                        event.currentTarget.value,
                      ))}></textarea>
                </label>
              </div>
              {#if channelStatuses.telegram?.error}<div class="provider-status error">
                  {channelStatuses.telegram.error}
                </div>{/if}
            </section>
          {:else if channelSettingsNav === "qq"}
            <section class="detail-section">
              <div class="detail-section-header remote-gateway-heading">
                <div>
                  <h4 class="detail-section-title">{$t("qqChannel")}</h4>
                  <p class="remote-gateway-subtitle">{$t("qqChannelSubtitle")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(channelStatusKey(channelStatuses.qq?.state))}
                  statusActive={channelStatuses.qq?.state === "connected"}
                  toggleLabel={$t("channelEnabled")}
                  bind:checked={draftConfig.channels!.qq!.enabled}
                  ariaLabel={$t("channelEnabled")}
                />
              </div>
              <div class="channel-config-card">
                <label class="detail-label"
                  ><span class="label-text">{$t("channelAppId")}</span><input
                    class="detail-input"
                    bind:value={draftConfig.channels!.qq!.app_id}
                  /></label
                >
                <label class="detail-label"
                  ><span class="label-text">{$t("channelClientSecret")}</span><input
                    type="password"
                    class="detail-input"
                    bind:value={draftConfig.channels!.qq!.client_secret}
                  /></label
                >
                <label class="detail-label">
                  <span class="label-text">{$t("channelAllowedUserIds")}</span>
                  <textarea
                    class="detail-input hook-textarea channel-allowlist"
                    value={draftConfig.channels!.qq!.allowed_user_ids.join("\n")}
                    placeholder={$t("channelAllowlistPlaceholder")}
                    oninput={(event) =>
                      (draftConfig.channels!.qq!.allowed_user_ids = parseChannelIds(
                        event.currentTarget.value,
                      ))}></textarea>
                </label>
              </div>
              {#if channelStatuses.qq?.error}<div class="provider-status error">
                  {channelStatuses.qq.error}
                </div>{/if}
            </section>
          {:else if channelSettingsNav === "discord"}
            <section class="detail-section">
              <div class="detail-section-header remote-gateway-heading">
                <div>
                  <h4 class="detail-section-title">{$t("discordChannel")}</h4>
                  <p class="remote-gateway-subtitle">{$t("discordChannelSubtitle")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(channelStatusKey(channelStatuses.discord?.state))}
                  statusActive={channelStatuses.discord?.state === "connected"}
                  toggleLabel={$t("channelEnabled")}
                  bind:checked={draftConfig.channels!.discord!.enabled}
                  ariaLabel={$t("channelEnabled")}
                />
              </div>
              <div class="channel-config-card">
                <label class="detail-label"
                  ><span class="label-text">{$t("channelBotToken")}</span><input
                    type="password"
                    class="detail-input"
                    bind:value={draftConfig.channels!.discord!.bot_token}
                  /></label
                >
                <label class="detail-label">
                  <span class="label-text">{$t("channelAllowedChannelIds")}</span>
                  <textarea
                    class="detail-input hook-textarea channel-allowlist"
                    value={draftConfig.channels!.discord!.allowed_channel_ids.join("\n")}
                    placeholder={$t("channelAllowlistPlaceholder")}
                    oninput={(event) =>
                      (draftConfig.channels!.discord!.allowed_channel_ids = parseChannelIds(
                        event.currentTarget.value,
                      ))}></textarea>
                </label>
              </div>
              {#if channelStatuses.discord?.error}<div class="provider-status error">
                  {channelStatuses.discord.error}
                </div>{/if}
            </section>
          {:else if channelSettingsNav === "slack"}
            <section class="detail-section">
              <div class="detail-section-header remote-gateway-heading">
                <div>
                  <h4 class="detail-section-title">{$t("slackChannel")}</h4>
                  <p class="remote-gateway-subtitle">{$t("slackChannelSubtitle")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(channelStatusKey(channelStatuses.slack?.state))}
                  statusActive={channelStatuses.slack?.state === "connected"}
                  toggleLabel={$t("channelEnabled")}
                  bind:checked={draftConfig.channels!.slack!.enabled}
                  ariaLabel={$t("channelEnabled")}
                />
              </div>
              <div class="channel-config-card">
                <label class="detail-label"
                  ><span class="label-text">{$t("slackBotToken")}</span><input
                    type="password"
                    class="detail-input"
                    bind:value={draftConfig.channels!.slack!.bot_token}
                  /></label
                >
                <label class="detail-label"
                  ><span class="label-text">{$t("slackAppToken")}</span><input
                    type="password"
                    class="detail-input"
                    bind:value={draftConfig.channels!.slack!.app_token}
                  /></label
                >
                <label class="detail-label">
                  <span class="label-text">{$t("channelAllowedChannelIds")}</span>
                  <textarea
                    class="detail-input hook-textarea channel-allowlist"
                    value={draftConfig.channels!.slack!.allowed_channel_ids.join("\n")}
                    placeholder={$t("channelAllowlistPlaceholder")}
                    oninput={(event) =>
                      (draftConfig.channels!.slack!.allowed_channel_ids = parseChannelIds(
                        event.currentTarget.value,
                      ))}></textarea>
                </label>
              </div>
              {#if channelStatuses.slack?.error}<div class="provider-status error">
                  {channelStatuses.slack.error}
                </div>{/if}
            </section>
          {:else if channelSettingsNav === "wechat"}
            <section class="detail-section">
              <div class="detail-section-header remote-gateway-heading">
                <div>
                  <h4 class="detail-section-title">{$t("wechatChannel")}</h4>
                  <p class="remote-gateway-subtitle">{$t("wechatChannelSubtitle")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(wechatStatusKey(wechatChannelStatus?.state))}
                  statusActive={wechatChannelStatus?.state === "connected"}
                  toggleLabel={$t("wechatChannelEnabled")}
                  bind:checked={draftConfig.channels!.wechat.enabled}
                  ariaLabel={$t("wechatChannelEnabled")}
                />
              </div>
              <div class="remote-gateway-card">
                <div class="wechat-channel-access">
                  <label class="label-text" for="wechat-allowed-users"
                    >{$t("wechatChannelAllowedUsers")}</label
                  >
                  <p class="detail-hint">{$t("wechatChannelAllowedUsersHint")}</p>
                  <textarea
                    id="wechat-allowed-users"
                    class="detail-input hook-textarea wechat-user-ids"
                    value={draftConfig.channels!.wechat.allowed_user_ids.join("\n")}
                    placeholder={$t("wechatChannelAllowedUsersPlaceholder")}
                    oninput={(event) =>
                      (draftConfig.channels!.wechat.allowed_user_ids = parseChannelIds(
                        event.currentTarget.value,
                      ))}></textarea>
                </div>
              </div>
              {#if draftConfig.channels!.wechat.enabled && wechatChannelStatus?.state === "awaiting_scan" && wechatChannelStatus.qr_image_data_url}
                <div class="wechat-qr-card">
                  <img src={wechatChannelStatus.qr_image_data_url} alt={$t("wechatChannelQrAlt")} />
                  <div>
                    <strong>{$t("wechatChannelScanTitle")}</strong>
                    <p class="detail-hint">{$t("wechatChannelScanHint")}</p>
                  </div>
                </div>
              {:else if draftConfig.channels!.wechat.enabled && wechatChannelStatus?.state === "connected"}
                <div class="wechat-connected-card">
                  <div>
                    <span class="remote-credential-label">{$t("wechatChannelAccount")}</span><code
                      >{wechatChannelStatus.account_id}</code
                    >
                  </div>
                  <button
                    class="remote-credential-action"
                    disabled={wechatChannelBusy}
                    onclick={reconnectWechatChannel}>{$t("wechatChannelReconnect")}</button
                  >
                </div>
              {/if}
              {#if wechatChannelStatus?.error || wechatChannelMessage}<div
                  class="provider-status"
                  style="margin-top:8px"
                >
                  {wechatChannelMessage || wechatChannelStatus?.error}
                </div>{/if}
            </section>
          {:else}
            <section class="detail-section">
              <div class="detail-section-header remote-gateway-heading">
                <div>
                  <h4 class="detail-section-title">{$t("remoteGateway")}</h4>
                  <p class="remote-gateway-subtitle">{$t("remoteGatewaySubtitle")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={draftConfig.remote_gateway.enabled
                    ? $t("remoteGatewayRunning")
                    : $t("remoteGatewayStopped")}
                  statusActive={draftConfig.remote_gateway.enabled}
                  toggleLabel={$t("remoteGatewayEnabled")}
                  bind:checked={draftConfig.remote_gateway.enabled}
                  ariaLabel={$t("remoteGatewayEnabled")}
                />
              </div>
              <div class="remote-gateway-card">
                <div class="remote-gateway-toggle-row remote-gateway-workspace-row">
                  <div class="remote-gateway-icon workspace" aria-hidden="true">LAN</div>
                  <div class="startup-copy">
                    <span class="label-text">{$t("remoteGatewayLanAccess")}</span>
                    <p class="detail-hint">{$t("remoteGatewayLanAccessHint")}</p>
                  </div>
                  <Switch
                    bind:checked={draftConfig.remote_gateway.allow_lan_access}
                    ariaLabel={$t("remoteGatewayLanAccess")}
                  />
                </div>
                <div class="remote-gateway-toggle-row remote-gateway-workspace-row">
                  <div class="remote-gateway-icon workspace" aria-hidden="true">⌂</div>
                  <div class="startup-copy">
                    <span class="label-text">{$t("remoteGatewayCurrentWorkspace")}</span>
                    <p class="detail-hint remote-workspace-path">
                      {workspacePath || $t("noWorkspace")}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(workspacePath) &&
                      draftConfig.remote_gateway.allowed_workspaces.includes(workspacePath)}
                    disabled={!workspacePath}
                    onCheckedChange={toggleCurrentWorkspaceAccess}
                    ariaLabel={$t("remoteGatewayCurrentWorkspace")}
                  />
                </div>
              </div>
              {#if draftConfig.remote_gateway.enabled && remoteGatewayStatus}
                <div class="remote-gateway-credentials">
                  <div class="remote-credential-row">
                    <div class="remote-credential-copy">
                      <span class="remote-credential-label">{$t("remoteGatewayLocalUrl")}</span
                      ><code>{remoteGatewayStatus.url}</code>
                    </div>
                    <button
                      class="remote-credential-action"
                      onclick={() => copyRemoteGatewayValue(remoteGatewayStatus?.url ?? "", "url")}
                      >{copiedRemoteValue === "url"
                        ? $t("remoteGatewayCopied")
                        : $t("copy")}</button
                    >
                  </div>
                  {#if draftConfig.remote_gateway.allow_lan_access && remoteGatewayStatus.lan_url}<div
                      class="remote-credential-row"
                    >
                      <div class="remote-credential-copy">
                        <span class="remote-credential-label">{$t("remoteGatewayLanUrl")}</span
                        ><code>{remoteGatewayStatus.lan_url}</code>
                      </div>
                      <button
                        class="remote-credential-action"
                        onclick={() =>
                          copyRemoteGatewayValue(remoteGatewayStatus?.lan_url ?? "", "lan")}
                        >{copiedRemoteValue === "lan"
                          ? $t("remoteGatewayCopied")
                          : $t("copy")}</button
                      >
                    </div>{/if}
                  <div class="remote-credential-row pairing">
                    <div class="remote-credential-copy">
                      <span class="remote-credential-label">{$t("remoteGatewayPairingCode")}</span
                      ><code>{remoteGatewayStatus.pairing_code}</code>
                    </div>
                    <div class="remote-credential-actions">
                      <button
                        class="remote-credential-action"
                        onclick={() =>
                          copyRemoteGatewayValue(remoteGatewayStatus?.pairing_code ?? "", "code")}
                        >{copiedRemoteValue === "code"
                          ? $t("remoteGatewayCopied")
                          : $t("copy")}</button
                      ><button
                        class="remote-credential-action primary"
                        disabled={remoteGatewayBusy}
                        onclick={rotateRemotePairingCode}>{$t("remoteGatewayRotate")}</button
                      >
                    </div>
                  </div>
                  <div class="remote-security-note">
                    <span aria-hidden="true">⌁</span>
                    <p>{$t("remoteGatewayProxyHint")}</p>
                  </div>
                </div>
              {/if}
              {#if remoteGatewayMessage}<div class="provider-status" style="margin-top:8px">
                  {remoteGatewayMessage}
                </div>{/if}
            </section>
          {/if}
        </div>
      </div>
    </Tabs.Content>

    <Tabs.Content value="memory" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("memoryManagement")}</h4>
          <div class="detail-label">
            <span class="label-text">{$t("scope")}</span>
            <Select
              bind:value={memoryScope}
              items={[
                { value: "global", label: $t("globalTab") },
                { value: "local", label: $t("projectTab") },
              ]}
              ariaLabel={$t("scope")}
            />
            {#if memoryScope === "local" && !workspacePath}
              <p class="detail-hint">{$t("memoryNoWorkspace")}</p>
            {:else}
              <p class="detail-hint">{$t("memoryManagementHint")}</p>
            {/if}
          </div>
        </section>

        <section class="detail-section">
          <h4 class="detail-section-title">{$t("memoryBackup")}</h4>
          <div class="memory-action-grid">
            <button
              class="filter-toggle"
              onclick={exportMemory}
              disabled={memoryBusy || !memoryScopeAvailable()}
            >
              {$t("exportMemory")}
            </button>
            <button
              class="filter-toggle"
              onclick={() => importMemory(false)}
              disabled={memoryBusy || !memoryScopeAvailable()}
            >
              {$t("importMemoryMerge")}
            </button>
            <button
              class="filter-toggle"
              onclick={() => importMemory(true)}
              disabled={memoryBusy || !memoryScopeAvailable()}
            >
              {$t("importMemoryReplace")}
            </button>
          </div>
        </section>

        <section class="detail-section danger-zone">
          <div>
            <p class="danger-title">{$t("clearMemory")}</p>
            <p class="danger-copy">{$t("clearMemoryDesc")}</p>
          </div>
          <button
            class="filter-toggle danger-btn"
            onclick={clearMemoryScope}
            disabled={memoryBusy || !memoryScopeAvailable()}
          >
            {$t("clearMemory")}
          </button>
        </section>

        {#if memoryStatus}
          <div
            class="provider-status {memoryStatus.includes(tr('memoryOperationFailed'))
              ? 'error'
              : 'success'}"
          >
            {memoryStatus}
          </div>
        {/if}
      </div>
    </Tabs.Content>

    <Tabs.Content value="websearch" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("fetchSettings")}</h4>
          <label class="detail-label">
            <span class="label-text">{$t("fetchPageSize")}</span>
            <input
              type="number"
              class="detail-input"
              min="1000"
              max="50000"
              step="1000"
              bind:value={draftConfig.fetch.page_size}
            />
          </label>
          <p class="detail-hint">{$t("fetchPageSizeHint")}</p>
        </section>

        <section class="detail-section">
          <div class="detail-label">
            <span class="label-text">{$t("searchProvider")}</span>
            <Select
              bind:value={draftConfig.web_search.provider}
              items={[
                { value: "brave", label: $t("searchProviderBrave") },
                { value: "tavily", label: $t("searchProviderTavily") },
                { value: "searxng", label: $t("searchProviderSearxng") },
              ]}
              ariaLabel={$t("searchProvider")}
            />
          </div>
          <p class="detail-hint">{$t("searchProviderDesc")}</p>
        </section>

        {#if draftConfig.web_search.provider === "brave"}
          <section class="detail-section">
            <h4 class="detail-section-title">{$t("searchProviderBrave")}</h4>
            <label class="detail-label">
              <span class="label-text">{$t("braveApiKey")}</span>
              <input
                type="password"
                class="detail-input"
                placeholder={$t("braveApiKeyPlaceholder")}
                bind:value={draftConfig.web_search.brave_api_key}
              />
            </label>
          </section>
        {:else if draftConfig.web_search.provider === "tavily"}
          <section class="detail-section">
            <h4 class="detail-section-title">{$t("searchProviderTavily")}</h4>
            <label class="detail-label">
              <span class="label-text">{$t("tavilyApiKey")}</span>
              <input
                type="password"
                class="detail-input"
                placeholder={$t("tavilyApiKeyPlaceholder")}
                bind:value={draftConfig.web_search.tavily_api_key}
              />
            </label>
          </section>
        {:else if draftConfig.web_search.provider === "searxng"}
          <section class="detail-section">
            <h4 class="detail-section-title">{$t("searchProviderSearxng")}</h4>
            <label class="detail-label">
              <span class="label-text">{$t("searxngBaseUrl")}</span>
              <input
                type="text"
                class="detail-input"
                placeholder={$t("searxngBaseUrlPlaceholder")}
                bind:value={draftConfig.web_search.searxng_base_url}
              />
            </label>
            <p class="detail-hint">{$t("searxngHint")}</p>
          </section>
        {/if}
      </div>
    </Tabs.Content>

    <Tabs.Content value="providers" class="settings-tab-panel">
      <div class="settings-list-col">
        <div class="list-search-bar">
          <div class="list-toolbar">
            <input
              class="list-search-input"
              placeholder={$t("searchProviders")}
              bind:value={providerSearch}
            />
            <button
              class="filter-toggle"
              onclick={() => {
                providerFilter =
                  providerFilter === "all"
                    ? "enabled"
                    : providerFilter === "enabled"
                      ? "disabled"
                      : "all";
              }}
            >
              {providerFilter === "all"
                ? $t("filterAll")
                : providerFilter === "enabled"
                  ? $t("filterEnabled")
                  : $t("filterDisabled")}
            </button>
          </div>
        </div>
        <div class="provider-list">
          {#if filteredProviders.length > 0}
            {#each filteredProviders as provider (provider.id)}
              {@const providerIcon = providerIconPath(provider.provider)}
              <ContextMenu.Root>
                <ContextMenu.Trigger>
                  <button
                    class="provider-item {selectedProviderId === provider.id ? 'active' : ''}"
                    onclick={() => {
                      selectedProviderId = provider.id;
                      modelSearch = "";
                      manualModelName = "";
                    }}
                  >
                    <div class="provider-item-icon">
                      <img src={providerIcon} alt="" aria-hidden="true" />
                    </div>
                    <div class="provider-item-info">
                      <span class="provider-item-name">{provider.name}</span>
                      <span class="provider-item-url">{getProviderUrl(provider)}</span>
                    </div>
                    <span
                      class:provider-enabled-dot={provider.enabled}
                      class:provider-disabled-dot={!provider.enabled}
                    ></span>
                  </button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content class="ctx-menu-content">
                    <ContextMenu.Item
                      class="ctx-menu-item ctx-menu-item-danger"
                      onclick={() => removeProvider(provider.id)}
                    >
                      {$t("deleteNode")}
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            {/each}
          {:else}
            <div class="provider-list-empty">{$t("noProviders")}</div>
          {/if}
        </div>
        <div class="list-footer">
          <button class="add-provider-btn" onclick={addProvider}>{$t("addProvider")}</button>
        </div>
      </div>

      {#if selectedProviderIndex >= 0 && selectedProvider}
        <div class="settings-detail-col">
          <div class="detail-top-bar">
            <span class="detail-service-name">{selectedProvider.name}</span>
            <SettingsStatusToggle
              statusLabel={selectedProvider.enabled ? $t("filterEnabled") : $t("filterDisabled")}
              statusActive={selectedProvider.enabled}
              toggleLabel={$t("providerEnabled")}
              bind:checked={draftConfig.providers[selectedProviderIndex].enabled}
              disabled={modelLoading[selectedProvider.id]}
              onCheckedChange={(checked) => setProviderEnabled(selectedProvider.id, checked)}
              ariaLabel={$t("providerEnabled")}
            />
          </div>
          <div class="detail-content">
            <section class="detail-section">
              <h4 class="detail-section-title">{$t("basicInfo")}</h4>
              <label class="detail-label">
                <span class="label-text">{$t("providerName")}</span>
                <input
                  class="detail-input"
                  bind:value={draftConfig.providers[selectedProviderIndex].name}
                />
              </label>
              <div class="detail-label">
                <span class="label-text">{$t("providerType")}</span>
                <Select
                  bind:value={draftConfig.providers[selectedProviderIndex].provider}
                  items={PROVIDER_CATALOG.map(({ value, label }) => ({ value, label }))}
                  ariaLabel={$t("providerType")}
                />
              </div>
            </section>

            <section class="detail-section">
              <h4 class="detail-section-title">{$t("apiSettings")}</h4>
              <div class="detail-label">
                <span class="label-text">
                  {providerRequiresApiKey(selectedProvider.provider)
                    ? $t("apiKey")
                    : selectedProvider.provider === "chatgpt"
                      ? $t("chatgptOAuthAccessToken")
                      : $t("apiKeyOptional")}
                </span>
                <div class="key-input-row">
                  <input
                    type="password"
                    class="detail-input"
                    bind:value={draftConfig.providers[selectedProviderIndex].api_key}
                  />
                  <button
                    class="btn-secondary btn-sm"
                    onclick={() =>
                      selectedProvider.provider === "chatgpt" &&
                      !selectedProvider.api_key.trim() &&
                      chatgptOAuthAuthenticated
                        ? logoutChatgpt(selectedProvider.id)
                        : testProvider(selectedProvider.id)}
                    disabled={getStatus(selectedProvider.id).tone === "loading"}
                    >{selectedProvider.provider === "chatgpt" && !selectedProvider.api_key.trim()
                      ? chatgptOAuthAuthenticated
                        ? $t("signOutChatgpt")
                        : $t("signInChatgpt")
                      : $t("testConnection")}</button
                  >
                </div>
              </div>
              <label class="detail-label">
                <span class="label-text">{$t("apiUrl")}</span>
                <input
                  class="detail-input"
                  bind:value={draftConfig.providers[selectedProviderIndex].base_url}
                  placeholder={providerDefaultBaseUrl(selectedProvider.provider) ||
                    "https://your-resource.openai.azure.com"}
                />
                <span class="base-url-preview">{getProviderPreviewUrl(selectedProvider)}</span>
              </label>
              {#if getStatus(selectedProvider.id).message}
                <div class="provider-status {getStatus(selectedProvider.id).tone}">
                  {getStatus(selectedProvider.id).message}
                </div>
              {/if}
            </section>

            <section class="detail-section">
              <div class="detail-section-header">
                <h4 class="detail-section-title">{$t("modelList")}</h4>
                <button
                  class="btn-secondary btn-sm"
                  onclick={() => fetchModels(selectedProvider.id)}
                  disabled={modelLoading[selectedProvider.id]}
                >
                  {modelLoading[selectedProvider.id] ? $t("syncing") : $t("fetchModels")}
                </button>
              </div>
              {#if selectedProvider.provider === "chatgpt"}
                <p class="chatgpt-model-catalog-hint" role="note">
                  {$t("chatgptModelCatalogHint")}
                </p>
              {/if}
              {#if selectedProvider.models.length > 0}
                <input
                  class="model-search-input"
                  placeholder={$t("searchModels")}
                  bind:value={modelSearch}
                />
              {/if}
              <div class="manual-model-row">
                <input
                  class="model-search-input"
                  placeholder={$t("modelOrDeploymentName")}
                  bind:value={manualModelName}
                  onkeydown={(event) => {
                    if (event.key === "Enter") addManualModel(selectedProvider);
                  }}
                />
                <button
                  class="btn-secondary btn-sm"
                  onclick={() => addManualModel(selectedProvider)}>{$t("addModel")}</button
                >
              </div>
              <div class="model-list-box">
                {#if selectedProvider.models.length === 0}
                  <div class="model-list-empty">{$t("noModels")}</div>
                {:else if filteredModels.length === 0}
                  <div class="model-list-empty">{modelSearch}</div>
                {:else}
                  {#each filteredModels as modelName (modelName)}
                    <div class="model-item">
                      <div class="model-main">
                        <span class="model-name">{modelName}</span>
                      </div>
                      <div class="model-item-actions">
                        <button
                          class="model-action-btn"
                          onclick={() =>
                            setDefaultModel("chat_model", selectedProvider.id, modelName)}
                          >Chat</button
                        >
                        <button
                          class="model-action-btn"
                          onclick={() =>
                            setDefaultModel("flash_model", selectedProvider.id, modelName)}
                          >Flash</button
                        >
                        <button
                          class="model-action-btn"
                          onclick={() => openModelConfig(selectedProvider.id, modelName)}
                          >{$t("configure")}</button
                        >
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </section>

            <section class="detail-section">
              <div class="danger-zone">
                <div>
                  <div class="danger-title">{$t("deleteNode")}</div>
                  <div class="danger-copy">{$t("deleteNodeDesc")}</div>
                </div>
                <button class="danger-btn" onclick={() => removeProvider(selectedProvider.id)}
                  >{$t("deleteNode")}</button
                >
              </div>
            </section>
          </div>
        </div>
      {/if}
    </Tabs.Content>

    <Tabs.Content value="hooks" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t("scheduledHooks")}</h4>
            <button class="filter-toggle" onclick={refreshHooks}>{$t("refresh")}</button>
          </div>
          <div class="detail-grid">
            <label class="detail-label" style="grid-column: 1 / -1">
              <span class="label-text">{$t("hookUserMessage")}</span>
              <textarea
                class="detail-input hook-textarea"
                bind:value={hookMessage}
                placeholder={$t("hookUserMessagePlaceholder")}></textarea>
            </label>
            <div class="detail-label">
              <span class="label-text">{$t("hookSchedule")}</span>
              <Select
                bind:value={hookMode}
                items={[
                  { value: "delay", label: $t("hookModeDelay") },
                  { value: "run_at", label: $t("hookModeRunAt") },
                  { value: "interval_minutes", label: $t("hookModeInterval") },
                  { value: "daily", label: $t("hookModeDaily") },
                  { value: "weekdays", label: $t("hookModeWeekdays") },
                  { value: "weekly", label: $t("hookModeWeekly") },
                ]}
                ariaLabel={$t("hookSchedule")}
              />
            </div>
            <div class="detail-label">
              <span class="label-text">{$t("scheduledRole")}</span>
              <Select
                bind:value={hookRoleKey}
                items={[
                  {
                    value: "openagent",
                    label: $t("defaultRoleName"),
                    description: $t("defaultRoleDescription"),
                  },
                  ...hookRoles.map((role) => ({
                    value: role.id,
                    label: role.name,
                    description: role.description,
                  })),
                ]}
                searchable
                contentClass="scheduled-role-select-content"
                searchPlaceholder={$t("roleSelectorSearch")}
                emptyText={$t("noMatchingRoles")}
                ariaLabel={$t("scheduledRole")}
              />
            </div>
            {#if hookMode === "delay"}
              <label class="detail-label">
                <span class="label-text">{$t("hookDelayMinutes")}</span>
                <input class="detail-input" type="number" min="1" bind:value={hookDelayMinutes} />
              </label>
            {:else if hookMode === "run_at"}
              <label class="detail-label">
                <span class="label-text">{$t("hookRunAt")}</span>
                <input class="detail-input" bind:value={hookRunAt} placeholder="2026-06-17 18:30" />
              </label>
            {:else if hookMode === "interval_minutes"}
              <label class="detail-label">
                <span class="label-text">{$t("hookIntervalMinutes")}</span>
                <input
                  class="detail-input"
                  type="number"
                  min="1"
                  bind:value={hookIntervalMinutes}
                />
              </label>
            {:else}
              <label class="detail-label">
                <span class="label-text">{$t("hookTimeOfDay")}</span>
                <input class="detail-input" bind:value={hookTimeOfDay} placeholder="09:00" />
              </label>
              {#if hookMode === "weekly"}
                <label class="detail-label" style="grid-column: 1 / -1">
                  <span class="label-text">{$t("hookWeekdays")}</span>
                  <input class="detail-input" bind:value={hookWeekdays} placeholder="mon,wed,fri" />
                </label>
              {/if}
            {/if}
          </div>
          <div class="key-input-row" style="margin-top:12px">
            <button class="filter-toggle" onclick={saveHook}>
              {editingHookId ? $t("saveHookChanges") : $t("createHook")}
            </button>
            {#if editingHookId}
              <button class="model-action-btn" onclick={resetHookEditor}
                >{$t("cancelEditHook")}</button
              >
            {/if}
            {#if hookStatus}
              <div class="provider-status success">{hookStatus}</div>
            {/if}
          </div>
        </section>

        <section class="detail-section">
          <h4 class="detail-section-title">{$t("activeHooks")}</h4>
          <div class="model-list-box">
            {#if scheduledHooks.length > 0}
              {#each scheduledHooks as hook (hook.id)}
                <div class="hook-item">
                  <div class="hook-main">
                    <div class="model-name">{hook.schedule}</div>
                    <div class="provider-item-url">
                      {$t("nextRunAt")}: {formatHookTime(hook.next_run_at)}
                    </div>
                    <div class="provider-item-url">
                      {$t("scheduledRole")}: {hookRoleName(hook.role_id)}
                    </div>
                    <div class="provider-item-url">{hook.message}</div>
                    {#if hook.triggered_conversations.length > 0}
                      <div class="hook-conversations">
                        <div class="hook-conversations-title">{$t("triggeredConversations")}</div>
                        <div class="hook-conversations-scroll">
                          {#each hook.triggered_conversations
                            .slice()
                            .reverse() as conversation, index (`${conversation.conv_id}-${conversation.triggered_at}-${index}`)}
                            <Tooltip text={conversation.title}>
                              {#snippet trigger(props)}
                                <button
                                  {...props}
                                  class="hook-conversation-link"
                                  onclick={() => onOpenConversation(conversation.conv_id)}
                                >
                                  <span>{conversation.title || $t("untitledConversation")}</span>
                                  <time>{formatHookTime(conversation.triggered_at)}</time>
                                </button>
                              {/snippet}
                            </Tooltip>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </div>
                  <div class="hook-actions">
                    <button class="model-action-btn" onclick={() => editHook(hook)}
                      >{$t("editHook")}</button
                    >
                    <button class="model-action-btn" onclick={() => cancelHook(hook.id)}
                      >{$t("cancel")}</button
                    >
                  </div>
                </div>
              {/each}
            {:else}
              <div class="model-list-empty">{$t("noActiveHooks")}</div>
            {/if}
          </div>
        </section>
      </div>
    </Tabs.Content>
    <Tabs.Content value="defaults" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("chatModel")}</h4>
          <div class="detail-label">
            <span class="label-text">{$t("providerNode")}</span>
            <Select
              value={draftConfig.defaults.chat_model.provider_id}
              items={enabledProviderOptions()}
              ariaLabel={$t("providerNode")}
              onValueChange={(providerId) =>
                selectBindingProvider(draftConfig.defaults.chat_model, providerId)}
            />
          </div>
          <div class="detail-label">
            <span class="label-text">{$t("model")}</span>
            <Select
              bind:value={draftConfig.defaults.chat_model.model}
              items={providerModels(draftConfig.defaults.chat_model.provider_id).map((m) => ({
                value: m,
                label: m,
              }))}
              placeholder={$t("model")}
              searchable
              searchPlaceholder={$t("searchModels")}
              emptyText={$t("noModels")}
              ariaLabel={$t("model")}
            />
          </div>
        </section>
        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t("chatModelRetryQueue")}</h4>
            <button class="btn-secondary btn-sm" onclick={() => addRetryQueueModel("chat_queue")}
              >{$t("add")}</button
            >
          </div>
          <div class="model-list-box retry-queue-list">
            {#if draftConfig.model_retry.chat_queue.length > 0}
              {#each draftConfig.model_retry.chat_queue as binding, index (binding)}
                <div
                  class:retry-queue-dragging={draggedRetryQueue?.kind === "chat_queue" &&
                    draggedRetryQueue.index === index}
                  class="model-item retry-queue-item"
                  role="listitem"
                  ondragover={(event) => event.preventDefault()}
                  ondrop={(event) => dropRetryQueueModel("chat_queue", index, event)}
                >
                  <Tooltip text={$t("retryQueueDragHandle")}>
                    {#snippet trigger(props)}
                      <button
                        {...props}
                        class="retry-queue-drag-handle"
                        type="button"
                        draggable="true"
                        aria-label={$t("retryQueueDragHandle")}
                        ondragstart={(event) => startRetryQueueDrag("chat_queue", index, event)}
                        ondragend={() => (draggedRetryQueue = null)}>⠇</button
                      >
                    {/snippet}
                  </Tooltip>
                  <div class="retry-queue-fields">
                    <Select
                      value={binding.provider_id}
                      items={enabledProviderOptions()}
                      ariaLabel={$t("providerNode")}
                      onValueChange={(providerId) => selectBindingProvider(binding, providerId)}
                    />
                    <Select
                      bind:value={binding.model}
                      items={providerModels(binding.provider_id).map((m) => ({
                        value: m,
                        label: m,
                      }))}
                      placeholder={$t("model")}
                      searchable
                      searchPlaceholder={$t("searchModels")}
                      emptyText={$t("noModels")}
                      ariaLabel={$t("model")}
                    />
                  </div>
                  <button
                    class="model-action-btn"
                    onclick={() => removeRetryQueueModel("chat_queue", index)}
                    >{$t("delete")}</button
                  >
                </div>
              {/each}
            {:else}
              <div class="model-list-empty">{$t("noQueuedChatFallbackModels")}</div>
            {/if}
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("modelRetryPolicy")}</h4>
          <p class="detail-section-intro">{$t("modelRetryPolicyDescription")}</p>
          <div class="settings-card">
            <label class="settings-card-row">
              <span class="label-text">{$t("retryCountPerModel")}</span>
              <span class="settings-card-control">
                <input
                  class="detail-input"
                  type="number"
                  min="0"
                  max="10"
                  bind:value={draftConfig.model_retry.retry_count}
                />
              </span>
            </label>
            <label class="settings-card-row">
              <span class="label-text">{$t("retryDelaySeconds")}</span>
              <span class="settings-card-control">
                <input
                  class="detail-input"
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  value={draftConfig.model_retry.retry_delay_ms / 1000}
                  oninput={updateRetryDelaySeconds}
                />
              </span>
            </label>
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t("flashModel")}</h4>
          <div class="detail-label">
            <span class="label-text">{$t("providerNode")}</span>
            <Select
              value={draftConfig.defaults.flash_model.provider_id}
              items={enabledProviderOptions()}
              ariaLabel={$t("providerNode")}
              onValueChange={(providerId) =>
                selectBindingProvider(draftConfig.defaults.flash_model, providerId)}
            />
          </div>
          <div class="detail-label">
            <span class="label-text">{$t("model")}</span>
            <Select
              bind:value={draftConfig.defaults.flash_model.model}
              items={providerModels(draftConfig.defaults.flash_model.provider_id).map((m) => ({
                value: m,
                label: m,
              }))}
              placeholder={$t("model")}
              searchable
              searchPlaceholder={$t("searchModels")}
              emptyText={$t("noModels")}
              ariaLabel={$t("model")}
            />
          </div>
        </section>
        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t("flashModelRetryQueue")}</h4>
            <button class="btn-secondary btn-sm" onclick={() => addRetryQueueModel("flash_queue")}
              >{$t("add")}</button
            >
          </div>
          <div class="model-list-box retry-queue-list">
            {#if draftConfig.model_retry.flash_queue.length > 0}
              {#each draftConfig.model_retry.flash_queue as binding, index (binding)}
                <div
                  class:retry-queue-dragging={draggedRetryQueue?.kind === "flash_queue" &&
                    draggedRetryQueue.index === index}
                  class="model-item retry-queue-item"
                  role="listitem"
                  ondragover={(event) => event.preventDefault()}
                  ondrop={(event) => dropRetryQueueModel("flash_queue", index, event)}
                >
                  <Tooltip text={$t("retryQueueDragHandle")}>
                    {#snippet trigger(props)}
                      <button
                        {...props}
                        class="retry-queue-drag-handle"
                        type="button"
                        draggable="true"
                        aria-label={$t("retryQueueDragHandle")}
                        ondragstart={(event) => startRetryQueueDrag("flash_queue", index, event)}
                        ondragend={() => (draggedRetryQueue = null)}>⠇</button
                      >
                    {/snippet}
                  </Tooltip>
                  <div class="retry-queue-fields">
                    <Select
                      value={binding.provider_id}
                      items={enabledProviderOptions()}
                      ariaLabel={$t("providerNode")}
                      onValueChange={(providerId) => selectBindingProvider(binding, providerId)}
                    />
                    <Select
                      bind:value={binding.model}
                      items={providerModels(binding.provider_id).map((m) => ({
                        value: m,
                        label: m,
                      }))}
                      placeholder={$t("model")}
                      searchable
                      searchPlaceholder={$t("searchModels")}
                      emptyText={$t("noModels")}
                      ariaLabel={$t("model")}
                    />
                  </div>
                  <button
                    class="model-action-btn"
                    onclick={() => removeRetryQueueModel("flash_queue", index)}
                    >{$t("delete")}</button
                  >
                </div>
              {/each}
            {:else}
              <div class="model-list-empty">{$t("noQueuedFlashFallbackModels")}</div>
            {/if}
          </div>
        </section>
      </div>
    </Tabs.Content>

    <Tabs.Content value="agents" class="settings-tab-panel">
      <div class="settings-content-col agents-settings-content">
        <header class="agents-settings-intro">
          <h3>{$t("flashAgents")}</h3>
          <p>{$t("flashAgentsDescription")}</p>
        </header>

        <section class="flash-task-group" aria-labelledby="conversation-flash-tasks">
          <div class="flash-task-group-heading">
            <h4 id="conversation-flash-tasks">{$t("conversationFlashTasks")}</h4>
            <p>{$t("conversationFlashTasksDescription")}</p>
          </div>
          <div class="flash-task-card">
            <article class="flash-task-item">
              <div class="flash-task-heading">
                <div class="flash-task-copy">
                  <h5>{$t("titleAgent")}</h5>
                  <p>{$t("titleTaskDescription")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(
                    draftConfig.flash_agents.title.enabled ? "filterEnabled" : "filterDisabled",
                  )}
                  statusActive={draftConfig.flash_agents.title.enabled}
                  toggleLabel={$t("taskEnabled")}
                  bind:checked={draftConfig.flash_agents.title.enabled}
                  ariaLabel={$t("titleAgentEnabled")}
                />
              </div>
              <details
                class="flash-task-custom"
                open={draftConfig.flash_agents.title.prompt.trim().length > 0}
              >
                <summary>{$t("taskCustomPrompt")}</summary>
                <label class="detail-label">
                  <span class="sr-only">{$t("agentExtraPrompt")}</span>
                  <textarea
                    class="detail-input flash-task-textarea"
                    bind:value={draftConfig.flash_agents.title.prompt}
                    placeholder={$t("titleAgentPromptPlaceholder")}></textarea>
                </label>
              </details>
            </article>

            <article class="flash-task-item">
              <div class="flash-task-heading">
                <div class="flash-task-copy">
                  <h5>{$t("memoryAgent")}</h5>
                  <p>{$t("memoryTaskDescription")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(
                    draftConfig.flash_agents.memory.enabled ? "filterEnabled" : "filterDisabled",
                  )}
                  statusActive={draftConfig.flash_agents.memory.enabled}
                  toggleLabel={$t("taskEnabled")}
                  bind:checked={draftConfig.flash_agents.memory.enabled}
                  ariaLabel={$t("memoryAgentEnabled")}
                />
              </div>
              <div class="flash-task-suboptions">
                <div class="flash-task-suboption">
                  <div>
                    <h6>{$t("newConversationSummary")}</h6>
                    <p>{$t("newConversationSummaryDescription")}</p>
                  </div>
                  <Switch
                    bind:checked={draftConfig.flash_agents.new_conversation_summary.enabled}
                    disabled={!draftConfig.flash_agents.memory.enabled}
                    ariaLabel={$t("newConversationSummaryEnabled")}
                  />
                </div>
                <div class="flash-task-suboption">
                  <div>
                    <h6>{$t("memoryRetrieval")}</h6>
                    <p>{$t("memoryRetrievalDescription")}</p>
                  </div>
                  <Switch
                    bind:checked={draftConfig.memory_retrieval_enabled}
                    disabled={!draftConfig.flash_agents.memory.enabled}
                    ariaLabel={$t("memoryRetrievalEnabled")}
                  />
                </div>
              </div>
              <details
                class="flash-task-custom"
                open={draftConfig.flash_agents.memory.prompt.trim().length > 0}
              >
                <summary>{$t("taskCustomPrompt")}</summary>
                <label class="detail-label">
                  <span class="sr-only">{$t("agentExtraPrompt")}</span>
                  <textarea
                    class="detail-input flash-task-textarea"
                    bind:value={draftConfig.flash_agents.memory.prompt}
                    placeholder={$t("memoryAgentPromptPlaceholder")}></textarea>
                </label>
              </details>
            </article>

            <article class="flash-task-item">
              <div class="flash-task-heading">
                <div class="flash-task-copy">
                  <h5>{$t("compactionTask")}</h5>
                  <p>{$t("compactionTaskDescription")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(
                    draftConfig.context_compaction_enabled ? "filterEnabled" : "filterDisabled",
                  )}
                  statusActive={draftConfig.context_compaction_enabled}
                  toggleLabel={$t("taskEnabled")}
                  bind:checked={draftConfig.context_compaction_enabled}
                  ariaLabel={$t("contextCompaction")}
                />
              </div>
              <label class="flash-task-inline-setting">
                <span>{$t("contextCompactionThreshold")}</span>
                <input
                  type="number"
                  class="detail-input compaction-threshold-input"
                  min="1000"
                  max="1000000"
                  step="1000"
                  disabled={!draftConfig.context_compaction_enabled}
                  bind:value={draftConfig.context_compaction_threshold}
                />
              </label>
              <details
                class="flash-task-custom"
                open={draftConfig.context_compaction_prompt.trim().length > 0}
              >
                <summary>{$t("taskCustomPrompt")}</summary>
                <label class="detail-label">
                  <span class="sr-only">{$t("agentExtraPrompt")}</span>
                  <textarea
                    class="detail-input flash-task-textarea"
                    bind:value={draftConfig.context_compaction_prompt}
                    placeholder={$t("compactionTaskPromptPlaceholder")}></textarea>
                </label>
              </details>
            </article>
          </div>
        </section>

        <section class="flash-task-group" aria-labelledby="automation-flash-tasks">
          <div class="flash-task-group-heading">
            <h4 id="automation-flash-tasks">{$t("automationFlashTasks")}</h4>
            <p>{$t("automationFlashTasksDescription")}</p>
          </div>
          <div class="flash-task-card">
            <article class="flash-task-item">
              <div class="flash-task-heading">
                <div class="flash-task-copy">
                  <h5>{$t("skillCategoryAgent")}</h5>
                  <p>{$t("skillCategoryTaskDescription")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(
                    draftConfig.flash_agents.skill_category.enabled
                      ? "filterEnabled"
                      : "filterDisabled",
                  )}
                  statusActive={draftConfig.flash_agents.skill_category.enabled}
                  toggleLabel={$t("taskEnabled")}
                  bind:checked={draftConfig.flash_agents.skill_category.enabled}
                  ariaLabel={$t("skillCategoryAgentEnabled")}
                />
              </div>
              <details
                class="flash-task-custom"
                open={draftConfig.flash_agents.skill_category.prompt.trim().length > 0}
              >
                <summary>{$t("taskCustomPrompt")}</summary>
                <label class="detail-label">
                  <span class="sr-only">{$t("agentExtraPrompt")}</span>
                  <textarea
                    class="detail-input flash-task-textarea"
                    bind:value={draftConfig.flash_agents.skill_category.prompt}
                    placeholder={$t("skillCategoryAgentPromptPlaceholder")}></textarea>
                </label>
              </details>
            </article>

            <article class="flash-task-item">
              <div class="flash-task-heading">
                <div class="flash-task-copy">
                  <h5>{$t("hookAgent")}</h5>
                  <p>{$t("hookTaskDescription")}</p>
                </div>
                <SettingsStatusToggle
                  statusLabel={$t(
                    draftConfig.flash_agents.hook.enabled ? "filterEnabled" : "filterDisabled",
                  )}
                  statusActive={draftConfig.flash_agents.hook.enabled}
                  toggleLabel={$t("taskEnabled")}
                  bind:checked={draftConfig.flash_agents.hook.enabled}
                  ariaLabel={$t("hookAgentEnabled")}
                />
              </div>
              <details
                class="flash-task-custom"
                open={draftConfig.flash_agents.hook.prompt.trim().length > 0}
              >
                <summary>{$t("taskCustomPrompt")}</summary>
                <label class="detail-label">
                  <span class="sr-only">{$t("agentExtraPrompt")}</span>
                  <textarea
                    class="detail-input flash-task-textarea"
                    bind:value={draftConfig.flash_agents.hook.prompt}
                    placeholder={$t("hookAgentPromptPlaceholder")}></textarea>
                </label>
              </details>
            </article>

            <article class="flash-task-item">
              <div class="flash-task-heading">
                <div class="flash-task-copy">
                  <h5>{$t("autoApprovalTask")}</h5>
                  <p>{$t("autoApprovalTaskDescription")}</p>
                </div>
                <span
                  class:active={draftConfig.approval_mode === "auto"}
                  class="flash-task-mode-pill"
                >
                  <span aria-hidden="true"></span>
                  {$t(
                    draftConfig.approval_mode === "auto"
                      ? "filterEnabled"
                      : "managedByApprovalMode",
                  )}
                </span>
              </div>
              <details
                class="flash-task-custom"
                open={draftConfig.flash_agents.tool_approval.prompt.trim().length > 0}
              >
                <summary>{$t("taskCustomPrompt")}</summary>
                <label class="detail-label">
                  <span class="sr-only">{$t("agentExtraPrompt")}</span>
                  <textarea
                    class="detail-input flash-task-textarea"
                    bind:value={draftConfig.flash_agents.tool_approval.prompt}
                    placeholder={$t("terminalApprovalTaskPromptPlaceholder")}></textarea>
                </label>
              </details>
            </article>
          </div>
        </section>
      </div>
    </Tabs.Content>

    <Tabs.Content value="plugins" class="settings-tab-panel">
      <AgentPluginsSettings />
    </Tabs.Content>

    <Tabs.Content value="extensions" class="settings-tab-panel">
      <div class="settings-list-col">
        <div class="provider-list">
          {#if draftConfig.mcp.servers.length === 0}
            <div class="provider-list-empty">{$t("noMcpServers")}</div>
          {:else}
            {#each draftConfig.mcp.servers as server (server.id)}
              <ContextMenu.Root>
                <ContextMenu.Trigger>
                  <button
                    class="provider-item {selectedMcpId === server.id ? 'active' : ''}"
                    onclick={() => (selectedMcpId = server.id)}
                  >
                    <div class="provider-item-icon mcp-icon">M</div>
                    <div class="provider-item-info">
                      <span class="provider-item-name">{server.name || "Unnamed"}</span>
                      <span class="provider-item-url"
                        >{server.transport === "stdio"
                          ? server.command || $t("mcpCommandPlaceholder")
                          : server.url || $t("mcpServerUrlPlaceholder")}</span
                      >
                    </div>
                    <span
                      class:provider-enabled-dot={server.enabled}
                      class:provider-disabled-dot={!server.enabled}
                    ></span>
                  </button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content class="ctx-menu-content">
                    <ContextMenu.Item
                      class="ctx-menu-item ctx-menu-item-danger"
                      onclick={() => removeMcpServer(server.id)}
                    >
                      {$t("deleteNode")}
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            {/each}
          {/if}
        </div>
        <div class="list-footer">
          <button class="add-provider-btn" onclick={addMcpServer}>{$t("addMcpServer")}</button>
        </div>
      </div>

      {#if selectedMcpServer && selectedMcpIndex >= 0}
        {@const server = draftConfig.mcp.servers[selectedMcpIndex]}
        {@const status = mcpTestStatus[server.id]}
        <div class="settings-detail-col">
          <div class="detail-top-bar">
            <span class="detail-service-name">{server.name || "Unnamed Server"}</span>
            <SettingsStatusToggle
              statusLabel={server.enabled ? $t("filterEnabled") : $t("filterDisabled")}
              statusActive={server.enabled}
              toggleLabel={$t("mcpEnabled")}
              bind:checked={draftConfig.mcp.servers[selectedMcpIndex].enabled}
              disabled={status?.tone === "testing"}
              onCheckedChange={(checked) => setMcpEnabled(server.id, checked)}
              ariaLabel={$t("mcpEnabled")}
            />
          </div>
          <div class="detail-content">
            <section class="detail-section">
              <h4 class="detail-section-title">{$t("basicInfo")}</h4>
              <div class="detail-grid">
                <label class="detail-label">
                  <span class="label-text">{$t("mcpServerName")}</span>
                  <input
                    class="detail-input"
                    bind:value={draftConfig.mcp.servers[selectedMcpIndex].name}
                    placeholder="My MCP Server"
                  />
                </label>
              </div>
            </section>

            <section class="detail-section">
              <h4 class="detail-section-title">{$t("apiSettings")}</h4>
              <div class="detail-grid">
                <div class="detail-label">
                  <span class="label-text">{$t("mcpTransport")}</span>
                  <Select
                    bind:value={draftConfig.mcp.servers[selectedMcpIndex].transport}
                    items={[
                      { value: "http", label: $t("mcpTransportHttp") },
                      { value: "stdio", label: $t("mcpTransportStdio") },
                    ]}
                    ariaLabel={$t("mcpTransport")}
                  />
                </div>

                {#if server.transport === "http"}
                  <label class="detail-label">
                    <span class="label-text">{$t("mcpServerUrl")}</span>
                    <input
                      class="detail-input"
                      bind:value={draftConfig.mcp.servers[selectedMcpIndex].url}
                      placeholder={$t("mcpServerUrlPlaceholder")}
                    />
                  </label>
                  <label class="detail-label">
                    <span class="label-text">{$t("mcpBearerToken")}</span>
                    <input
                      type="password"
                      class="detail-input"
                      bind:value={draftConfig.mcp.servers[selectedMcpIndex].bearer_token}
                      placeholder={$t("mcpBearerTokenPlaceholder")}
                    />
                  </label>
                  <div class="detail-label" style="grid-column: 1 / -1">
                    <span class="label-text">{$t("mcpHeaders")}</span>
                    {#each Object.entries(draftConfig.mcp.servers[selectedMcpIndex].headers) as [k] (k)}
                      <div class="env-row">
                        <input
                          class="detail-input env-key"
                          value={k}
                          placeholder={$t("mcpHeaderKeyPlaceholder")}
                          onchange={(e) =>
                            updateHeaderKey(
                              selectedMcpIndex,
                              k,
                              (e.target as HTMLInputElement).value,
                            )}
                        />
                        <input
                          class="detail-input env-val"
                          bind:value={draftConfig.mcp.servers[selectedMcpIndex].headers[k]}
                          placeholder={$t("mcpHeaderValPlaceholder")}
                        />
                        <button
                          class="model-action-btn"
                          onclick={() => removeHeader(selectedMcpIndex, k)}>×</button
                        >
                      </div>
                    {/each}
                    <button
                      class="filter-toggle"
                      style="margin-top:6px"
                      onclick={() => addHeader(selectedMcpIndex)}
                    >
                      {$t("addHeader")}
                    </button>
                  </div>
                {:else}
                  <label class="detail-label">
                    <span class="label-text">{$t("mcpCommand")}</span>
                    <input
                      class="detail-input"
                      bind:value={draftConfig.mcp.servers[selectedMcpIndex].command}
                      placeholder={$t("mcpCommandPlaceholder")}
                    />
                  </label>
                  <label class="detail-label">
                    <span class="label-text">{$t("mcpArgs")}</span>
                    <input
                      class="detail-input"
                      value={draftConfig.mcp.servers[selectedMcpIndex].args.join(" ")}
                      placeholder={$t("mcpArgsPlaceholder")}
                      oninput={(e) => {
                        const v = (e.target as HTMLInputElement).value.trim();
                        draftConfig.mcp.servers[selectedMcpIndex].args = v ? v.split(/\s+/) : [];
                      }}
                    />
                  </label>

                  <div class="detail-label" style="grid-column: 1 / -1">
                    <span class="label-text">{$t("mcpEnvVars")}</span>
                    {#each Object.entries(draftConfig.mcp.servers[selectedMcpIndex].env) as [k] (k)}
                      <div class="env-row">
                        <input
                          class="detail-input env-key"
                          value={k}
                          placeholder={$t("mcpEnvKeyPlaceholder")}
                          onchange={(e) =>
                            updateEnvKey(selectedMcpIndex, k, (e.target as HTMLInputElement).value)}
                        />
                        <input
                          class="detail-input env-val"
                          bind:value={draftConfig.mcp.servers[selectedMcpIndex].env[k]}
                          placeholder={$t("mcpEnvValPlaceholder")}
                        />
                        <button
                          class="model-action-btn"
                          onclick={() => removeEnvVar(selectedMcpIndex, k)}>×</button
                        >
                      </div>
                    {/each}
                    <button
                      class="filter-toggle"
                      style="margin-top:6px"
                      onclick={() => addEnvVar(selectedMcpIndex)}
                    >
                      {$t("addEnvVar")}
                    </button>
                  </div>
                {/if}
              </div>

              <div class="key-input-row" style="margin-top:10px">
                <button
                  class="filter-toggle"
                  onclick={() => testMcpServer(server.id)}
                  disabled={status?.tone === "testing"}
                >
                  {status?.tone === "testing" ? $t("mcpTesting") : $t("testMcpServer")}
                </button>
              </div>
              {#if status && status.tone !== "idle"}
                <div
                  class="provider-status {status.tone === 'success'
                    ? 'success'
                    : status.tone === 'error'
                      ? 'error'
                      : 'loading'}"
                  style="margin-top:8px"
                >
                  {status.message}
                </div>
              {/if}
            </section>

            <section class="detail-section danger-zone">
              <p class="danger-title">{$t("deleteNode")}</p>
              <p class="danger-copy">{$t("deleteNodeDesc")}</p>
              <button class="filter-toggle danger-btn" onclick={() => removeMcpServer(server.id)}>
                {$t("deleteMcpServer")}
              </button>
            </section>
          </div>
        </div>
      {:else}
        <div class="settings-detail-col">
          <div class="extensions-placeholder">
            <span class="placeholder-icon">MCP</span>
            <p>{$t("noMcpServersHint")}</p>
          </div>
        </div>
      {/if}
    </Tabs.Content>

    <Tabs.Content value="about" class="settings-tab-panel">
      <div class="settings-content-col">
        <div class="about-content">
          <img class="about-logo-img" src="/app-icon.png" alt="OpenAgent" />
          <h3 class="about-app-name">OpenAgent</h3>
          <p class="about-version">{$t("aboutVersion")}</p>
          <p class="about-desc">{$t("aboutDesc")}</p>
          <a class="about-contact" href="mailto:iumm@ibat.ac.cn">iumm@ibat.ac.cn</a>
          <button
            class="btn-secondary btn-sm about-update-button"
            disabled={$appUpdateState !== "idle"}
            aria-busy={$appUpdateState === "checking"}
            onclick={() => checkForAppUpdate(true)}
          >
            {$appUpdateState === "checking" ? $t("checkingForUpdates") : $t("checkForUpdates")}
          </button>
        </div>
      </div>
    </Tabs.Content>
  </Tabs.Root>
</div>

<Dialog.Root
  bind:open={memoryClearDialogOpen}
  onOpenChange={(open) => {
    if (open) {
      memoryClearCloseHandled = false;
      return;
    }
    if (memoryClearCloseHandled || memoryBusy) {
      memoryClearCloseHandled = false;
      return;
    }
    cancelClearMemoryScope();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog">
      <Dialog.Title class="dialog-title">{$t("clearMemory")}</Dialog.Title>

      <p class="dialog-copy">{$t("memoryClearConfirm")}</p>
      <div class="confirm-token">{$t("memoryClearConfirmText")}</div>

      <label class="dialog-field" for="memory-clear-confirm-input">
        <span class="label-text">{$t("memoryClearTypePrompt")}</span>
        <input
          id="memory-clear-confirm-input"
          class="detail-input"
          autocomplete="off"
          bind:value={memoryClearInput}
          onkeydown={(e) => e.key === "Enter" && confirmClearMemoryScope()}
        />
      </label>

      <div class="dialog-actions">
        <button class="btn-secondary" onclick={cancelClearMemoryScope} disabled={memoryBusy}>
          {$t("cancel")}
        </button>
        <button
          class="btn-primary danger-primary"
          onclick={confirmClearMemoryScope}
          disabled={memoryBusy || memoryClearInput !== $t("memoryClearConfirmText")}
        >
          {$t("clearMemory")}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={modelConfigDialogOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog">
      <Dialog.Title class="dialog-title">{$t("modelConfiguration")}</Dialog.Title>

      <div class="model-config-fields">
        <label class="dialog-field" for="model-config-name">
          <span class="label-text">{$t("modelName")}</span>
          <input
            id="model-config-name"
            class="detail-input"
            autocomplete="off"
            bind:value={modelConfigName}
            onkeydown={(event) => event.key === "Enter" && saveModelConfig()}
          />
        </label>

        <label class="dialog-field" for="model-config-threshold">
          <span class="label-text">{$t("modelCompactionThreshold")}</span>
          <input
            id="model-config-threshold"
            class="detail-input"
            type="number"
            min="1000"
            max="1000000"
            step="1000"
            placeholder={`${draftConfig.context_compaction_threshold}`}
            bind:value={modelConfigThreshold}
            onkeydown={(event) => event.key === "Enter" && saveModelConfig()}
          />
          <span class="field-hint">
            {$t("modelCompactionThresholdHint")}
            {draftConfig.context_compaction_threshold}
          </span>
        </label>
      </div>

      {#if modelConfigValidationError()}
        <p class="dialog-error">{modelConfigValidationError()}</p>
      {/if}

      <div class="dialog-actions model-config-actions">
        <button class="danger-btn" onclick={deleteConfiguredModel}>
          {$t("deleteModel")}
        </button>
        <div class="dialog-actions-end">
          <button
            class="dialog-action-quiet"
            type="button"
            onclick={() => (modelConfigDialogOpen = false)}
          >
            {$t("cancel")}
          </button>
          <button
            class="btn-primary"
            onclick={saveModelConfig}
            disabled={Boolean(modelConfigValidationError())}
          >
            {$t("save")}
          </button>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .settings-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: var(--bg);
    height: 48px;
    flex-shrink: 0;
  }

  .settings-header-title,
  .detail-service-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .title-actions {
    display: flex;
    align-items: center;
    gap: 4px;
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

  :global(.settings-body) {
    display: flex;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  :global(.settings-nav-col) {
    width: 172px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-right: 0;
    padding: 12px 8px;
  }

  .settings-nav-items {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
  }

  .settings-nav-bottom {
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
    padding-top: 8px;
  }

  :global(.settings-nav-item) {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--list-item-compact-content-gap);
    width: 100%;
    height: var(--list-item-compact-height);
    background: none;
    border: none;
    border-radius: var(--list-item-compact-radius);
    padding: 4px var(--list-item-compact-padding-inline);
    font: inherit;
    font-size: var(--list-item-compact-font-size);
    line-height: var(--list-item-compact-line-height);
    color: var(--text-muted);
    cursor: pointer;
    text-align: left;
    transition:
      background 0.12s,
      color 0.12s;
  }

  :global(.settings-nav-item:hover:not([data-state="active"])) {
    background: var(--surface2);
    color: var(--text);
  }

  :global(.settings-nav-item[data-state="active"]) {
    background: var(--surface2);
    color: var(--text);
    font-weight: 500;
  }

  :global(.settings-nav-item[data-state="active"]::before) {
    content: "";
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    width: 2px;
    background: var(--primary);
    pointer-events: none;
  }

  :global(.settings-nav-item:focus-visible) {
    box-shadow: var(--focus-ring);
    outline: none;
  }

  :global(.settings-tab-panel) {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    outline: none;
  }

  .nav-icon {
    width: 16px;
    text-align: center;
  }

  .settings-list-col {
    width: 256px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-right: 0;
  }

  .list-search-bar,
  .list-footer {
    padding: 10px 8px;
  }

  .list-footer {
    margin-top: auto;
  }

  .list-toolbar {
    display: flex;
    gap: 8px;
  }

  .list-search-input,
  .detail-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--mica-surface);
    border: 1px solid var(--mica-border);
    border-radius: 6px;
    padding: 6px 12px;
    color: var(--text);
    font-size: 13px;
    outline: none;
    font-family: inherit;
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
    transition: box-shadow 0.2s;
  }

  .detail-hint {
    margin: 6px 4px 0;
    color: var(--text-muted, #888);
    font-size: 12px;
    line-height: 1.5;
  }

  .list-search-input:focus,
  .detail-input:focus {
    box-shadow: var(--mica-shadow), var(--focus-ring);
  }

  .filter-toggle,
  .add-provider-btn,
  .danger-btn {
    border: 0;
    background: var(--surface2);
    color: var(--text-muted);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: var(--control-shadow);
    transition:
      transform 0.1s,
      background 0.1s;
  }

  .model-action-btn {
    border: 1px solid var(--border);
    border-radius: 9999px;
    padding: 6px 14px;
    background: transparent;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition:
      transform 0.1s,
      background 0.1s;
  }
  .model-action-btn:hover {
    background: var(--surface2);
  }
  .model-action-btn:active,
  .filter-toggle:active {
    transform: scale(0.95);
  }

  .add-provider-btn {
    width: 100%;
    border-style: dashed;
  }

  .provider-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
    overflow-y: auto;
    padding: 6px;
  }

  .provider-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
    text-align: left;
  }

  .provider-item.active::before {
    content: "";
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    width: 2px;
    background: var(--primary);
    pointer-events: none;
  }

  .provider-item-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: #475569;
    font-weight: 700;
    flex-shrink: 0;
    background: var(--surface);
    box-shadow: var(--control-shadow);
  }

  .provider-item-icon img {
    display: block;
    width: 22px;
    height: 22px;
    object-fit: contain;
  }

  .mcp-icon {
    background: #6366f1;
    color: #fff;
  }

  .env-row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 4px;
  }

  .env-key {
    flex: 0 0 38%;
  }

  .env-val {
    flex: 1;
  }

  .provider-item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .provider-item-name {
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .provider-item-url {
    color: var(--text-muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .label-text,
  .base-url-preview,
  .danger-copy,
  .path-display {
    color: var(--text-muted);
    font-size: 12px;
  }

  .provider-enabled-dot,
  .provider-disabled-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .provider-enabled-dot {
    background: #22c55e;
  }

  .provider-disabled-dot {
    background: #94a3b8;
  }

  .settings-detail-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-top-bar {
    height: 48px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    background: var(--bg);
  }

  .detail-actions,
  .key-input-row,
  .path-picker-row,
  .memory-action-grid {
    display: flex;
    align-items: stretch;
    gap: 12px;
  }

  .memory-action-grid {
    flex-wrap: wrap;
  }

  .key-input-row .detail-input {
    flex: 1;
  }

  .toggle-row,
  .detail-label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 14px;
    margin-bottom: 2px;
  }

  .toggle-row {
    flex-direction: row;
    color: var(--text-muted);
    font-size: 12px;
  }

  .startup-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px;
    border: 1px solid var(--mica-border);
    border-radius: 10px;
    background: var(--mica-surface);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
  }

  .startup-copy {
    min-width: 0;
  }

  .startup-copy .detail-hint {
    margin-inline: 0;
  }

  .shortcut-setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 12px;
    border: 1px solid var(--mica-border);
    border-radius: 10px;
    background: var(--mica-surface);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
  }

  .shortcut-setting-copy {
    min-width: 0;
  }

  .shortcut-setting-copy .detail-hint {
    margin-left: 0;
  }

  .shortcut-setting-controls {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
  }

  .shortcut-recorder {
    display: inline-flex;
    min-width: 190px;
    height: 34px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--control-surface);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    outline: none;
    box-shadow: none;
  }

  .shortcut-recorder:hover,
  .shortcut-recorder:focus-visible,
  .shortcut-recorder.recording {
    border-color: var(--primary);
    box-shadow: none;
  }

  .shortcut-recorder.recording {
    color: var(--primary);
  }

  .shortcut-recorder svg {
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
    stroke: currentColor;
    stroke-width: 1.35;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .shortcut-reset {
    min-width: auto;
    padding: 6px 8px;
  }

  .shortcut-reset:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .shortcut-status {
    margin: 8px 4px 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  .shortcut-status.success {
    color: #15803d;
  }

  .shortcut-status.error {
    color: var(--danger);
  }

  .remote-gateway-heading {
    align-items: center;
  }

  .remote-gateway-subtitle {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  .remote-gateway-card,
  .remote-gateway-credentials {
    overflow: hidden;
    border: 1px solid var(--mica-border);
    border-radius: 10px;
    background: var(--mica-surface);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
  }

  .wechat-channel-access {
    display: grid;
    gap: 6px;
    padding: 14px 16px 16px;
    border-top: 0;
  }

  .wechat-user-ids {
    min-height: 76px;
    margin-top: 4px;
    resize: vertical;
  }

  .wechat-qr-card,
  .wechat-connected-card {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 12px;
    padding: 16px;
    border: 1px solid var(--mica-border);
    border-radius: 8px;
    background: var(--mica-surface);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
  }

  .wechat-qr-card img {
    width: 152px;
    height: 152px;
    padding: 8px;
    border-radius: 8px;
    background: #fff;
  }

  .wechat-qr-card strong {
    color: var(--text);
    font-size: 14px;
  }

  .wechat-connected-card > div {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .wechat-connected-card code {
    overflow: hidden;
    color: var(--text);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wechat-connected-card .remote-credential-action {
    margin-left: auto;
  }

  .remote-gateway-toggle-row {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 12px 16px;
  }

  .remote-gateway-workspace-row {
    border-top: 1px solid var(--border);
  }

  .remote-gateway-card > .remote-gateway-workspace-row:first-child {
    border-top: 0;
  }

  .remote-gateway-icon {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border-radius: 8px;
    background: var(--item-selected-bg);
    color: var(--primary);
  }

  .remote-gateway-icon.workspace {
    background: var(--item-selected-bg);
    color: var(--primary);
  }

  .remote-workspace-path {
    max-width: 520px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remote-gateway-credentials {
    margin-top: 12px;
  }

  .remote-credential-row {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 70px;
    padding: 12px 16px;
  }

  .remote-credential-row + .remote-credential-row {
    border-top: 1px solid var(--border);
  }

  .remote-credential-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .remote-credential-label {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
  }

  .remote-credential-copy code {
    overflow: hidden;
    color: var(--text);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remote-credential-row.pairing code {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: 0.16em;
  }

  .remote-credential-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .remote-credential-action {
    flex: 0 0 auto;
    min-width: 58px;
    padding: 6px 10px;
    border: 0;
    border-radius: 8px;
    background: var(--surface2);
    color: var(--text-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .remote-credential-row > .remote-credential-action {
    margin-left: auto;
  }

  .remote-credential-action:hover {
    color: var(--text);
  }

  .remote-credential-action.primary {
    border-radius: 9999px;
    background: var(--primary);
    color: white;
  }

  .remote-credential-action:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .remote-security-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 11px;
  }

  .remote-security-note span {
    color: var(--primary);
    font-size: 16px;
    line-height: 1;
  }

  .remote-security-note p {
    margin: 0;
  }

  .channel-settings-layout {
    display: grid;
    grid-template-columns: 256px minmax(0, 1fr);
    gap: 0;
    width: 100%;
    min-height: 100%;
    background: var(--bg);
  }

  .channel-settings-list {
    min-width: 0;
    padding: 6px;
    background: var(--bg);
  }

  .channel-settings-list-items {
    display: grid;
    gap: var(--list-item-stack-gap);
  }

  .channel-settings-item {
    position: relative;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 6px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s;
  }

  .channel-settings-item:hover {
    background: var(--bg);
  }

  .channel-settings-item.active {
    background: var(--bg);
    color: var(--text);
  }

  .channel-settings-item:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .channel-settings-item.active::before {
    position: absolute;
    inset: 4px auto 4px 0;
    width: 2px;
    background: var(--primary);
    content: "";
  }

  .channel-settings-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--control-shadow);
  }

  .channel-settings-icon img {
    display: block;
    width: 22px;
    height: 22px;
    object-fit: contain;
  }

  .channel-settings-icon.feishu img,
  .channel-settings-icon.telegram img,
  .channel-settings-icon.wechat img {
    width: 24px;
    height: 24px;
    border-radius: 6px;
  }

  .channel-settings-icon.gateway {
    background: var(--primary);
  }

  .channel-settings-icon.gateway img {
    width: 22px;
    height: 22px;
  }

  .channel-settings-item-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .channel-settings-item-copy strong,
  .channel-settings-item-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .channel-settings-item-copy strong {
    font-size: 13px;
    font-weight: 500;
  }
  .channel-settings-item-copy span {
    color: var(--text-muted);
    font-size: 12px;
  }

  .channel-settings-detail {
    min-width: 0;
    background: var(--bg);
  }

  .channel-config-card {
    display: grid;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--mica-border);
    border-radius: 10px;
    background: var(--mica-surface);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
  }

  .channel-config-card .detail-label {
    margin: 0;
  }
  .channel-allowlist {
    min-height: 76px;
    resize: vertical;
  }

  @media (max-width: 640px) {
    .channel-settings-layout {
      grid-template-columns: 1fr;
      gap: 18px;
    }
    .channel-settings-list {
      overflow-x: auto;
      padding: 6px;
    }
    .channel-settings-list-items {
      display: flex;
      min-width: max-content;
    }
    .channel-settings-item {
      width: 128px;
    }
    .channel-settings-item.active::before {
      inset: auto 12px 3px;
      width: auto;
      height: 2px;
    }

    .channel-settings-detail {
      padding: 24px 18px;
    }

    .channel-settings-detail .remote-gateway-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 14px;
    }

    .remote-gateway-toggle-row {
      grid-template-columns: 32px minmax(0, 1fr) auto;
      padding-inline: 12px;
    }

    .remote-gateway-icon {
      width: 32px;
      height: 32px;
    }

    .remote-credential-row {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .remote-credential-actions {
      width: 100%;
      margin-left: 0;
    }
  }

  .execution-settings {
    display: grid;
    gap: 12px;
  }

  .execution-setting {
    overflow: hidden;
    border: 1px solid var(--mica-border);
    border-radius: 10px;
    background: var(--mica-surface);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
  }

  .execution-toggle-row {
    border: 0;
    border-radius: 0;
    padding: 14px 16px;
    box-shadow: none;
  }

  .execution-value-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-height: 42px;
    padding: 8px 16px;
    border-top: 0;
    background: transparent;
  }

  .execution-value-row::before {
    position: absolute;
    top: 0;
    right: 0;
    left: 16px;
    height: 1px;
    background: var(--mica-divider);
    content: "";
  }

  .execution-number-input {
    width: 136px;
    flex: 0 0 136px;
    background: var(--mica-surface);
  }

  .compaction-threshold-input {
    width: 168px;
    max-width: 100%;
  }

  .detail-content,
  .settings-content-col {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 20px 24px;
  }

  .detail-content,
  .settings-content-col {
    padding-inline: max(24px, calc((100% - 680px) / 2));
  }

  .agents-settings-content {
    padding-inline: max(24px, calc((100% - 820px) / 2));
  }

  .agents-settings-intro {
    margin-bottom: 28px;
  }

  .agents-settings-intro h3 {
    margin: 0;
    color: var(--text);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.42px;
    line-height: 1.25;
  }

  .agents-settings-intro p {
    max-width: 640px;
    margin: 8px 0 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.55;
  }

  .detail-section {
    margin-bottom: 28px;
  }

  .detail-section-title {
    margin: 0 0 16px;
    color: var(--text);
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.37px;
  }

  .detail-section-intro {
    margin: -8px 0 14px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .settings-card {
    overflow: hidden;
    border: 1px solid var(--mica-border);
    border-radius: 10px;
    background: var(--mica-surface);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
  }

  .settings-card-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(210px, 248px);
    align-items: center;
    gap: 24px;
    min-height: 42px;
    padding: 14px 16px;
  }

  .settings-card-row + .settings-card-row {
    border-top: 0;
  }

  .settings-card-row + .settings-card-row::before {
    position: absolute;
    top: 0;
    right: 0;
    left: 16px;
    height: 1px;
    background: var(--mica-divider);
    content: "";
  }

  .settings-card-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .settings-card-copy .detail-hint {
    margin: 0;
  }

  .settings-card-row > .label-text,
  .settings-card-copy > .label-text {
    color: var(--text);
    font-weight: 550;
    line-height: 1.35;
  }

  .settings-card-control {
    min-width: 0;
  }

  .settings-card :global(.ui-select-trigger),
  .settings-card .detail-input {
    border: 1px solid var(--mica-divider);
    box-shadow: none;
  }

  .settings-card :global(.ui-select-trigger:focus-visible),
  .settings-card :global(.ui-select-trigger[data-state="open"]),
  .settings-card .detail-input:focus {
    border-color: var(--mica-divider);
    box-shadow: var(--focus-ring);
  }

  .detail-section-header,
  .danger-zone {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .detail-section-header .detail-section-title {
    margin: 0;
  }

  .flash-task-group {
    margin-bottom: 30px;
  }

  .flash-task-group-heading {
    margin: 0 4px 12px;
  }

  .flash-task-group-heading h4 {
    margin: 0;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.18px;
    line-height: 1.35;
  }

  .flash-task-group-heading p {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .flash-task-card {
    overflow: hidden;
    border: 1px solid var(--mica-border);
    border-radius: 10px;
    background: var(--mica-surface);
    box-shadow: var(--mica-shadow);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
  }

  .flash-task-item {
    position: relative;
    padding: 16px;
  }

  .flash-task-item + .flash-task-item::before {
    position: absolute;
    top: 0;
    right: 0;
    left: 16px;
    height: 1px;
    background: var(--mica-divider);
    content: "";
  }

  .flash-task-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
  }

  .flash-task-copy {
    min-width: 0;
    padding-top: 2px;
  }

  .flash-task-copy h5 {
    margin: 0;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
  }

  .flash-task-copy p,
  .flash-task-suboption p {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.55;
  }

  .flash-task-suboptions {
    margin: 16px 0 0;
    border-top: 1px solid var(--mica-divider);
  }

  .flash-task-suboption {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 12px 0 0;
  }

  .flash-task-suboption + .flash-task-suboption {
    margin-top: 12px;
    padding-top: 12px;
  }

  .flash-task-suboption + .flash-task-suboption::before {
    position: absolute;
    top: 0;
    right: 0;
    left: 16px;
    height: 1px;
    background: var(--mica-divider);
    content: "";
  }

  .flash-task-suboption > div {
    min-width: 0;
  }

  .flash-task-suboption h6 {
    margin: 0;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .flash-task-suboption :global(button) {
    flex: 0 0 auto;
  }

  .flash-task-inline-setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--mica-divider);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 550;
    line-height: 1.35;
  }

  .flash-task-inline-setting .detail-input {
    margin: 0;
    border-color: var(--mica-divider);
    box-shadow: none;
  }

  .flash-task-inline-setting .detail-input:focus {
    border-color: var(--mica-divider);
    box-shadow: var(--focus-ring);
  }

  .flash-task-custom {
    margin-top: 12px;
    padding-top: 11px;
    border-top: 1px solid var(--mica-divider);
  }

  .flash-task-custom summary {
    display: flex;
    align-items: center;
    width: fit-content;
    gap: 8px;
    border-radius: 5px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 550;
    line-height: 20px;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .flash-task-custom summary::-webkit-details-marker {
    display: none;
  }

  .flash-task-custom summary::after {
    width: 6px;
    height: 6px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    content: "";
    transform: rotate(45deg) translateY(-2px);
    transition: transform 120ms ease;
  }

  .flash-task-custom[open] summary::after {
    transform: rotate(225deg) translate(-1px, -1px);
  }

  .flash-task-custom summary:hover {
    color: var(--text);
  }

  .flash-task-custom summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .flash-task-custom .detail-label {
    margin: 12px 0 0;
  }

  .flash-task-textarea {
    min-height: 72px;
    resize: vertical;
    border-color: var(--mica-divider);
    box-shadow: none;
  }

  .flash-task-textarea:focus {
    border-color: var(--mica-divider);
    box-shadow: var(--focus-ring);
  }

  .flash-task-mode-pill {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    flex: 0 0 auto;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .flash-task-mode-pill.active {
    background: var(--item-selected-bg);
    color: var(--primary);
  }

  .flash-task-mode-pill > span {
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    margin: -1px;
    padding: 0;
    border: 0;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  @media (max-width: 1000px) {
    .flash-task-heading {
      align-items: stretch;
      flex-direction: column;
      gap: 12px;
    }

    .flash-task-mode-pill {
      align-self: flex-start;
    }
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .model-search-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--mica-surface);
    border: 1px solid var(--mica-border);
    border-radius: 6px;
    padding: 6px 12px;
    color: var(--text);
    font-size: 13px;
    outline: none;
    font-family: inherit;
    margin-bottom: 8px;
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
    transition: box-shadow 0.2s;
  }

  .model-search-input:focus {
    box-shadow: var(--mica-shadow), var(--focus-ring);
  }

  .manual-model-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .chatgpt-model-catalog-hint {
    margin: 0 0 12px;
    border-left: 3px solid var(--primary);
    border-radius: 0 9px 9px 0;
    padding: 9px 11px;
    background: var(--surface2);
    color: var(--text-muted, #888);
    font-size: 12px;
    line-height: 1.5;
  }

  .manual-model-row .model-search-input {
    min-width: 0;
    margin-bottom: 0;
  }

  .manual-model-row .btn-secondary {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .model-list-box {
    border: 1px solid var(--mica-border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--mica-surface);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
  }

  .model-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 0;
  }

  .model-item + .model-item::before {
    position: absolute;
    top: 0;
    right: 0;
    left: 16px;
    height: 1px;
    background: var(--mica-divider);
    content: "";
  }

  .hook-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .hook-item:last-child {
    border-bottom: none;
  }

  .hook-main {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .hook-actions {
    display: flex;
    flex-shrink: 0;
    align-self: flex-start;
    gap: 6px;
  }

  .hook-conversations {
    margin-top: 9px;
    padding-top: 9px;
    border-top: 1px solid var(--border);
  }

  .hook-conversations-title {
    margin-bottom: 5px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  .hook-conversations-scroll {
    max-height: 152px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .hook-conversation-link {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .hook-conversation-link:hover {
    background: var(--surface2);
  }

  .hook-conversation-link:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .hook-conversation-link span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hook-conversation-link time {
    color: var(--text-secondary);
    font-size: 11px;
    white-space: nowrap;
  }

  .hook-textarea {
    min-height: 84px;
    resize: vertical;
  }

  .model-name {
    font-family: inherit;
    font-size: 14px;
    color: var(--text);
  }

  .model-main {
    min-width: 0;
    flex: 1;
  }

  .model-item-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .retry-queue-list {
    margin-top: 8px;
  }

  .retry-queue-fields {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(120px, 0.8fr) minmax(140px, 1.2fr);
    gap: 8px;
  }

  .retry-queue-item {
    padding-left: 8px;
  }

  .retry-queue-dragging {
    opacity: 0.55;
  }

  .retry-queue-drag-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 32px;
    flex: 0 0 auto;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: grab;
    font-size: 20px;
    line-height: 1;
  }

  .retry-queue-drag-handle:active {
    cursor: grabbing;
  }

  .retry-queue-drag-handle:hover,
  .retry-queue-drag-handle:focus-visible {
    background: var(--surface2);
    color: var(--text);
    outline: none;
  }

  .retry-queue-drag-handle:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .model-list-empty,
  .provider-list-empty {
    padding: 24px;
    color: var(--text-muted);
    font-size: 13px;
    text-align: center;
  }

  .provider-status,
  .danger-zone {
    border-radius: 10px;
    padding: 12px;
    background: var(--surface2);
  }

  .provider-status.success {
    color: #15803d;
  }

  .provider-status.error {
    color: #dc2626;
  }

  .provider-status.loading {
    color: #2563eb;
  }

  .dialog-copy {
    color: var(--text);
    font-size: 13px;
    line-height: 1.5;
    margin: 0 0 12px;
  }

  .confirm-token {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border: 1px solid rgba(239, 68, 68, 0.28);
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.06);
    color: #dc2626;
    font-size: 13px;
    font-weight: 600;
    padding: 4px 10px;
    margin-bottom: 16px;
  }

  .dialog-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .model-config-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field-hint {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.4;
  }

  .dialog-error {
    margin: 12px 0 0;
    color: #dc2626;
    font-size: 12px;
  }

  :global(.dialog-actions.model-config-actions) {
    justify-content: space-between;
  }

  .dialog-actions-end {
    display: flex;
    gap: 8px;
  }

  :global(.btn-primary.danger-primary) {
    background: var(--danger);
  }

  :global(.btn-primary.danger-primary:hover) {
    background: color-mix(in srgb, var(--danger) 82%, var(--text));
  }

  .danger-zone {
    border: 1px solid color-mix(in srgb, var(--danger) 10%, var(--mica-border));
    background: color-mix(in srgb, var(--danger) 6%, var(--mica-surface));
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
  }

  .danger-title,
  .content-col-title,
  .about-app-name {
    color: var(--text);
    font-weight: 600;
  }

  .danger-btn {
    color: var(--danger);
  }

  .content-col-title {
    margin: 0 0 24px;
    font-size: 18px;
  }

  .content-col-actions {
    display: flex;
    justify-content: flex-end;
  }

  .extensions-placeholder,
  .about-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 24px;
    text-align: center;
    color: var(--text-muted);
  }

  .about-contact {
    font-size: 13px;
    color: var(--primary);
    text-decoration: none;
  }

  .about-contact:hover {
    text-decoration: underline;
  }

  .about-update-button {
    margin-top: 8px;
  }

  .about-update-button:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .about-logo-img {
    width: 64px;
    height: 64px;
    border-radius: 14px;
  }

  :global(.scheduled-role-select-content .ui-select-item-description) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .execution-setting .detail-input,
  .channel-config-card .detail-input,
  .remote-gateway-card .detail-input,
  .channel-config-card :global(.ui-select-trigger),
  .remote-gateway-card :global(.ui-select-trigger),
  .remote-gateway-credentials :global(.ui-select-trigger) {
    border: 1px solid var(--mica-divider);
    box-shadow: none;
  }

  .execution-setting .detail-input:focus,
  .channel-config-card .detail-input:focus,
  .remote-gateway-card .detail-input:focus,
  .channel-config-card :global(.ui-select-trigger:focus-visible),
  .channel-config-card :global(.ui-select-trigger[data-state="open"]),
  .remote-gateway-card :global(.ui-select-trigger:focus-visible),
  .remote-gateway-card :global(.ui-select-trigger[data-state="open"]),
  .remote-gateway-credentials :global(.ui-select-trigger:focus-visible),
  .remote-gateway-credentials :global(.ui-select-trigger[data-state="open"]) {
    border-color: var(--mica-divider);
    box-shadow: var(--focus-ring);
  }

  @media (max-width: 640px) {
    .settings-card-row {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .agents-settings-content {
      padding-inline: 18px;
    }

    .flash-task-inline-setting {
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
    }

    .flash-task-inline-setting .detail-input {
      width: 100%;
    }
  }
</style>
