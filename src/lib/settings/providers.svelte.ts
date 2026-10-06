import { desktopOpenAgent } from "$lib/openagent/tauriClient";
import { isTauri } from "@tauri-apps/api/core";
import { onMount } from "svelte";
import { fromStore } from "svelte/store";
import type { AppConfig, ProviderConfig } from "$lib/types";
import {
  providerCatalogEntry,
  providerDefaultBaseUrl,
  providerIconPath,
} from "$lib/providerCatalog";
import {
  applyDetectedProviderModels,
  applyFetchedProviderModels,
  createProviderConfig,
  providerConnectionFingerprint,
  providerRequestUrl,
  providerServiceName,
  repairModelBindings,
  replaceProviderModels,
  selectModelBindingProvider,
  type RetryQueueKind,
} from "$lib/settingsConfig";
import { t } from "$lib/i18n";
import type { SettingsOptions } from "./types";
import type { ProviderStatus, ProviderProbeResult } from "./types";
import type { SettingsDraft } from "./draft.svelte";

export function createProviderSettings(
  draft: SettingsDraft,
  options: Pick<SettingsOptions, "visibleSections">,
) {
  const translation = fromStore(t);
  let selectedProviderId = $state("default");
  let providerSearch = $state("");
  let providerFilter = $state<"all" | "enabled" | "disabled">("all");
  let modelSearch = $state("");
  let manualModelName = $state("");
  let providerStatus = $state<Record<string, ProviderStatus>>({});
  let modelLoading = $state<Record<string, boolean>>({});
  let chatgptOAuthAuthenticated = $state(false);

  let modelConfigDialogOpen = $state(false);
  let modelConfigProviderId = $state("");
  let modelConfigOriginalName = $state("");
  let modelConfigName = $state("");
  let modelConfigThreshold = $state<string | number | undefined>("");
  let modelConfigSupportsReasoningEffort = $state(false);
  let modelConfigSupportsVision = $state(false);

  let draggedRetryQueue = $state<{ kind: RetryQueueKind; index: number } | null>(null);

  const providerConnectionFingerprints = new Map<string, string>();

  const filteredProviders = $derived.by(() => {
    const query = providerSearch.trim().toLowerCase();
    return draft.draftConfig.providers.filter((provider) => {
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

  const filteredModels = $derived.by(() => {
    const query = modelSearch.trim().toLowerCase();
    const models =
      draft.draftConfig.providers.find((p) => p.id === selectedProviderId)?.models ?? [];
    return query ? models.filter((m) => m.toLowerCase().includes(query)) : models;
  });

  const selectedProviderIndex = $derived(
    draft.draftConfig.providers.findIndex((provider) => provider.id === selectedProviderId),
  );

  const selectedProvider = $derived(
    selectedProviderIndex >= 0 ? draft.draftConfig.providers[selectedProviderIndex] : null,
  );
  const openAiApiModeOptions = $derived([
    { value: "responses", label: translation.current("responsesApi") },
    { value: "chat_completions", label: translation.current("chatCompletionsApi") },
  ]);

  function ensureSelectedProvider() {
    if (draft.draftConfig.providers.some((provider) => provider.id === selectedProviderId)) return;
    selectedProviderId = draft.draftConfig.providers[0]?.id ?? "";
  }

  function addProvider() {
    const provider = createProviderConfig();
    draft.draftConfig.providers = [...draft.draftConfig.providers, provider];
    selectedProviderId = provider.id;
  }

  function removeProvider(id: string) {
    draft.draftConfig.providers = draft.draftConfig.providers.filter(
      (provider) => provider.id !== id,
    );
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
      [id]: { tone: "loading", message: translation.current("signingOutChatgpt") },
    };
    try {
      await desktopOpenAgent.invokeProduct("logout_chatgpt", {});
      chatgptOAuthAuthenticated = false;
      providerStatus = {
        ...providerStatus,
        [id]: { tone: "success", message: translation.current("chatgptSignedOut") },
      };
    } catch (err: unknown) {
      providerStatus = { ...providerStatus, [id]: { tone: "error", message: `${err}` } };
    }
  }

  async function testProvider(id: string) {
    const provider = draft.draftConfig.providers.find((item) => item.id === id);
    if (!provider) return;
    providerStatus = {
      ...providerStatus,
      [id]: { tone: "loading", message: translation.current("checkingConnection") },
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
    const provider = draft.draftConfig.providers.find((item) => item.id === id);
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
        throw new Error(translation.current("providerNoModelsReturned"));
      }
      repairDefaultModelBindings();
      providerStatus = {
        ...providerStatus,
        [id]: {
          tone: "success",
          message: `${translation.current("providerEnabledWithModels")} ${provider.models.length}`,
        },
      };
    } catch (err: unknown) {
      providerStatus = { ...providerStatus, [id]: { tone: "error", message: `${err}` } };
    } finally {
      modelLoading = { ...modelLoading, [id]: false };
    }
  }

  async function setProviderEnabled(id: string, enabled: boolean) {
    const provider = draft.draftConfig.providers.find((item) => item.id === id);
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
      [id]: { tone: "loading", message: translation.current("checkingConnection") },
    };
    try {
      const models = await desktopOpenAgent.invokeProduct("fetch_provider_models", {
        request: { provider: $state.snapshot(provider) },
      });
      const normalizedModels = Array.from(
        new Set(models.map((model) => model.trim()).filter(Boolean)),
      ).sort();
      if (normalizedModels.length === 0) {
        throw new Error(translation.current("providerNoModelsReturned"));
      }
      applyFetchedProviderModels(provider, normalizedModels);
      repairDefaultModelBindings();
      providerStatus = {
        ...providerStatus,
        [id]: {
          tone: "success",
          message: `${translation.current("providerEnabledWithModels")} ${normalizedModels.length}`,
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
    draft.draftConfig.defaults[kind].provider_id = providerId;
    draft.draftConfig.defaults[kind].model = model;
  }

  function selectBindingProvider(binding: AppConfig["defaults"]["chat_model"], providerId: string) {
    selectModelBindingProvider(draft.draftConfig, binding, providerId);
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
    const provider = draft.draftConfig.providers.find((item) => item.id === providerId);
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
      draft.draftConfig.providers.find((provider) => provider.id === modelConfigProviderId)
        ?.provider === "chatgpt"
    );
  }

  function modelConfigValidationError() {
    const provider = draft.draftConfig.providers.find((item) => item.id === modelConfigProviderId);
    const name = modelConfigName.trim();
    if (!provider || !name) return translation.current("modelNameRequired");
    if (name !== modelConfigOriginalName && provider.models.includes(name)) {
      return translation.current("modelNameExists");
    }
    const threshold = `${modelConfigThreshold ?? ""}`.trim();
    if (threshold) {
      const parsed = Number(threshold);
      if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 1_000_000) {
        return translation.current("modelCompactionThresholdRange");
      }
    }
    return "";
  }

  function saveModelConfig() {
    const provider = draft.draftConfig.providers.find((item) => item.id === modelConfigProviderId);
    const nextName = modelConfigName.trim();
    if (!provider || modelConfigValidationError()) return;

    const previousName = modelConfigOriginalName;
    if (nextName !== previousName) {
      provider.models = provider.models.map((model) => (model === previousName ? nextName : model));
      for (const kind of ["chat_model", "flash_model"] as const) {
        const binding = draft.draftConfig.defaults[kind];
        if (binding.provider_id === provider.id && binding.model === previousName) {
          binding.model = nextName;
        }
      }
      for (const kind of ["chat_queue", "flash_queue"] as const) {
        for (const binding of draft.draftConfig.model_retry[kind]) {
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
    const provider = draft.draftConfig.providers.find((item) => item.id === providerId);
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
    const provider = draft.draftConfig.providers.find((item) => item.id === providerId);
    return provider?.enabled ? provider.models : [];
  }

  function enabledProviderOptions() {
    return draft.draftConfig.providers
      .filter((provider) => provider.enabled && provider.models.length > 0)
      .map((provider) => ({
        value: provider.id,
        label: providerServiceName(provider),
        icon: providerIconPath(provider.provider),
        iconFallback: providerCatalogEntry(provider.provider).badge,
      }));
  }

  function repairDefaultModelBindings() {
    repairModelBindings(draft.draftConfig);
  }

  function addRetryQueueModel(kind: RetryQueueKind) {
    const provider = draft.draftConfig.providers.find(
      (item) => item.enabled && item.models.length > 0,
    );
    if (!provider) return;
    draft.draftConfig.model_retry[kind] = [
      ...draft.draftConfig.model_retry[kind],
      {
        provider_id: provider?.id ?? "",
        model: provider?.models[0] ?? "",
      },
    ];
  }

  function updateRetryDelaySeconds(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (!Number.isFinite(input.valueAsNumber)) return;
    draft.draftConfig.model_retry.retry_delay_ms = Math.min(
      60_000,
      Math.max(0, Math.round(input.valueAsNumber * 1000)),
    );
  }

  function removeRetryQueueModel(kind: RetryQueueKind, index: number) {
    draft.draftConfig.model_retry[kind] = draft.draftConfig.model_retry[kind].filter(
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
    const queue = [...draft.draftConfig.model_retry[kind]];
    const [binding] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, binding);
    draft.draftConfig.model_retry[kind] = queue;
  }

  function dropRetryQueueModel(kind: RetryQueueKind, index: number, event: DragEvent) {
    event.preventDefault();
    if (draggedRetryQueue?.kind === kind) {
      moveRetryQueueModel(kind, draggedRetryQueue.index, index);
    }
    draggedRetryQueue = null;
  }

  // 鈹€鈹€鈹€ MCP helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  $effect(() => {
    if (!draft.initializedFromConfig) return;
    for (const provider of draft.draftConfig.providers) {
      const next = providerConnectionFingerprint(provider);
      const previous = providerConnectionFingerprints.get(provider.id);
      if (previous !== undefined && previous !== next && provider.enabled) {
        provider.enabled = false;
        repairDefaultModelBindings();
        providerStatus = {
          ...providerStatus,
          [provider.id]: {
            tone: "error",
            message: translation.current("configurationChangedReenable"),
          },
        };
      }
      providerConnectionFingerprints.set(provider.id, next);
    }
  });

  ensureSelectedProvider();
  onMount(() => {
    if (isTauri() && options.visibleSections.has("providers"))
      refreshChatgptAuthStatus().catch(() => {});
  });

  return {
    addManualModel,
    addProvider,
    addRetryQueueModel,
    get chatgptOAuthAuthenticated() {
      return chatgptOAuthAuthenticated;
    },
    deleteConfiguredModel,
    get draggedRetryQueue() {
      return draggedRetryQueue;
    },
    set draggedRetryQueue(value) {
      draggedRetryQueue = value;
    },
    dropRetryQueueModel,
    enabledProviderOptions,
    ensureSelectedProvider,
    fetchModels,
    get filteredModels() {
      return filteredModels;
    },
    get filteredProviders() {
      return filteredProviders;
    },
    getProviderPreviewUrl,
    getProviderUrl,
    getStatus,
    logoutChatgpt,
    get manualModelName() {
      return manualModelName;
    },
    set manualModelName(value) {
      manualModelName = value;
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
    modelConfigUsesResponsesReasoning,
    modelConfigValidationError,
    get modelLoading() {
      return modelLoading;
    },
    get modelSearch() {
      return modelSearch;
    },
    set modelSearch(value) {
      modelSearch = value;
    },
    get openAiApiModeOptions() {
      return openAiApiModeOptions;
    },
    openModelConfig,
    get providerFilter() {
      return providerFilter;
    },
    set providerFilter(value) {
      providerFilter = value;
    },
    providerModels,
    get providerSearch() {
      return providerSearch;
    },
    set providerSearch(value) {
      providerSearch = value;
    },
    refreshChatgptAuthStatus,
    removeProvider,
    removeRetryQueueModel,
    saveModelConfig,
    selectBindingProvider,
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
    setDefaultModel,
    setOpenAiApiMode,
    setProviderEnabled,
    startRetryQueueDrag,
    testProvider,
    updateRetryDelaySeconds,
  };
}
export type ProviderSettings = ReturnType<typeof createProviderSettings>;
