import type {
  ChatMessage,
  CheckpointTurnMetadata,
  CheckpointTurnStatus,
  StreamItem,
} from "./types";

export function latestTurnMetadata(messages: ChatMessage[]): CheckpointTurnMetadata | undefined {
  return messages.findLast((message) => message.turn)?.turn;
}

/** The authored input, not an execution or provider round, bounds a logical Turn. */
export function currentTurnMessages(messages: ChatMessage[]): ChatMessage[] {
  const input = messages.findLastIndex(
    (message) => message.role === "user" && !message.tags?.includes("context_compaction"),
  );
  return messages.slice(Math.max(0, input));
}

export function turnClock(messages: ChatMessage[]) {
  const current = currentTurnMessages(messages);
  const turn = latestTurnMetadata(current);
  return {
    startedAt: turn?.started_at ?? current.find((message) => message.role === "user")?.timestamp,
    firstTokenAt:
      turn?.first_token_at ?? current.find((message) => message.firstTokenAt != null)?.firstTokenAt,
  };
}

export function hasPendingHumanInput(items: StreamItem[]): boolean {
  return items.some(
    (item) =>
      (item.type === "user_input" && item.state === "pending") ||
      (item.type === "tool_call" && item.approval?.state === "pending"),
  );
}

export function assistantTurnStatus(
  messages: ChatMessage[],
  isStreaming: boolean,
): CheckpointTurnStatus {
  if (isStreaming) return "running";
  return (
    latestTurnMetadata(messages)?.status ??
    messages.findLast((message) => message.transientTurnStatus)?.transientTurnStatus ??
    "completed"
  );
}

export function shouldShowProcessRecords(
  status: CheckpointTurnStatus,
  processRecordCount: number,
): boolean {
  return status === "completed" && processRecordCount > 0;
}
