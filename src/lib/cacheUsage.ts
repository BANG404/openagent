import type { TaskTokenUsage } from "$lib/types";

export type CacheUsageSummary =
  | {
      kind: "available";
      inputTokens: number;
      readRate: number;
      writeRate: number;
    }
  | { kind: "no_activity" }
  | { kind: "unavailable" };

export function summarizeCacheUsage(usage: TaskTokenUsage): CacheUsageSummary {
  const cached = usage.cached_input_tokens;
  const created = usage.cache_creation_input_tokens;

  if (cached === 0 && created === 0) {
    return { kind: "no_activity" };
  }

  const providerInputTokens = usage.total_tokens - usage.output_tokens;
  const inputIncludesCache = providerInputTokens === usage.input_tokens;
  const inputSeparatesCache = providerInputTokens === usage.input_tokens + cached + created;

  if (
    providerInputTokens <= 0 ||
    cached < 0 ||
    created < 0 ||
    (!inputIncludesCache && !inputSeparatesCache)
  ) {
    return { kind: "unavailable" };
  }

  return {
    kind: "available",
    inputTokens: providerInputTokens,
    readRate: cached / providerInputTokens,
    writeRate: created / providerInputTokens,
  };
}
