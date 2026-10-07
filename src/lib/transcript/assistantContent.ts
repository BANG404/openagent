import type { ChatMessage, StreamItem, TaskTokenUsage } from "$lib/types";
import type { MessageRenderEntry } from "$lib/toolCallGroups";
import { latestTurnMetadata } from "$lib/processRecordState";
import { summarizeCacheUsages } from "$lib/cacheUsage";

export function isCompactionReplayUser(msg: ChatMessage) {
  return msg.role === "user" && msg.tags?.includes("context_compaction") === true;
}
export function entryAssistantMessages(entry: MessageRenderEntry): ChatMessage[] {
  if (entry.kind === "assistant_turn") {
    return entry.messages.filter((message) => message.role === "assistant");
  }
  if (entry.kind === "message" && entry.msg.role === "assistant") return [entry.msg];
  return [];
}

export function assistantItems(
  entry: MessageRenderEntry,
  currentStreamItems: StreamItem[],
  activeConvId: string | null,
  activeBranchId: string | null,
): StreamItem[] {
  if (entry.kind === "live_stream") return currentStreamItems;
  if (entry.kind === "assistant_turn") {
    return entry.messages.flatMap((message) => {
      // A durable turn is grouped with the replay that opens it, so its
      // boundary belongs to a finished reply and stays mounted.
      if (isCompactionReplayUser(message)) return [{ type: "compaction_boundary" as const }];
      if (message.role === "ui" && message.ui)
        return [
          {
            type: "ui" as const,
            ui: message.ui,
            messageId: message.id,
            conversationId: activeConvId,
            branchId: activeBranchId,
          },
        ];
      if (message.role !== "assistant") return [];
      return message.items?.length
        ? message.items
        : message.content
          ? [{ type: "text" as const, content: message.content }]
          : [];
    });
  }
  return entryAssistantMessages(entry).flatMap((message) =>
    message.items?.length
      ? message.items
      : message.content
        ? [{ type: "text" as const, content: message.content }]
        : [],
  );
}

export function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))}ms`;
  if (milliseconds < 60_000)
    return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
  const seconds = Math.round(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function runTiming(
  msg: ChatMessage,
  msgIdx: number,
  turnMessages: ChatMessage[],
  messages: ChatMessage[],
) {
  const turn = latestTurnMetadata(turnMessages);
  if (turn) {
    if (turn.duration_ms == null) return null;
    return {
      firstToken:
        turn.first_token_at != null ? formatDuration(turn.first_token_at - turn.started_at) : null,
      total: formatDuration(turn.duration_ms),
    };
  }
  if (!msg.completedAt) return null;
  const userMessage = [...messages.slice(0, msgIdx)]
    .reverse()
    .find((item) => item.role === "user" && !isCompactionReplayUser(item));
  if (!userMessage) return null;
  return {
    firstToken: msg.firstTokenAt ? formatDuration(msg.firstTokenAt - userMessage.timestamp) : null,
    total: formatDuration(msg.completedAt - userMessage.timestamp),
  };
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatTokens(tokens: number): string {
  return new Intl.NumberFormat([], { notation: "compact", maximumFractionDigits: 1 }).format(
    tokens,
  );
}

export function formatPercent(rate: number): string {
  return new Intl.NumberFormat([], { style: "percent", maximumFractionDigits: 1 }).format(rate);
}

export function cacheUsageForMessage(
  message: ChatMessage,
  taskUsagesByCheckpointId: Record<string, TaskTokenUsage[]>,
) {
  if (!message.checkpointId) return null;
  const usages = taskUsagesByCheckpointId[message.checkpointId];
  return usages?.length ? summarizeCacheUsages(usages) : null;
}
