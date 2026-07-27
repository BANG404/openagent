<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
  import { onMount, untrack } from "svelte";
  import { ContextMenu, Dialog, Tabs } from "bits-ui";
  import type { AgentRole, AppConfig, McpServerConfig, ProviderConfig } from "$lib/types";
  import { normalizeConfigShape } from "$lib/config";
  import { checkForAppUpdate } from "$lib/appUpdater";
  import { t, tr, setLocale, type Locale } from "$lib/i18n";
  import WindowControls from "./WindowControls.svelte";
  import Tooltip from "./Tooltip.svelte";
  import Select from "./ui/Select.svelte";
  import Switch from "./ui/Switch.svelte";
  import Combobox from "./ui/Combobox.svelte";

  type SettingsNav = "general" | "providers" | "defaults" | "agents" | "memory" | "websearch" | "hooks" | "extensions" | "about";
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
    pairing_code: string;
  };
  const approvalModeDescriptionKey = {
    manual: "approvalModeManualDescription",
    auto: "approvalModeAutoDescription",
    off: "approvalModeOffDescription",
    sandbox: "approvalModeSandboxDescription",
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
  };
  type RetryQueueKind = "chat_queue" | "flash_queue";

  let {
    config,
    workspacePath,
    isMemorySyncing,
    initialNav,
    onSave,
    onClose,
    onPickWorkspace,
    winMinimize,
    winMaximize,
    winClose,
  }: {
    config: AppConfig | null;
    workspacePath: string;
    isMemorySyncing: boolean;
    initialNav?: SettingsNav;
    onSave: (config: AppConfig) => Promise<void>;
    onClose: () => void;
    onPickWorkspace: () => Promise<void>;
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
      tool_approval: { enabled: true, prompt: "" },
    },
    approval_mode: "sandbox",
    mcp: { servers: [] },
    theme: "system",
    language: "zh",
    launch_on_startup: false,
    mention_palette_show_global_drafts: true,
    workspace_open_mode: "ask",
    agent_turn_limit_enabled: false,
    agent_max_turns: 10,
    context_compaction_enabled: true,
    context_compaction_threshold: 24000,
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
      allowed_workspaces: [],
    },
  };

  let settingsNav = $state<SettingsNav>(untrack(() => initialNav) ?? "providers");
  // Allow actions outside the settings view (such as New Conversation) to
  // direct an already-open settings panel to the relevant section.
  $effect(() => {
    if (initialNav) settingsNav = initialNav;
  });
  let selectedProviderId = $state("default");
  let providerSearch = $state("");
  let providerFilter = $state<"all" | "enabled" | "disabled">("all");
  let modelSearch = $state("");
  let providerStatus = $state<Record<string, ProviderStatus>>({});
  let modelLoading = $state<Record<string, boolean>>({});

  type McpTestStatus = { tone: "idle" | "testing" | "success" | "error"; message: string };
  let mcpTestStatus = $state<Record<string, McpTestStatus>>({});
  let selectedMcpId = $state<string | null>(null);
  let scheduledHooks = $state<ScheduledChatHook[]>([]);
  let hookMessage = $state("");
  let hookMode = $state<"delay" | "run_at" | "interval_minutes" | "daily" | "weekdays" | "weekly">("delay");
  let hookDelayMinutes = $state(10);
  let hookRunAt = $state("");
  let hookTimeOfDay = $state("09:00");
  let hookIntervalMinutes = $state(60);
  let hookWeekdays = $state("mon,wed,fri");
  let hookRoleKey = $state("openagent");
  let hookRoles = $state<AgentRole[]>([]);
  let hookStatus = $state("");
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
  let copiedRemoteValue = $state<"url" | "code" | null>(null);
  let remoteCopyTimer: ReturnType<typeof setTimeout> | null = null;
  let draggedRetryQueue = $state<{ kind: RetryQueueKind; index: number } | null>(null);
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveInitialized = false;
  let pendingSave: Promise<void> = Promise.resolve();
  const providerConnectionFingerprints = new Map<string, string>();
  const mcpConnectionFingerprints = new Map<string, string>();

  let draftConfig = $state<AppConfig>(normalizeConfigShape(untrack(() => config) ?? fallbackConfig));
  // The page normally waits for settings to load before mounting this view.
  // Keep this guard as a second line of defence: a view initially mounted with
  // `config === null` must never autosave the empty fallback over providers.
  let initializedFromConfig = $state(false);
  ensureSelectedProvider();

  $effect(() => {
    if (initializedFromConfig || !config) return;
    draftConfig = normalizeConfigShape(config);
    ensureSelectedProvider();
    initializedFromConfig = true;
  });

  function snapshotDraftConfig() {
    const snapshot = $state.snapshot(draftConfig) as AppConfig;
    const fallbackId = snapshot.providers[0]?.id ?? "";
    if (!snapshot.defaults.chat_model.provider_id) snapshot.defaults.chat_model.provider_id = fallbackId;
    if (!snapshot.defaults.flash_model.provider_id) snapshot.defaults.flash_model.provider_id = fallbackId;
    return snapshot;
  }

  function saveDraftConfig() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (!initializedFromConfig) return Promise.resolve();
    const snapshot = snapshotDraftConfig();
    pendingSave = pendingSave
      .catch(() => {})
      .then(() => onSave(snapshot));
    return pendingSave;
  }

  $effect(() => {
    JSON.stringify(draftConfig);
    if (!autoSaveInitialized) {
      autoSaveInitialized = true;
      return;
    }
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveDraftConfig().catch(console.error), 600);
  });

  function providerConnectionFingerprint(provider: ProviderConfig) {
    return JSON.stringify([provider.provider, provider.api_key, provider.base_url]);
  }

  function mcpConnectionFingerprint(server: McpServerConfig) {
    const sortedEntries = (record: Record<string, string>) =>
      Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
    return JSON.stringify([
      server.transport,
      server.url,
      server.bearer_token,
      sortedEntries(server.headers),
      server.command,
      server.args,
      sortedEntries(server.env),
    ]);
  }

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
    refreshHooks().catch(() => {});
    refreshHookRoles().catch(() => {});
    refreshRemoteGateway().catch(() => {});
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
      if (remoteCopyTimer) clearTimeout(remoteCopyTimer);
      saveDraftConfig().catch(console.error);
    };
  });

  async function refreshRemoteGateway() {
    remoteGatewayStatus = await invoke<RemoteGatewayStatus>("get_remote_gateway_status");
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

  async function copyRemoteGatewayValue(value: string, kind: "url" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      copiedRemoteValue = kind;
      if (remoteCopyTimer) clearTimeout(remoteCopyTimer);
      remoteCopyTimer = setTimeout(() => { copiedRemoteValue = null; }, 1800);
    } catch (error) {
      remoteGatewayMessage = `${error}`;
    }
  }

  let filteredProviders = $derived.by(() => {
    const query = providerSearch.trim().toLowerCase();
    return draftConfig.providers.filter((provider) => {
      const matchesQuery = !query
        || provider.name.toLowerCase().includes(query)
        || provider.provider.toLowerCase().includes(query)
        || provider.base_url.toLowerCase().includes(query)
        || provider.models.some((model) => model.toLowerCase().includes(query));
      const matchesFilter = providerFilter === "all"
        || (providerFilter === "enabled" && provider.enabled)
        || (providerFilter === "disabled" && !provider.enabled);
      return matchesQuery && matchesFilter;
    });
  });

  let filteredModels = $derived.by(() => {
    const query = modelSearch.trim().toLowerCase();
    const models = draftConfig.providers.find((p) => p.id === selectedProviderId)?.models ?? [];
    return query ? models.filter((m) => m.toLowerCase().includes(query)) : models;
  });

  let selectedProviderIndex = $derived(
    draftConfig.providers.findIndex((provider) => provider.id === selectedProviderId)
  );

  let selectedProvider = $derived(
    selectedProviderIndex >= 0 ? draftConfig.providers[selectedProviderIndex] : null
  );

  function ensureSelectedProvider() {
    if (draftConfig.providers.some((provider) => provider.id === selectedProviderId)) return;
    selectedProviderId = draftConfig.providers[0]?.id ?? "";
  }

  function normalizeDraftDefaults() {
    ensureSelectedProvider();
    const fallbackProviderId = draftConfig.providers[0]?.id ?? "";
    if (!draftConfig.defaults.chat_model.provider_id) {
      draftConfig.defaults.chat_model.provider_id = fallbackProviderId;
    }
    if (!draftConfig.defaults.flash_model.provider_id) {
      draftConfig.defaults.flash_model.provider_id = fallbackProviderId;
    }
  }

  function createProvider(provider: ProviderConfig["provider"] = "openai"): ProviderConfig {
    return {
      id: crypto.randomUUID(),
      name: provider === "anthropic" ? "Anthropic Node" : "OpenAI Compatible Node",
      provider,
      api_key: "",
      base_url: "",
      enabled: false,
      models: [],
      model_context_compaction_thresholds: {},
    };
  }

  function addProvider() {
    const provider = createProvider();
    draftConfig.providers = [...draftConfig.providers, provider];
    selectedProviderId = provider.id;
  }

  $effect(() => {
    setLocale((draftConfig.language ?? 'zh') as Locale);
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
    } catch (err: any) {
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
    if (provider.provider === "anthropic") return provider.base_url || "api.anthropic.com";
    return provider.base_url || "Custom endpoint";
  }

  function getProviderPreviewUrl(provider: ProviderConfig) {
    const trimmed = provider.base_url.trim().replace(/\/$/, "");
    if (provider.provider === "anthropic") return "https://api.anthropic.com/v1/messages";
    if (!trimmed) return "https://api.openai.com/v1/chat/completions";
    if (trimmed.endsWith("/chat/completions")) return trimmed;
    if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
    return `${trimmed}/v1/chat/completions`;
  }

  function getStatus(id: string): ProviderStatus {
    return providerStatus[id] ?? { tone: "idle", message: "" };
  }

  async function testProvider(id: string) {
    const provider = draftConfig.providers.find((item) => item.id === id);
    if (!provider) return;
    providerStatus = { ...providerStatus, [id]: { tone: "loading", message: $t('checkingConnection') } };

    try {
      const result = await invoke<ProviderProbeResult>("test_provider_connection", {
        request: { provider: $state.snapshot(provider) },
      });
      replaceProviderModels(provider, Array.from(new Set(result.models)).sort());
      if (provider.models.length === 0 && provider.enabled) {
        provider.enabled = false;
        repairDefaultModelBindings();
      }
      providerStatus = {
        ...providerStatus,
        [id]: {
          tone: result.ok ? "success" : "error",
          message: `${result.message}${result.models.length ? ` 路 ${result.models.length} models` : ""}`,
        },
      };
    } catch (err: any) {
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
      replaceProviderModels(
        provider,
        Array.from(new Set(models.map((model) => model.trim()).filter(Boolean))).sort(),
      );
      if (provider.models.length === 0) {
        provider.enabled = false;
        repairDefaultModelBindings();
        throw new Error($t("providerNoModelsReturned"));
      }
      providerStatus = {
        ...providerStatus,
        [id]: { tone: "success", message: `Loaded ${provider.models.length} models` },
      };
    } catch (err: any) {
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
    providerStatus = { ...providerStatus, [id]: { tone: "loading", message: $t("checkingConnection") } };
    try {
      const models = await invoke<string[]>("fetch_provider_models", {
        request: { provider: $state.snapshot(provider) },
      });
      const normalizedModels = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean))).sort();
      if (normalizedModels.length === 0) {
        throw new Error($t("providerNoModelsReturned"));
      }
      replaceProviderModels(provider, normalizedModels);
      provider.enabled = true;
      repairDefaultModelBindings();
      providerStatus = {
        ...providerStatus,
        [id]: { tone: "success", message: `${$t("providerEnabledWithModels")} ${normalizedModels.length}` },
      };
    } catch (err: any) {
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

  function replaceProviderModels(provider: ProviderConfig, models: string[]) {
    provider.models = models;
    provider.model_context_compaction_thresholds = Object.fromEntries(
      Object.entries(provider.model_context_compaction_thresholds ?? {})
        .filter(([model]) => models.includes(model)),
    );
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
      provider.models = provider.models.map((model) => model === previousName ? nextName : model);
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
      .map((provider) => ({ value: provider.id, label: provider.name }));
  }

  function repairDefaultModelBindings() {
    const fallback = draftConfig.providers
      .filter((provider) => provider.enabled)
      .find((provider) => provider.models.length > 0);
    for (const kind of ["chat_model", "flash_model"] as const) {
      const binding = draftConfig.defaults[kind];
      const provider = draftConfig.providers.find((item) => item.id === binding.provider_id);
      if (!provider?.enabled || !provider.models.includes(binding.model)) {
        binding.provider_id = fallback?.id ?? "";
        binding.model = fallback?.models[0] ?? "";
      }
    }
    draftConfig.model_retry.chat_queue = draftConfig.model_retry.chat_queue.filter((binding) => {
      const provider = draftConfig.providers.find((item) => item.id === binding.provider_id);
      return provider?.enabled && provider.models.includes(binding.model);
    });
    draftConfig.model_retry.flash_queue = draftConfig.model_retry.flash_queue.filter((binding) => {
      const provider = draftConfig.providers.find((item) => item.id === binding.provider_id);
      return provider?.enabled && provider.models.includes(binding.model);
    });
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

  function removeRetryQueueModel(kind: RetryQueueKind, index: number) {
    draftConfig.model_retry[kind] = draftConfig.model_retry[kind].filter((_, itemIndex) => itemIndex !== index);
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
    const notReady =
      server.transport === "http" ? !server.url.trim() : !server.command.trim();
    if (notReady) return;
    mcpTestStatus = { ...mcpTestStatus, [id]: { tone: "testing", message: $t("mcpTesting") } };
    try {
      const result = await invoke<McpProbeResult>("test_mcp_server", { server: $state.snapshot(server) });
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: {
          tone: "success",
          message: `${result.tools.length} ${$t("mcpToolCount")}, ${result.resources.length} ${$t("mcpResourceCount")}`,
        },
      };
    } catch (err: any) {
      mcpTestStatus = { ...mcpTestStatus, [id]: { tone: "error", message: `${$t("mcpTestFailed")}: ${err}` } };
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
      const result = await invoke<McpProbeResult>("test_mcp_server", { server: $state.snapshot(server) });
      server.enabled = true;
      mcpTestStatus = {
        ...mcpTestStatus,
        [id]: {
          tone: "success",
          message: `${result.tools.length} ${$t("mcpToolCount")}, ${result.resources.length} ${$t("mcpResourceCount")}`,
        },
      };
    } catch (err: any) {
      server.enabled = false;
      mcpTestStatus = { ...mcpTestStatus, [id]: { tone: "error", message: `${$t("mcpTestFailed")}: ${err}` } };
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
    draftConfig.mcp.servers.find((s) => s.id === selectedMcpId) ?? null
  );
  let selectedMcpIndex = $derived(
    draftConfig.mcp.servers.findIndex((s) => s.id === selectedMcpId)
  );

  async function refreshHooks() {
    scheduledHooks = await invoke<ScheduledChatHook[]>("list_scheduled_chat_hooks");
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
    await refreshHooks();
  }

  async function createHook() {
    const message = hookMessage.trim();
    if (!message) {
      hookStatus = tr("hookMessageRequired");
      return;
    }
    const args: Record<string, unknown> = { message };
    if (hookRoleKey !== "openagent") args.role_id = hookRoleKey;
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
      args.weekdays = hookWeekdays.split(",").map((d) => d.trim()).filter(Boolean);
    }
    try {
      hookStatus = await invoke<string>("schedule_chat_hook", { args });
      hookMessage = "";
      await refreshHooks();
    } catch (err: any) {
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
    } catch (err: any) {
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
      const result = await invoke<{ user_memory_imported: boolean; agent_memories_imported: number }>(
        "import_memory_backup",
        { scope: memoryScope, content, replace }
      );
      memoryStatus = `${tr("memoryImported")} ${result.agent_memories_imported} ${tr("memoryAgentEntries")}`;
    } catch (err: any) {
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
    } catch (err: any) {
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

<div class="settings-panel">
  <div class="settings-header" data-tauri-drag-region>
    <span class="settings-header-title">{$t('settingsTitle')}</span>
    <div class="title-actions">
      {#if isMemorySyncing}
        <Tooltip text="Memory syncing">
          <span class="sync-dot">*</span>
        </Tooltip>
      {/if}
      <WindowControls onMinimize={winMinimize} onMaximize={winMaximize} onClose={winClose} />
    </div>
  </div>

  <Tabs.Root
    value={settingsNav}
    onValueChange={(v) => (settingsNav = v as SettingsNav)}
    orientation="vertical"
    activationMode="manual"
    class="settings-body"
  >
    <Tabs.List class="settings-nav-col">
      <div class="settings-nav-items">
        <Tabs.Trigger value="general" class="settings-nav-item">
          <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="2.4" />
            <path d="M8 1.8v1.4M8 12.8v1.4M3.6 3.6l1 1M11.4 11.4l1 1M1.8 8h1.4M12.8 8h1.4M3.6 12.4l1-1M11.4 4.6l1-1" />
          </svg>
          {$t('general')}
        </Tabs.Trigger>
        <Tabs.Trigger value="providers" class="settings-nav-item">
          <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2.5" y="3" width="11" height="3.5" rx="1" />
            <rect x="2.5" y="9.5" width="11" height="3.5" rx="1" />
            <path d="M5 4.75h.01M5 11.25h.01M8 6.5v3" />
          </svg>
          {$t('providers')}
        </Tabs.Trigger>
        <Tabs.Trigger value="defaults" class="settings-nav-item">
          <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 2.2l1.7 3.5 3.8.6-2.8 2.7.7 3.8L8 11l-3.4 1.8.7-3.8-2.8-2.7 3.8-.6L8 2.2z" />
          </svg>
          {$t('defaultModels')}
        </Tabs.Trigger>
        <Tabs.Trigger value="agents" class="settings-nav-item">
          <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4.2 4.2h7.6v5.2H8.7L6 12v-2.6H4.2z" />
            <path d="M6 6.2h4M6 8h2.6" />
          </svg>
          {$t('flashAgents')}
        </Tabs.Trigger>
        <Tabs.Trigger value="memory" class="settings-nav-item">
          <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <ellipse cx="8" cy="3.5" rx="5" ry="1.8" />
            <path d="M3 3.5v6.8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V3.5" />
            <path d="M3 7c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" />
          </svg>
          {$t('memoryManagement')}
        </Tabs.Trigger>
        <Tabs.Trigger value="websearch" class="settings-nav-item">
          <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3.2 3.2" />
          </svg>
          {$t('webSearch')}
        </Tabs.Trigger>
        <Tabs.Trigger value="extensions" class="settings-nav-item">
          <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v2.8a3.5 3.5 0 0 1-7 0V5.5zM8 11.8v1.7" />
          </svg>
          {$t('extensions')}
        </Tabs.Trigger>
        <Tabs.Trigger value="hooks" class="settings-nav-item">
          <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" />
            <path d="M8 4.8V8l2.2 1.4" />
          </svg>
          {$t('hooks')}
        </Tabs.Trigger>
      </div>
      <div class="settings-nav-bottom">
        <Tabs.Trigger value="about" class="settings-nav-item">
          <svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" />
            <path d="M8 7.5v3.2M8 5.2h.01" />
          </svg>
          {$t('about')}
        </Tabs.Trigger>
      </div>
    </Tabs.List>

    <Tabs.Content value="general" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('appearance')}</h4>
          <div class="detail-label">
            <span class="label-text">{$t('theme')}</span>
            <Select
              bind:value={draftConfig.theme}
              items={[
                { value: 'system', label: $t('themeSystem') },
                { value: 'light', label: $t('themeLight') },
                { value: 'dark', label: $t('themeDark') },
              ]}
              ariaLabel={$t('theme')}
            />
          </div>
          <div class="detail-label">
            <span class="label-text">{$t('language')}</span>
            <Select
              bind:value={draftConfig.language}
              items={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
              ]}
              ariaLabel={$t('language')}
            />
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('workspaceBehavior')}</h4>
          <div class="detail-label">
            <span class="label-text">{$t('workspaceSelectionBehavior')}</span>
            <Select
              bind:value={draftConfig.workspace_open_mode}
              items={[
                { value: 'ask', label: $t('workspaceOpenAsk') },
                { value: 'new_window', label: $t('workspaceOpenNewWindow') },
                { value: 'current_window', label: $t('workspaceOpenCurrentWindow') },
              ]}
              ariaLabel={$t('workspaceSelectionBehavior')}
            />
          </div>
          <p class="detail-hint">{$t('workspaceSelectionBehaviorHint')}</p>
        </section>
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t('remoteGateway')}</h4>
              <p class="remote-gateway-subtitle">{$t('remoteGatewaySubtitle')}</p>
            </div>
            <span class:active={draftConfig.remote_gateway.enabled} class="remote-gateway-status">
              <span></span>{draftConfig.remote_gateway.enabled ? $t('remoteGatewayRunning') : $t('remoteGatewayStopped')}
            </span>
          </div>
          <div class="remote-gateway-card">
            <div class="remote-gateway-toggle-row">
              <div class="remote-gateway-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              </div>
              <div class="startup-copy">
                <span class="label-text">{$t('remoteGatewayEnabled')}</span>
                <p class="detail-hint">{$t('remoteGatewayHint')}</p>
              </div>
              <Switch bind:checked={draftConfig.remote_gateway.enabled} ariaLabel={$t('remoteGatewayEnabled')} />
            </div>
            <div class="remote-gateway-toggle-row remote-gateway-workspace-row">
              <div class="remote-gateway-icon workspace" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>
              </div>
              <div class="startup-copy">
                <span class="label-text">{$t('remoteGatewayCurrentWorkspace')}</span>
                <p class="detail-hint remote-workspace-path">{workspacePath || $t('noWorkspace')}</p>
              </div>
              <Switch checked={Boolean(workspacePath) && draftConfig.remote_gateway.allowed_workspaces.includes(workspacePath)} disabled={!workspacePath} onCheckedChange={toggleCurrentWorkspaceAccess} ariaLabel={$t('remoteGatewayCurrentWorkspace')} />
            </div>
          </div>
          {#if draftConfig.remote_gateway.enabled && remoteGatewayStatus}
            <div class="remote-gateway-credentials">
              <div class="remote-credential-row">
                <div class="remote-credential-copy">
                  <span class="remote-credential-label">{$t('remoteGatewayLocalUrl')}</span>
                  <code>{remoteGatewayStatus.url}</code>
                </div>
                <button class="remote-credential-action" onclick={() => copyRemoteGatewayValue(remoteGatewayStatus?.url ?? "", "url")}>
                  {copiedRemoteValue === 'url' ? $t('remoteGatewayCopied') : $t('copy')}
                </button>
              </div>
              <div class="remote-credential-row pairing">
                <div class="remote-credential-copy">
                  <span class="remote-credential-label">{$t('remoteGatewayPairingCode')}</span>
                  <code>{remoteGatewayStatus.pairing_code}</code>
                </div>
                <div class="remote-credential-actions">
                  <button class="remote-credential-action" onclick={() => copyRemoteGatewayValue(remoteGatewayStatus?.pairing_code ?? "", "code")}>{copiedRemoteValue === 'code' ? $t('remoteGatewayCopied') : $t('copy')}</button>
                  <button class="remote-credential-action primary" disabled={remoteGatewayBusy} onclick={rotateRemotePairingCode}>{$t('remoteGatewayRotate')}</button>
                </div>
              </div>
              <div class="remote-security-note"><span aria-hidden="true">⌁</span><p>{$t('remoteGatewayProxyHint')}</p></div>
            </div>
          {/if}
          {#if remoteGatewayMessage}
            <div class="provider-status" style="margin-top:8px">{remoteGatewayMessage}</div>
          {/if}
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('approvalMode')}</h4>
          <div class="detail-label">
            <Select
              bind:value={draftConfig.approval_mode}
              items={[
                {
                  value: 'manual',
                  label: $t('approvalModeManual'),
                  description: $t('approvalModeManualDescription'),
                },
                {
                  value: 'auto',
                  label: $t('approvalModeAuto'),
                  description: $t('approvalModeAutoDescription'),
                },
                {
                  value: 'off',
                  label: $t('approvalModeOff'),
                  description: $t('approvalModeOffDescription'),
                },
                {
                  value: 'sandbox',
                  label: $t('approvalModeSandbox'),
                  description: $t('approvalModeSandboxDescription'),
                },
              ]}
              ariaLabel={$t('approvalMode')}
            />
          </div>
          <p class="detail-hint">{$t(approvalModeDescriptionKey[draftConfig.approval_mode])}</p>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('startup')}</h4>
          <div class="startup-row">
            <div class="startup-copy">
              <span class="label-text">{$t('launchOnStartup')}</span>
              <p class="detail-hint">{$t('launchOnStartupHint')}</p>
            </div>
            <Switch
              bind:checked={draftConfig.launch_on_startup}
              disabled={!autostartReady || autostartSyncing}
              ariaLabel={$t('launchOnStartup')}
            />
          </div>
          {#if autostartStatus}
            <div class="provider-status error" style="margin-top:8px">{autostartStatus}</div>
          {/if}
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('mentionPalette')}</h4>
          <div class="startup-row">
            <div class="startup-copy">
              <span class="label-text">{$t('showGlobalDraftsInMentions')}</span>
              <p class="detail-hint">{$t('showGlobalDraftsInMentionsHint')}</p>
            </div>
            <Switch
              bind:checked={draftConfig.mention_palette_show_global_drafts}
              ariaLabel={$t('showGlobalDraftsInMentions')}
            />
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('htmlPreview')}</h4>
          <div class="execution-settings">
            <div class="execution-setting">
              <label class="execution-value-row">
                <span class="label-text">{$t('htmlPreviewFixedHeight')}</span>
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
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('agentExecution')}</h4>
          <div class="execution-settings">
            <div class="execution-setting">
              <div class="startup-row execution-toggle-row">
                <div class="startup-copy">
                  <span class="label-text">{$t('agentTurnLimit')}</span>
                  <p class="detail-hint">{$t('agentTurnLimitHint')}</p>
                </div>
                <Switch
                  bind:checked={draftConfig.agent_turn_limit_enabled}
                  ariaLabel={$t('agentTurnLimit')}
                />
              </div>
              <label class="execution-value-row">
                <span class="label-text">{$t('agentMaxTurns')}</span>
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

    <Tabs.Content value="memory" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('memoryManagement')}</h4>
          <div class="detail-label">
            <span class="label-text">{$t('scope')}</span>
            <Select
              bind:value={memoryScope}
              items={[
                { value: 'global', label: $t('globalTab') },
                { value: 'local', label: $t('projectTab') },
              ]}
              ariaLabel={$t('scope')}
            />
            {#if memoryScope === "local" && !workspacePath}
              <p class="detail-hint">{$t('memoryNoWorkspace')}</p>
            {:else}
              <p class="detail-hint">{$t('memoryManagementHint')}</p>
            {/if}
          </div>
        </section>

        <section class="detail-section">
          <h4 class="detail-section-title">{$t('memoryBackup')}</h4>
          <div class="memory-action-grid">
            <button class="filter-toggle" onclick={exportMemory} disabled={memoryBusy || !memoryScopeAvailable()}>
              {$t('exportMemory')}
            </button>
            <button class="filter-toggle" onclick={() => importMemory(false)} disabled={memoryBusy || !memoryScopeAvailable()}>
              {$t('importMemoryMerge')}
            </button>
            <button class="filter-toggle" onclick={() => importMemory(true)} disabled={memoryBusy || !memoryScopeAvailable()}>
              {$t('importMemoryReplace')}
            </button>
          </div>
        </section>

        <section class="detail-section danger-zone">
          <div>
            <p class="danger-title">{$t('clearMemory')}</p>
            <p class="danger-copy">{$t('clearMemoryDesc')}</p>
          </div>
          <button class="filter-toggle danger-btn" onclick={clearMemoryScope} disabled={memoryBusy || !memoryScopeAvailable()}>
            {$t('clearMemory')}
          </button>
        </section>

        {#if memoryStatus}
          <div class="provider-status {memoryStatus.includes(tr('memoryOperationFailed')) ? 'error' : 'success'}">
            {memoryStatus}
          </div>
        {/if}
      </div>
    </Tabs.Content>

    <Tabs.Content value="websearch" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('fetchSettings')}</h4>
          <label class="detail-label">
            <span class="label-text">{$t('fetchPageSize')}</span>
            <input
              type="number"
              class="detail-input"
              min="1000"
              max="50000"
              step="1000"
              bind:value={draftConfig.fetch.page_size}
            />
          </label>
          <p class="detail-hint">{$t('fetchPageSizeHint')}</p>
        </section>

        <section class="detail-section">
          <div class="detail-label">
            <span class="label-text">{$t('searchProvider')}</span>
            <Select
              bind:value={draftConfig.web_search.provider}
              items={[
                { value: 'brave', label: $t('searchProviderBrave') },
                { value: 'tavily', label: $t('searchProviderTavily') },
                { value: 'searxng', label: $t('searchProviderSearxng') },
              ]}
              ariaLabel={$t('searchProvider')}
            />
          </div>
          <p class="detail-hint">{$t('searchProviderDesc')}</p>
        </section>

        {#if draftConfig.web_search.provider === "brave"}
          <section class="detail-section">
            <h4 class="detail-section-title">{$t('searchProviderBrave')}</h4>
            <label class="detail-label">
              <span class="label-text">{$t('braveApiKey')}</span>
              <input
                type="password"
                class="detail-input"
                placeholder={$t('braveApiKeyPlaceholder')}
                bind:value={draftConfig.web_search.brave_api_key}
              />
            </label>
          </section>
        {:else if draftConfig.web_search.provider === "tavily"}
          <section class="detail-section">
            <h4 class="detail-section-title">{$t('searchProviderTavily')}</h4>
            <label class="detail-label">
              <span class="label-text">{$t('tavilyApiKey')}</span>
              <input
                type="password"
                class="detail-input"
                placeholder={$t('tavilyApiKeyPlaceholder')}
                bind:value={draftConfig.web_search.tavily_api_key}
              />
            </label>
          </section>
        {:else if draftConfig.web_search.provider === "searxng"}
          <section class="detail-section">
            <h4 class="detail-section-title">{$t('searchProviderSearxng')}</h4>
            <label class="detail-label">
              <span class="label-text">{$t('searxngBaseUrl')}</span>
              <input
                type="text"
                class="detail-input"
                placeholder={$t('searxngBaseUrlPlaceholder')}
                bind:value={draftConfig.web_search.searxng_base_url}
              />
            </label>
            <p class="detail-hint">{$t('searxngHint')}</p>
          </section>
        {/if}
      </div>
    </Tabs.Content>

    <Tabs.Content value="providers" class="settings-tab-panel">
      <div class="settings-list-col">
        <div class="list-search-bar">
          <div class="list-toolbar">
            <input class="list-search-input" placeholder={$t('searchProviders')} bind:value={providerSearch} />
            <button
              class="filter-toggle"
              onclick={() => {
                providerFilter = providerFilter === "all" ? "enabled" : providerFilter === "enabled" ? "disabled" : "all";
              }}
            >
              {providerFilter === "all" ? $t('filterAll') : providerFilter === "enabled" ? $t('filterEnabled') : $t('filterDisabled')}
            </button>
          </div>
        </div>
        <div class="provider-list">
          {#if filteredProviders.length > 0}
            {#each filteredProviders as provider (provider.id)}
              <ContextMenu.Root>
                <ContextMenu.Trigger>
                  <button
                    class="provider-item {selectedProviderId === provider.id ? 'active' : ''}"
                    onclick={() => { selectedProviderId = provider.id; modelSearch = ""; }}
                  >
                    <div class="provider-item-icon provider-type-{provider.provider}">
                      {provider.provider === "anthropic" ? "A" : "O"}
                    </div>
                    <div class="provider-item-info">
                      <span class="provider-item-name">{provider.name}</span>
                      <span class="provider-item-url">{getProviderUrl(provider)}</span>
                    </div>
                    <span class:provider-enabled-dot={provider.enabled} class:provider-disabled-dot={!provider.enabled}></span>
                  </button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content class="ctx-menu-content">
                    <ContextMenu.Item class="ctx-menu-item ctx-menu-item-danger" onclick={() => removeProvider(provider.id)}>
                      {$t('deleteNode')}
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            {/each}
          {:else}
            <div class="provider-list-empty">{$t('noProviders')}</div>
          {/if}
        </div>
        <div class="list-footer">
          <button class="add-provider-btn" onclick={addProvider}>{$t('addProvider')}</button>
        </div>
      </div>

      {#if selectedProviderIndex >= 0 && selectedProvider}
        <div class="settings-detail-col">
          <div class="detail-top-bar">
            <span class="detail-service-name">{selectedProvider.name}</span>
            <div class="detail-actions">
              <div class="toggle-row">
                <span>{$t('providerEnabled')}</span>
                <Switch
                  bind:checked={draftConfig.providers[selectedProviderIndex].enabled}
                  disabled={modelLoading[selectedProvider.id]}
                  onCheckedChange={(checked) => setProviderEnabled(selectedProvider.id, checked)}
                  ariaLabel={$t('providerEnabled')}
                />
              </div>
            </div>
          </div>
          <div class="detail-content">
            <section class="detail-section">
              <h4 class="detail-section-title">{$t('basicInfo')}</h4>
              <label class="detail-label">
                <span class="label-text">{$t('providerName')}</span>
                <input class="detail-input" bind:value={draftConfig.providers[selectedProviderIndex].name} />
              </label>
              <div class="detail-label">
                <span class="label-text">{$t('providerType')}</span>
                <Select
                  bind:value={draftConfig.providers[selectedProviderIndex].provider}
                  items={[
                    { value: 'openai', label: 'OpenAI Compatible' },
                    { value: 'anthropic', label: 'Anthropic' },
                  ]}
                  ariaLabel={$t('providerType')}
                />
              </div>
            </section>

            <section class="detail-section">
              <h4 class="detail-section-title">{$t('apiSettings')}</h4>
              <div class="detail-label">
                <span class="label-text">API Key</span>
                <div class="key-input-row">
                  <input type="password" class="detail-input" bind:value={draftConfig.providers[selectedProviderIndex].api_key} />
                  <button class="btn-secondary btn-sm" onclick={() => testProvider(selectedProvider.id)}>{$t('testConnection')}</button>
                </div>
              </div>
              <label class="detail-label">
                <span class="label-text">{$t('apiUrl')}</span>
                <input
                  class="detail-input"
                  bind:value={draftConfig.providers[selectedProviderIndex].base_url}
                  placeholder={selectedProvider.provider === "anthropic" ? "https://api.anthropic.com" : "http://localhost:8009"}
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
                <h4 class="detail-section-title">{$t('modelList')}</h4>
                <button class="btn-secondary btn-sm" onclick={() => fetchModels(selectedProvider.id)} disabled={modelLoading[selectedProvider.id]}>
                  {modelLoading[selectedProvider.id] ? $t('syncing') : $t('fetchModels')}
                </button>
              </div>
              {#if selectedProvider.models.length > 0}
                <input
                  class="model-search-input"
                  placeholder={$t('searchModels')}
                  bind:value={modelSearch}
                />
              {/if}
              <div class="model-list-box">
                {#if selectedProvider.models.length === 0}
                  <div class="model-list-empty">{$t('noModels')}</div>
                {:else if filteredModels.length === 0}
                  <div class="model-list-empty">{modelSearch}</div>
                {:else}
                  {#each filteredModels as modelName}
                    <div class="model-item">
                      <div class="model-main">
                        <span class="model-name">{modelName}</span>
                      </div>
                      <div class="model-item-actions">
                        <button class="model-action-btn" onclick={() => setDefaultModel("chat_model", selectedProvider.id, modelName)}>Chat</button>
                        <button class="model-action-btn" onclick={() => setDefaultModel("flash_model", selectedProvider.id, modelName)}>Flash</button>
                        <button class="model-action-btn" onclick={() => openModelConfig(selectedProvider.id, modelName)}>{$t('configure')}</button>
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </section>

            <section class="detail-section">
              <div class="danger-zone">
                <div>
                  <div class="danger-title">{$t('deleteNode')}</div>
                  <div class="danger-copy">{$t('deleteNodeDesc')}</div>
                </div>
                <button class="danger-btn" onclick={() => removeProvider(selectedProvider.id)}>{$t('deleteNode')}</button>
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
            <h4 class="detail-section-title">{$t('scheduledHooks')}</h4>
            <button class="filter-toggle" onclick={refreshHooks}>{$t('refresh')}</button>
          </div>
          <div class="detail-grid">
            <label class="detail-label" style="grid-column: 1 / -1">
              <span class="label-text">{$t('hookUserMessage')}</span>
              <textarea class="detail-input hook-textarea" bind:value={hookMessage} placeholder={$t('hookUserMessagePlaceholder')}></textarea>
            </label>
            <div class="detail-label">
              <span class="label-text">{$t('hookSchedule')}</span>
              <Select
                bind:value={hookMode}
                items={[
                  { value: "delay", label: $t('hookModeDelay') },
                  { value: "run_at", label: $t('hookModeRunAt') },
                  { value: "interval_minutes", label: $t('hookModeInterval') },
                  { value: "daily", label: $t('hookModeDaily') },
                  { value: "weekdays", label: $t('hookModeWeekdays') },
                  { value: "weekly", label: $t('hookModeWeekly') },
                ]}
                ariaLabel={$t('hookSchedule')}
              />
            </div>
            <div class="detail-label">
              <span class="label-text">{$t('scheduledRole')}</span>
              <Select
                bind:value={hookRoleKey}
                items={[
                  { value: "openagent", label: $t("defaultRoleName"), description: $t("defaultRoleDescription") },
                  ...hookRoles.map((role) => ({ value: role.id, label: role.name, description: role.description })),
                ]}
                searchable
                searchPlaceholder={$t("roleSelectorSearch")}
                emptyText={$t("noMatchingRoles")}
                ariaLabel={$t('scheduledRole')}
              />
            </div>
            {#if hookMode === "delay"}
              <label class="detail-label">
                <span class="label-text">{$t('hookDelayMinutes')}</span>
                <input class="detail-input" type="number" min="1" bind:value={hookDelayMinutes} />
              </label>
            {:else if hookMode === "run_at"}
              <label class="detail-label">
                <span class="label-text">{$t('hookRunAt')}</span>
                <input class="detail-input" bind:value={hookRunAt} placeholder="2026-06-17 18:30" />
              </label>
            {:else if hookMode === "interval_minutes"}
              <label class="detail-label">
                <span class="label-text">{$t('hookIntervalMinutes')}</span>
                <input class="detail-input" type="number" min="1" bind:value={hookIntervalMinutes} />
              </label>
            {:else}
              <label class="detail-label">
                <span class="label-text">{$t('hookTimeOfDay')}</span>
                <input class="detail-input" bind:value={hookTimeOfDay} placeholder="09:00" />
              </label>
              {#if hookMode === "weekly"}
                <label class="detail-label" style="grid-column: 1 / -1">
                  <span class="label-text">{$t('hookWeekdays')}</span>
                  <input class="detail-input" bind:value={hookWeekdays} placeholder="mon,wed,fri" />
                </label>
              {/if}
            {/if}
          </div>
          <div class="key-input-row" style="margin-top:12px">
            <button class="filter-toggle" onclick={createHook}>{$t('createHook')}</button>
            {#if hookStatus}
              <div class="provider-status success">{hookStatus}</div>
            {/if}
          </div>
        </section>

        <section class="detail-section">
          <h4 class="detail-section-title">{$t('activeHooks')}</h4>
          <div class="model-list-box">
            {#if scheduledHooks.length > 0}
              {#each scheduledHooks as hook (hook.id)}
                <div class="hook-item">
                  <div class="hook-main">
                    <div class="model-name">{hook.schedule}</div>
                    <div class="provider-item-url">{$t('nextRunAt')}: {formatHookTime(hook.next_run_at)}</div>
                    <div class="provider-item-url">{$t('scheduledRole')}: {hookRoleName(hook.role_id)}</div>
                    <div class="provider-item-url">{hook.message}</div>
                  </div>
                  <button class="model-action-btn" onclick={() => cancelHook(hook.id)}>{$t('cancel')}</button>
                </div>
              {/each}
            {:else}
              <div class="model-list-empty">{$t('noActiveHooks')}</div>
            {/if}
          </div>
        </section>
      </div>
    </Tabs.Content>
    <Tabs.Content value="defaults" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('chatModel')}</h4>
          <div class="detail-label">
            <span class="label-text">{$t('providerNode')}</span>
            <Select
              bind:value={draftConfig.defaults.chat_model.provider_id}
              items={enabledProviderOptions()}
              ariaLabel={$t('providerNode')}
            />
          </div>
          <div class="detail-label">
            <span class="label-text">{$t('model')}</span>
            <Combobox
              bind:value={draftConfig.defaults.chat_model.model}
              items={providerModels(draftConfig.defaults.chat_model.provider_id).map((m) => ({ value: m, label: m }))}
              placeholder={$t('model')}
              ariaLabel={$t('model')}
            />
          </div>
        </section>
        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t('chatModelRetryQueue')}</h4>
            <button class="btn-secondary btn-sm" onclick={() => addRetryQueueModel("chat_queue")}>{$t('add')}</button>
          </div>
          <label class="detail-label">
            <span class="label-text">{$t('retryCountPerModel')}</span>
            <input
              class="detail-input"
              type="number"
              min="0"
              max="10"
              bind:value={draftConfig.model_retry.retry_count}
            />
          </label>
          <label class="detail-label">
            <span class="label-text">{$t('retryDelayMs')}</span>
            <input
              class="detail-input"
              type="number"
              min="0"
              max="60000"
              step="100"
              bind:value={draftConfig.model_retry.retry_delay_ms}
            />
          </label>
          <div class="model-list-box retry-queue-list">
            {#if draftConfig.model_retry.chat_queue.length > 0}
              {#each draftConfig.model_retry.chat_queue as binding, index (binding)}
                <div
                  class:retry-queue-dragging={draggedRetryQueue?.kind === "chat_queue" && draggedRetryQueue.index === index}
                  class="model-item retry-queue-item"
                  role="listitem"
                  ondragover={(event) => event.preventDefault()}
                  ondrop={(event) => dropRetryQueueModel("chat_queue", index, event)}
                >
                  <button
                    class="retry-queue-drag-handle"
                    type="button"
                    draggable="true"
                    aria-label={$t('retryQueueDragHandle')}
                    title={$t('retryQueueDragHandle')}
                    ondragstart={(event) => startRetryQueueDrag("chat_queue", index, event)}
                    ondragend={() => draggedRetryQueue = null}
                  >⠇</button>
                  <div class="retry-queue-fields">
                    <Select
                      bind:value={binding.provider_id}
                      items={enabledProviderOptions()}
                      ariaLabel={$t('providerNode')}
                    />
                    <Combobox
                      bind:value={binding.model}
                      items={providerModels(binding.provider_id).map((m) => ({ value: m, label: m }))}
                      placeholder={$t('model')}
                      ariaLabel={$t('model')}
                    />
                  </div>
                  <button class="model-action-btn" onclick={() => removeRetryQueueModel("chat_queue", index)}>{$t('delete')}</button>
                </div>
              {/each}
            {:else}
              <div class="model-list-empty">{$t('noQueuedChatFallbackModels')}</div>
            {/if}
          </div>
        </section>
        <section class="detail-section">
          <h4 class="detail-section-title">{$t('flashModel')}</h4>
          <div class="detail-label">
            <span class="label-text">{$t('providerNode')}</span>
            <Select
              bind:value={draftConfig.defaults.flash_model.provider_id}
              items={enabledProviderOptions()}
              ariaLabel={$t('providerNode')}
            />
          </div>
          <div class="detail-label">
            <span class="label-text">{$t('model')}</span>
            <Combobox
              bind:value={draftConfig.defaults.flash_model.model}
              items={providerModels(draftConfig.defaults.flash_model.provider_id).map((m) => ({ value: m, label: m }))}
              placeholder={$t('model')}
              ariaLabel={$t('model')}
            />
          </div>
        </section>
        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t('flashModelRetryQueue')}</h4>
            <button class="btn-secondary btn-sm" onclick={() => addRetryQueueModel("flash_queue")}>{$t('add')}</button>
          </div>
          <div class="model-list-box retry-queue-list">
            {#if draftConfig.model_retry.flash_queue.length > 0}
              {#each draftConfig.model_retry.flash_queue as binding, index (binding)}
                <div
                  class:retry-queue-dragging={draggedRetryQueue?.kind === "flash_queue" && draggedRetryQueue.index === index}
                  class="model-item retry-queue-item"
                  role="listitem"
                  ondragover={(event) => event.preventDefault()}
                  ondrop={(event) => dropRetryQueueModel("flash_queue", index, event)}
                >
                  <button
                    class="retry-queue-drag-handle"
                    type="button"
                    draggable="true"
                    aria-label={$t('retryQueueDragHandle')}
                    title={$t('retryQueueDragHandle')}
                    ondragstart={(event) => startRetryQueueDrag("flash_queue", index, event)}
                    ondragend={() => draggedRetryQueue = null}
                  >⠇</button>
                  <div class="retry-queue-fields">
                    <Select bind:value={binding.provider_id} items={enabledProviderOptions()} ariaLabel={$t('providerNode')} />
                    <Combobox bind:value={binding.model} items={providerModels(binding.provider_id).map((m) => ({ value: m, label: m }))} placeholder={$t('model')} ariaLabel={$t('model')} />
                  </div>
                  <button class="model-action-btn" onclick={() => removeRetryQueueModel("flash_queue", index)}>{$t('delete')}</button>
                </div>
              {/each}
            {:else}
              <div class="model-list-empty">{$t('noQueuedFlashFallbackModels')}</div>
            {/if}
          </div>
        </section>
      </div>
    </Tabs.Content>

    <Tabs.Content value="agents" class="settings-tab-panel">
      <div class="settings-content-col">
        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t('autoApprovalTask')}</h4>
          </div>
          <p class="detail-hint">{$t('autoApprovalTaskDescription')}</p>
          <label class="detail-label">
            <span class="label-text">{$t('agentExtraPrompt')}</span>
            <textarea
              class="detail-input hook-textarea"
              bind:value={draftConfig.flash_agents.tool_approval.prompt}
              placeholder={$t('terminalApprovalTaskPromptPlaceholder')}
            ></textarea>
          </label>
        </section>

        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t('titleAgent')}</h4>
            <Switch
              bind:checked={draftConfig.flash_agents.title.enabled}
              ariaLabel={$t('titleAgentEnabled')}
            />
          </div>
          <p class="detail-hint">{$t('titleTaskDescription')}</p>
          <label class="detail-label">
            <span class="label-text">{$t('agentExtraPrompt')}</span>
            <textarea
              class="detail-input hook-textarea"
              bind:value={draftConfig.flash_agents.title.prompt}
              placeholder={$t('titleAgentPromptPlaceholder')}
            ></textarea>
          </label>
        </section>

        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t('skillCategoryAgent')}</h4>
            <Switch
              bind:checked={draftConfig.flash_agents.skill_category.enabled}
              ariaLabel={$t('skillCategoryAgentEnabled')}
            />
          </div>
          <p class="detail-hint">{$t('skillCategoryTaskDescription')}</p>
          <label class="detail-label">
            <span class="label-text">{$t('agentExtraPrompt')}</span>
            <textarea
              class="detail-input hook-textarea"
              bind:value={draftConfig.flash_agents.skill_category.prompt}
              placeholder={$t('skillCategoryAgentPromptPlaceholder')}
            ></textarea>
          </label>
        </section>

        <section class="detail-section memory-settings">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t('memoryAgent')}</h4>
            <Switch
              bind:checked={draftConfig.flash_agents.memory.enabled}
              ariaLabel={$t('memoryAgentEnabled')}
            />
          </div>
          <p class="detail-hint">{$t('memoryTaskDescription')}</p>
          <div class="memory-option-list">
            <div class="memory-option">
              <div class="memory-option-copy">
                <h5>{$t('newConversationSummary')}</h5>
                <p>{$t('newConversationSummaryDescription')}</p>
              </div>
              <Switch
                bind:checked={draftConfig.flash_agents.new_conversation_summary.enabled}
                ariaLabel={$t('newConversationSummaryEnabled')}
              />
            </div>
            <div class="memory-option">
              <div class="memory-option-copy">
                <h5>{$t('memoryRetrieval')}</h5>
                <p>{$t('memoryRetrievalDescription')}</p>
              </div>
              <Switch
                bind:checked={draftConfig.memory_retrieval_enabled}
                ariaLabel={$t('memoryRetrievalEnabled')}
              />
            </div>
          </div>
          <label class="detail-label memory-prompt">
            <span class="label-text">{$t('agentExtraPrompt')}</span>
            <textarea
              class="detail-input hook-textarea"
              bind:value={draftConfig.flash_agents.memory.prompt}
              placeholder={$t('memoryAgentPromptPlaceholder')}
            ></textarea>
          </label>
        </section>

        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t('hookAgent')}</h4>
            <Switch
              bind:checked={draftConfig.flash_agents.hook.enabled}
              ariaLabel={$t('hookAgentEnabled')}
            />
          </div>
          <p class="detail-hint">{$t('hookTaskDescription')}</p>
          <label class="detail-label">
            <span class="label-text">{$t('agentExtraPrompt')}</span>
            <textarea
              class="detail-input hook-textarea"
              bind:value={draftConfig.flash_agents.hook.prompt}
              placeholder={$t('hookAgentPromptPlaceholder')}
            ></textarea>
          </label>
        </section>

        <section class="detail-section">
          <div class="detail-section-header">
            <h4 class="detail-section-title">{$t('compactionTask')}</h4>
            <Switch
              bind:checked={draftConfig.context_compaction_enabled}
              ariaLabel={$t('contextCompaction')}
            />
          </div>
          <p class="detail-hint">{$t('compactionTaskDescription')}</p>
          <label class="detail-label">
            <span class="label-text">{$t('contextCompactionThreshold')}</span>
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
          <label class="detail-label">
            <span class="label-text">{$t('agentExtraPrompt')}</span>
            <textarea
              class="detail-input hook-textarea"
              bind:value={draftConfig.context_compaction_prompt}
              placeholder={$t('compactionTaskPromptPlaceholder')}
            ></textarea>
          </label>
        </section>
      </div>
    </Tabs.Content>

    <Tabs.Content value="extensions" class="settings-tab-panel">
      <div class="settings-list-col">
        <div class="provider-list">
          {#if draftConfig.mcp.servers.length === 0}
            <div class="provider-list-empty">{$t('noMcpServers')}</div>
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
                      <span class="provider-item-url">{server.transport === 'stdio' ? (server.command || $t('mcpCommandPlaceholder')) : (server.url || $t('mcpServerUrlPlaceholder'))}</span>
                    </div>
                    <span class:provider-enabled-dot={server.enabled} class:provider-disabled-dot={!server.enabled}></span>
                  </button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content class="ctx-menu-content">
                    <ContextMenu.Item class="ctx-menu-item ctx-menu-item-danger" onclick={() => removeMcpServer(server.id)}>
                      {$t('deleteNode')}
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            {/each}
          {/if}
        </div>
        <div class="list-footer">
          <button class="add-provider-btn" onclick={addMcpServer}>{$t('addMcpServer')}</button>
        </div>
      </div>

      {#if selectedMcpServer && selectedMcpIndex >= 0}
        {@const server = draftConfig.mcp.servers[selectedMcpIndex]}
        {@const status = mcpTestStatus[server.id]}
        <div class="settings-detail-col">
          <div class="detail-top-bar">
            <span class="detail-service-name">{server.name || "Unnamed Server"}</span>
            <div class="detail-actions">
              <div class="toggle-row">
                <span>{$t('mcpEnabled')}</span>
                <Switch
                  bind:checked={draftConfig.mcp.servers[selectedMcpIndex].enabled}
                  disabled={status?.tone === "testing"}
                  onCheckedChange={(checked) => setMcpEnabled(server.id, checked)}
                  ariaLabel={$t('mcpEnabled')}
                />
              </div>
            </div>
          </div>
          <div class="detail-content">
            <section class="detail-section">
              <h4 class="detail-section-title">{$t('basicInfo')}</h4>
              <div class="detail-grid">
                <label class="detail-label">
                  <span class="label-text">{$t('mcpServerName')}</span>
                  <input class="detail-input" bind:value={draftConfig.mcp.servers[selectedMcpIndex].name} placeholder="My MCP Server" />
                </label>
              </div>
            </section>

            <section class="detail-section">
              <h4 class="detail-section-title">{$t('apiSettings')}</h4>
              <div class="detail-grid">
                <div class="detail-label">
                  <span class="label-text">{$t('mcpTransport')}</span>
                  <Select
                    bind:value={draftConfig.mcp.servers[selectedMcpIndex].transport}
                    items={[
                      { value: 'http', label: $t('mcpTransportHttp') },
                      { value: 'stdio', label: $t('mcpTransportStdio') },
                    ]}
                    ariaLabel={$t('mcpTransport')}
                  />
                </div>

                {#if server.transport === "http"}
                  <label class="detail-label">
                    <span class="label-text">{$t('mcpServerUrl')}</span>
                    <input
                      class="detail-input"
                      bind:value={draftConfig.mcp.servers[selectedMcpIndex].url}
                      placeholder={$t('mcpServerUrlPlaceholder')}
                    />
                  </label>
                  <label class="detail-label">
                    <span class="label-text">{$t('mcpBearerToken')}</span>
                    <input
                      type="password"
                      class="detail-input"
                      bind:value={draftConfig.mcp.servers[selectedMcpIndex].bearer_token}
                      placeholder={$t('mcpBearerTokenPlaceholder')}
                    />
                  </label>
                  <div class="detail-label" style="grid-column: 1 / -1">
                    <span class="label-text">{$t('mcpHeaders')}</span>
                    {#each Object.entries(draftConfig.mcp.servers[selectedMcpIndex].headers) as [k, v] (k)}
                      <div class="env-row">
                        <input
                          class="detail-input env-key"
                          value={k}
                          placeholder={$t('mcpHeaderKeyPlaceholder')}
                          onchange={(e) => updateHeaderKey(selectedMcpIndex, k, (e.target as HTMLInputElement).value)}
                        />
                        <input
                          class="detail-input env-val"
                          bind:value={draftConfig.mcp.servers[selectedMcpIndex].headers[k]}
                          placeholder={$t('mcpHeaderValPlaceholder')}
                        />
                        <button class="model-action-btn" onclick={() => removeHeader(selectedMcpIndex, k)}>×</button>
                      </div>
                    {/each}
                    <button class="filter-toggle" style="margin-top:6px" onclick={() => addHeader(selectedMcpIndex)}>
                      {$t('addHeader')}
                    </button>
                  </div>
                {:else}
                  <label class="detail-label">
                    <span class="label-text">{$t('mcpCommand')}</span>
                    <input
                      class="detail-input"
                      bind:value={draftConfig.mcp.servers[selectedMcpIndex].command}
                      placeholder={$t('mcpCommandPlaceholder')}
                    />
                  </label>
                  <label class="detail-label">
                    <span class="label-text">{$t('mcpArgs')}</span>
                    <input
                      class="detail-input"
                      value={draftConfig.mcp.servers[selectedMcpIndex].args.join(" ")}
                      placeholder={$t('mcpArgsPlaceholder')}
                      oninput={(e) => {
                        const v = (e.target as HTMLInputElement).value.trim();
                        draftConfig.mcp.servers[selectedMcpIndex].args = v ? v.split(/\s+/) : [];
                      }}
                    />
                  </label>

                  <div class="detail-label" style="grid-column: 1 / -1">
                    <span class="label-text">{$t('mcpEnvVars')}</span>
                    {#each Object.entries(draftConfig.mcp.servers[selectedMcpIndex].env) as [k, v] (k)}
                      <div class="env-row">
                        <input
                          class="detail-input env-key"
                          value={k}
                          placeholder={$t('mcpEnvKeyPlaceholder')}
                          onchange={(e) => updateEnvKey(selectedMcpIndex, k, (e.target as HTMLInputElement).value)}
                        />
                        <input
                          class="detail-input env-val"
                          bind:value={draftConfig.mcp.servers[selectedMcpIndex].env[k]}
                          placeholder={$t('mcpEnvValPlaceholder')}
                        />
                        <button class="model-action-btn" onclick={() => removeEnvVar(selectedMcpIndex, k)}>×</button>
                      </div>
                    {/each}
                    <button class="filter-toggle" style="margin-top:6px" onclick={() => addEnvVar(selectedMcpIndex)}>
                      {$t('addEnvVar')}
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
                  {status?.tone === "testing" ? $t('mcpTesting') : $t('testMcpServer')}
                </button>
              </div>
              {#if status && status.tone !== "idle"}
                <div class="provider-status {status.tone === 'success' ? 'success' : status.tone === 'error' ? 'error' : 'loading'}" style="margin-top:8px">
                  {status.message}
                </div>
              {/if}
            </section>

            <section class="detail-section danger-zone">
              <p class="danger-title">{$t('deleteNode')}</p>
              <p class="danger-copy">{$t('deleteNodeDesc')}</p>
              <button class="filter-toggle danger-btn" onclick={() => removeMcpServer(server.id)}>
                {$t('deleteMcpServer')}
              </button>
            </section>
          </div>
        </div>
      {:else}
        <div class="settings-detail-col">
          <div class="extensions-placeholder">
            <span class="placeholder-icon">MCP</span>
            <p>{$t('noMcpServersHint')}</p>
          </div>
        </div>
      {/if}
    </Tabs.Content>

    <Tabs.Content value="about" class="settings-tab-panel">
      <div class="settings-content-col">
        <div class="about-content">
          <img class="about-logo-img" src="/assets/openagent_transparent.png" alt="OpenAgent" />
          <h3 class="about-app-name">OpenAgent</h3>
          <p class="about-version">{$t('aboutVersion')}</p>
          <p class="about-desc">{$t('aboutDesc')}</p>
          <a class="about-contact" href="mailto:iumm@ibat.ac.cn">iumm@ibat.ac.cn</a>
          <button class="btn-secondary btn-sm about-update-button" onclick={() => checkForAppUpdate(true)}>
            {$t('checkForUpdates')}
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
      <Dialog.Title class="dialog-title">{$t('clearMemory')}</Dialog.Title>

      <p class="dialog-copy">{$t('memoryClearConfirm')}</p>
      <div class="confirm-token">{$t('memoryClearConfirmText')}</div>

      <label class="dialog-field" for="memory-clear-confirm-input">
        <span class="label-text">{$t('memoryClearTypePrompt')}</span>
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
          {$t('cancel')}
        </button>
        <button
          class="btn-primary danger-primary"
          onclick={confirmClearMemoryScope}
          disabled={memoryBusy || memoryClearInput !== $t('memoryClearConfirmText')}
        >
          {$t('clearMemory')}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={modelConfigDialogOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog">
      <Dialog.Title class="dialog-title">{$t('modelConfiguration')}</Dialog.Title>

      <div class="model-config-fields">
        <label class="dialog-field" for="model-config-name">
          <span class="label-text">{$t('modelName')}</span>
          <input
            id="model-config-name"
            class="detail-input"
            autocomplete="off"
            bind:value={modelConfigName}
            onkeydown={(event) => event.key === "Enter" && saveModelConfig()}
          />
        </label>

        <label class="dialog-field" for="model-config-threshold">
          <span class="label-text">{$t('modelCompactionThreshold')}</span>
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
            {$t('modelCompactionThresholdHint')} {draftConfig.context_compaction_threshold}
          </span>
        </label>
      </div>

      {#if modelConfigValidationError()}
        <p class="dialog-error">{modelConfigValidationError()}</p>
      {/if}

      <div class="dialog-actions model-config-actions">
        <button class="danger-btn" onclick={deleteConfiguredModel}>
          {$t('deleteModel')}
        </button>
        <div class="dialog-actions-end">
          <button class="dialog-action-quiet" type="button" onclick={() => modelConfigDialogOpen = false}>
            {$t('cancel')}
          </button>
          <button class="btn-primary" onclick={saveModelConfig} disabled={Boolean(modelConfigValidationError())}>
            {$t('save')}
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
    background: var(--surface);
    border-bottom: 1px solid var(--border);
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
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
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
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    padding: 12px 8px;
  }

  .settings-nav-items {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .settings-nav-bottom {
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }

  :global(.settings-nav-item) {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: none;
    border: none;
    border-radius: 7px;
    padding: 8px 10px;
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s, color 0.12s;
  }

  :global(.settings-nav-item:hover:not([data-state="active"])) {
    background: var(--surface2);
    color: var(--text);
  }

  :global(.settings-nav-item[data-state="active"]) {
    background: var(--surface);
    color: var(--text);
    font-weight: 500;
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
    background: var(--surface);
    border-right: 1px solid var(--border);
  }

  .list-search-bar,
  .list-footer {
    padding: 10px 8px;
    border-bottom: 1px solid var(--border);
  }

  .list-footer {
    border-top: 1px solid var(--border);
    border-bottom: none;
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
    background: var(--control-surface);
    border: 0;
    border-radius: 6px;
    padding: 6px 12px;
    color: var(--text);
    font-size: 13px;
    outline: none;
    font-family: inherit;
    box-shadow: var(--control-shadow);
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
    box-shadow: var(--control-shadow), var(--focus-ring);
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
    transition: transform 0.1s, background 0.1s;
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
    transition: transform 0.1s, background 0.1s;
  }
  .model-action-btn:hover {
    background: var(--surface2);
  }
  .model-action-btn:active, .filter-toggle:active {
    transform: scale(0.95);
  }

  .add-provider-btn {
    width: 100%;
    border-style: dashed;
  }

  .provider-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .provider-item {
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
    transition: background 0.12s, color 0.12s;
  }

  .provider-item:hover {
    background: var(--bg);
  }

  .provider-item.active {
    background: var(--surface2);
    color: var(--text);
  }

  .provider-item-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: white;
    font-weight: 700;
    flex-shrink: 0;
  }

  .provider-type-anthropic {
    background: #cc785c;
  }

  .provider-type-openai {
    background: #10a37f;
  }

  .mcp-icon {
    background: #6366f1;
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
    border-bottom: 1px solid var(--border);
    background: var(--surface);
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
    border: 0;
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--control-shadow);
  }

  .startup-copy {
    min-width: 0;
  }

  .remote-gateway-heading {
    align-items: center;
  }

  .remote-gateway-subtitle {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  .remote-gateway-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    padding: 4px 9px;
    border-radius: 999px;
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .remote-gateway-status span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .remote-gateway-status.active {
    background: var(--item-selected-bg);
    color: var(--primary);
  }

  .remote-gateway-status.active span {
    background: currentColor;
    box-shadow: none;
  }

  .remote-gateway-card,
  .remote-gateway-credentials {
    overflow: hidden;
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--control-shadow);
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

  .remote-gateway-icon svg {
    width: 19px;
    height: 19px;
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

  @media (max-width: 640px) {
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
    border: 0;
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--control-shadow);
  }

  .execution-toggle-row {
    border: 0;
    border-radius: 0;
    padding: 14px 16px;
  }

  .execution-value-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-height: 42px;
    padding: 8px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface2);
  }

  .execution-number-input {
    width: 136px;
    flex: 0 0 136px;
    background: var(--surface);
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

  .memory-settings > .detail-hint {
    margin: -4px 4px 16px;
  }

  .memory-option-list {
    overflow: hidden;
    border: 0;
    border-radius: 10px;
    background: var(--surface);
    box-shadow: var(--control-shadow);
  }

  .memory-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 14px 16px;
  }

  .memory-option + .memory-option {
    border-top: 1px solid var(--border);
  }

  .memory-option-copy {
    min-width: 0;
  }

  .memory-option h5 {
    margin: 0;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
  }

  .memory-option p {
    margin: 4px 0 0;
    color: var(--text-muted, #888);
    font-size: 12px;
    line-height: 1.55;
  }

  .memory-option :global(button) {
    flex: 0 0 auto;
  }

  .memory-prompt {
    margin-top: 18px;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .model-search-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--control-surface);
    border: 0;
    border-radius: 6px;
    padding: 6px 12px;
    color: var(--text);
    font-size: 13px;
    outline: none;
    font-family: inherit;
    margin-bottom: 8px;
    box-shadow: var(--control-shadow);
    transition: box-shadow 0.2s;
  }

  .model-search-input:focus {
    box-shadow: var(--control-shadow), var(--focus-ring);
  }

  .model-list-box {
    border: 0;
    border-radius: 11px;
    overflow: hidden;
    background: var(--surface);
    box-shadow: var(--control-shadow);
  }

  .model-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
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
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .hook-textarea {
    min-height: 84px;
    resize: vertical;
  }

  .model-item:last-child {
    border-bottom: none;
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
  .danger-zone,
  .extensions-placeholder {
    border-radius: 8px;
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
    background: #dc2626;
  }

  :global(.btn-primary.danger-primary:hover) {
    background: #b91c1c;
  }

  .danger-zone {
    border: 1px solid rgba(239, 68, 68, 0.2);
    background: rgba(239, 68, 68, 0.05);
  }

  .danger-title,
  .content-col-title,
  .about-app-name {
    color: var(--text);
    font-weight: 600;
  }

  .danger-btn {
    color: #dc2626;
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

  .about-logo-img {
    width: 64px;
    height: 64px;
    border-radius: 14px;
  }

  /* Context menu */
  :global(.ctx-menu-content) {
    background: var(--control-surface);
    border: 0;
    border-radius: 8px;
    padding: 4px;
    min-width: 140px;
    -webkit-backdrop-filter: blur(12px) saturate(1.08);
    backdrop-filter: blur(12px) saturate(1.08);
    box-shadow: var(--raised-shadow);
    z-index: 200;
  }

  :global(.ctx-menu-item) {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    transition: background 0.1s;
    outline: none;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
  }

  :global(.ctx-menu-item:hover:not([data-selected])),
  :global(.ctx-menu-item[data-highlighted]:not([data-selected])) {
    background: var(--bg);
  }

  :global(.ctx-menu-item[data-selected]) {
    background: var(--item-selected-bg);
    color: var(--primary);
  }

  :global(.ctx-menu-item[data-selected]:hover),
  :global(.ctx-menu-item[data-selected][data-highlighted]) {
    background: var(--item-selected-hover-bg);
  }

  :global(.ctx-menu-item-danger) {
    color: #dc2626;
  }

  :global(.ctx-menu-item-danger:hover),
  :global(.ctx-menu-item-danger[data-highlighted]) {
    background: rgba(239, 68, 68, 0.08);
  }
</style>
