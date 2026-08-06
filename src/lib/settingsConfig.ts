import type { AppConfig, McpServerConfig, ProviderConfig } from "$lib/types";
import { providerCatalogEntry } from "$lib/providerCatalog";

export type RetryQueueKind = "chat_queue" | "flash_queue";

export function settingsConfigChanged(config: AppConfig, acceptedFingerprint: string): boolean {
  return JSON.stringify(config) !== acceptedFingerprint;
}

export function createProviderConfig(
  provider: ProviderConfig["provider"] = "openai",
  id: string = crypto.randomUUID(),
): ProviderConfig {
  return {
    id,
    name: `${providerCatalogEntry(provider).label} Node`,
    provider,
    api_key: "",
    base_url: "",
    enabled: false,
    models: [],
    model_context_compaction_thresholds: {},
    model_reasoning_efforts: {},
  };
}

export function providerConnectionFingerprint(provider: ProviderConfig): string {
  return JSON.stringify([provider.provider, provider.api_key, provider.base_url]);
}

export function mcpConnectionFingerprint(server: McpServerConfig): string {
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

export function replaceProviderModels(provider: ProviderConfig, models: string[]): void {
  provider.models = models;
  provider.model_context_compaction_thresholds = Object.fromEntries(
    Object.entries(provider.model_context_compaction_thresholds ?? {}).filter(([model]) =>
      models.includes(model),
    ),
  );
  provider.model_reasoning_efforts = Object.fromEntries(
    Object.entries(provider.model_reasoning_efforts ?? {}).filter(([model]) =>
      models.includes(model),
    ),
  );
}

export function applyFetchedProviderModels(provider: ProviderConfig, models: string[]): boolean {
  replaceProviderModels(provider, models);
  provider.enabled = models.length > 0;
  return provider.enabled;
}

export function repairModelBindings(config: AppConfig): void {
  const fallback = config.providers
    .filter((provider) => provider.enabled)
    .find((provider) => provider.models.length > 0);

  for (const kind of ["chat_model", "flash_model"] as const) {
    const binding = config.defaults[kind];
    const provider = config.providers.find((item) => item.id === binding.provider_id);
    if (!provider?.enabled || !provider.models.includes(binding.model)) {
      binding.provider_id = fallback?.id ?? "";
      binding.model = fallback?.models[0] ?? "";
    }
  }

  for (const kind of ["chat_queue", "flash_queue"] as const) {
    config.model_retry[kind] = config.model_retry[kind].filter((binding) => {
      const provider = config.providers.find((item) => item.id === binding.provider_id);
      return Boolean(provider?.enabled && provider.models.includes(binding.model));
    });
  }
}
