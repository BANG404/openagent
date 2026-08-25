import { decodeModelBinding, encodeModelBinding } from "$lib/modelBinding";
import { invoke } from "$lib/openagent/tauriClient";
import { showToast } from "$lib/toast";
import { tr } from "$lib/i18n";
import type { AppConfig, ApprovalMode, DefaultModelBinding, ReasoningEffort } from "$lib/types";

type ComposerPreferencesDependencies = {
  getConfig: () => AppConfig | null;
  setConfig: (config: AppConfig) => void;
  loadSettings: () => Promise<void>;
  saveSettings: (next: AppConfig, base: AppConfig, reportError: boolean) => Promise<AppConfig>;
  tauriAvailable: boolean;
};

export class ComposerPreferences {
  selectedModel = $state("");
  #defaultModelSaveQueue: Promise<void> = Promise.resolve();
  #reasoningEffortSaveQueue: Promise<void> = Promise.resolve();
  #approvalModeSaveQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: ComposerPreferencesDependencies) {}

  get modelOptions() {
    return (this.dependencies.getConfig()?.providers ?? [])
      .filter((provider) => provider.enabled)
      .flatMap((provider) =>
        provider.models.map((model) => ({
          value: encodeModelBinding(provider.id, model),
          label: `${model} · ${provider.name}`,
          selectedLabel: model,
        })),
      );
  }

  get selectedProvider() {
    const binding = decodeModelBinding(this.selectedModel);
    if (!binding) return null;
    return (
      this.dependencies
        .getConfig()
        ?.providers.find((provider) => provider.id === binding.providerId) ?? null
    );
  }

  get selectedReasoningEffort(): ReasoningEffort {
    const binding = decodeModelBinding(this.selectedModel);
    if (!binding || !this.selectedProvider) return "medium";
    return this.selectedProvider.model_reasoning_efforts?.[binding.model] ?? "medium";
  }

  get selectedModelSupportsReasoning(): boolean {
    const binding = decodeModelBinding(this.selectedModel);
    return Boolean(
      binding &&
      this.selectedProvider &&
      (this.selectedProvider.provider === "chatgpt" ||
        this.selectedProvider.model_reasoning_effort_enabled?.[binding.model]),
    );
  }

  syncFromConfig(): void {
    const config = this.dependencies.getConfig();
    if (!config) return;
    const fallback = encodeModelBinding(
      config.defaults.chat_model.provider_id,
      config.defaults.chat_model.model,
    );
    const next = this.modelOptions.some((option) => option.value === fallback)
      ? fallback
      : (this.modelOptions[0]?.value ?? "");
    if (this.selectedModel !== next) this.selectedModel = next;
  }

  #updateDefaultChatModel(binding: DefaultModelBinding): void {
    const config = this.dependencies.getConfig();
    if (!config) return;
    this.dependencies.setConfig({
      ...config,
      defaults: { ...config.defaults, chat_model: binding },
    });
  }

  handleModelChange = (value: string): void => {
    const binding = decodeModelBinding(value);
    const config = this.dependencies.getConfig();
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
    this.#updateDefaultChatModel(requestedBinding);
    if (!this.dependencies.tauriAvailable) return;
    this.#defaultModelSaveQueue = this.#defaultModelSaveQueue.then(async () => {
      try {
        const saved = await invoke<DefaultModelBinding>("set_default_chat_model", {
          binding: requestedBinding,
        });
        if (this.selectedModel === value) this.#updateDefaultChatModel(saved);
      } catch (error) {
        console.error("Failed to save default chat model:", error);
        if (this.selectedModel === value) {
          await this.dependencies.loadSettings();
          alert(`Save failed: ${error}`);
        }
      }
    });
  };

  #updateReasoningEffort(providerId: string, model: string, effort: ReasoningEffort): void {
    const config = this.dependencies.getConfig();
    if (!config) return;
    this.dependencies.setConfig({
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
    });
  }

  handleReasoningEffortChange = (effort: ReasoningEffort): void => {
    const binding = decodeModelBinding(this.selectedModel);
    if (!binding || !this.selectedModelSupportsReasoning) return;
    this.#updateReasoningEffort(binding.providerId, binding.model, effort);
    if (!this.dependencies.tauriAvailable) return;
    const requestedModel = this.selectedModel;
    this.#reasoningEffortSaveQueue = this.#reasoningEffortSaveQueue.then(async () => {
      try {
        const saved = await invoke<ReasoningEffort>("set_model_reasoning_effort", {
          providerId: binding.providerId,
          model: binding.model,
          effort,
        });
        if (this.selectedModel === requestedModel) {
          this.#updateReasoningEffort(binding.providerId, binding.model, saved);
        }
      } catch (error) {
        console.error("Failed to save model reasoning effort:", error);
        if (this.selectedModel === requestedModel) {
          await this.dependencies.loadSettings();
          showToast({ title: String(error), variant: "error" });
        }
      }
    });
  };

  handleApprovalModeChange = (mode: ApprovalMode): void => {
    this.#approvalModeSaveQueue = this.#approvalModeSaveQueue.then(async () => {
      try {
        const config = this.dependencies.getConfig();
        if (!config || config.approval_mode === mode) return;
        const base = structuredClone($state.snapshot(config)) as AppConfig;
        const next = { ...base, approval_mode: mode };
        this.dependencies.setConfig(next);
        await this.dependencies.saveSettings(next, base, false);
      } catch (error) {
        await this.dependencies.loadSettings().catch((reloadError) => {
          console.error("Failed to reload settings after approval mode save failure:", reloadError);
        });
        showToast({
          title: tr("approvalModeSaveFailed"),
          description: String(error),
          variant: "error",
        });
      }
    });
  };
}
