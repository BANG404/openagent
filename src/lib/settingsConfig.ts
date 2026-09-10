import type {
  AppConfig,
  DefaultModelBinding,
  McpServerConfig,
  OpenAiApiMode,
  ProviderConfig,
} from "$lib/types";
import { providerCatalogEntry, providerDefaultBaseUrl } from "$lib/providerCatalog";

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
    name: "",
    provider,
    api_key: "",
    base_url: "",
    openai_api_mode: "responses",
    enabled: false,
    models: [],
    model_context_compaction_thresholds: {},
    model_reasoning_efforts: {},
    model_reasoning_effort_enabled: {},
    model_vision_enabled: {},
  };
}

export function providerServiceName(provider: ProviderConfig): string {
  const explicitName = provider.name.trim();
  if (explicitName) return explicitName;

  const requestUrl = provider.base_url.trim() || providerDefaultBaseUrl(provider.provider);
  try {
    return new URL(requestUrl).hostname || providerCatalogEntry(provider.provider).label;
  } catch {
    return providerCatalogEntry(provider.provider).label;
  }
}

export function providerConnectionFingerprint(provider: ProviderConfig): string {
  return JSON.stringify([
    provider.provider,
    provider.api_key,
    provider.base_url,
    provider.openai_api_mode,
  ]);
}

export function normalizeOpenAiBaseUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return "https://api.openai.com/v1";
  for (const suffix of ["/chat/completions", "/responses", "/models"]) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length).replace(/\/+$/, "");
      break;
    }
  }
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

export function openAiRequestUrl(baseUrl: string, mode: OpenAiApiMode): string {
  const suffix = mode === "chat_completions" ? "/chat/completions" : "/responses";
  return `${normalizeOpenAiBaseUrl(baseUrl)}${suffix}`;
}

export function providerRequestUrl(provider: ProviderConfig): string {
  const baseUrl = provider.base_url.trim() || providerDefaultBaseUrl(provider.provider);
  if (provider.provider !== "openai") return baseUrl;
  return openAiRequestUrl(baseUrl, provider.openai_api_mode ?? "responses");
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
  provider.model_reasoning_effort_enabled = Object.fromEntries(
    Object.entries(provider.model_reasoning_effort_enabled ?? {}).filter(
      ([model, enabled]) => models.includes(model) && enabled,
    ),
  );
  provider.model_vision_enabled = Object.fromEntries(
    Object.entries(provider.model_vision_enabled ?? {}).filter(
      ([model, enabled]) => models.includes(model) && enabled,
    ),
  );
}

export function applyFetchedProviderModels(provider: ProviderConfig, models: string[]): boolean {
  return applyDetectedProviderModels(provider, models, true);
}

export function applyDetectedProviderModels(
  provider: ProviderConfig,
  models: string[],
  succeeded: boolean,
): boolean {
  replaceProviderModels(provider, models);
  provider.enabled = succeeded && models.length > 0;
  return provider.enabled;
}

export function selectModelBindingProvider(
  config: AppConfig,
  binding: DefaultModelBinding,
  providerId: string,
): void {
  const provider = config.providers.find(
    (item) => item.id === providerId && item.enabled && item.models.length > 0,
  );
  binding.provider_id = provider?.id ?? "";
  binding.model = provider?.models[0] ?? "";
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
