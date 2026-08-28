import type { TaskTokenUsage, TaskTrace } from "$lib/types";

export type CacheUsageSummary =
  | {
      kind: "available";
      inputTokens: number;
      cachedTokens: number;
      writtenTokens: number;
      readRate: number;
      writeRate: number;
    }
  | { kind: "no_activity" }
  | { kind: "unavailable"; cachedTokens: number; writtenTokens: number };

export function summarizeCacheUsage(usage: TaskTokenUsage): CacheUsageSummary {
  return summarizeCacheUsages([usage]);
}

export function summarizeCacheUsages(usages: readonly TaskTokenUsage[]): CacheUsageSummary {
  let inputTokens = 0;
  let cachedTokens = 0;
  let writtenTokens = 0;
  let reconciled = usages.length > 0;

  for (const usage of usages) {
    const cached = usage.cached_input_tokens;
    const created = usage.cache_creation_input_tokens;
    const providerInputTokens = usage.total_tokens - usage.output_tokens;
    const inputIncludesCache = providerInputTokens === usage.input_tokens;
    const inputSeparatesCache = providerInputTokens === usage.input_tokens + cached + created;

    cachedTokens += cached;
    writtenTokens += created;
    inputTokens += providerInputTokens;
    reconciled &&=
      providerInputTokens > 0 &&
      cached >= 0 &&
      created >= 0 &&
      (inputIncludesCache || inputSeparatesCache);
  }

  if (cachedTokens === 0 && writtenTokens === 0) {
    return { kind: "no_activity" };
  }

  if (!reconciled) {
    return { kind: "unavailable", cachedTokens, writtenTokens };
  }

  return {
    kind: "available",
    inputTokens,
    cachedTokens,
    writtenTokens,
    readRate: cachedTokens / inputTokens,
    writeRate: writtenTokens / inputTokens,
  };
}

export function chatTaskUsagesByCheckpoint(
  traces: readonly TaskTrace[],
  conversationId: string,
): Record<string, TaskTokenUsage[]> {
  const byCheckpoint: Record<string, TaskTokenUsage[]> = {};
  for (const trace of traces) {
    if (
      trace.conv_id !== conversationId ||
      trace.task_kind !== "chat_request" ||
      !trace.checkpoint_id ||
      !trace.usage
    ) {
      continue;
    }
    (byCheckpoint[trace.checkpoint_id] ??= []).push(trace.usage);
  }
  return byCheckpoint;
}
