import type { ChatTaskUsage, CheckpointTurnMetadata, TaskTokenUsage } from "$lib/types";

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
  taskUsages: readonly ChatTaskUsage[],
  checkpoints: readonly { checkpointId: string; turn?: CheckpointTurnMetadata }[] = [],
): Record<string, TaskTokenUsage[]> {
  const byCheckpoint: Record<string, TaskTokenUsage[]> = {};
  const checkpointIds = new Set(checkpoints.map((checkpoint) => checkpoint.checkpointId));
  const terminalTurns = checkpoints.filter(
    (checkpoint): checkpoint is { checkpointId: string; turn: CheckpointTurnMetadata } =>
      checkpoint.turn?.completed_at != null,
  );
  for (const trace of taskUsages) {
    if (!trace.checkpoint_id) continue;

    let checkpointId = trace.checkpoint_id;
    if (!checkpointIds.has(checkpointId) && terminalTurns.length > 0) {
      const traceSecondStart = trace.created_at * 1_000;
      const traceSecondEnd = traceSecondStart + 999;
      const matchingTurns = terminalTurns.filter(
        ({ turn }) =>
          turn.started_at <= traceSecondEnd &&
          turn.completed_at != null &&
          turn.completed_at >= traceSecondStart,
      );
      if (matchingTurns.length !== 1) continue;
      checkpointId = matchingTurns[0].checkpointId;
    }

    (byCheckpoint[checkpointId] ??= []).push(trace.usage);
  }
  return byCheckpoint;
}
