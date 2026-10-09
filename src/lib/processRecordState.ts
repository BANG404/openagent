import type { ChatMessage, CheckpointTurnMetadata, CheckpointTurnStatus } from "./types";

export function latestTurnMetadata(messages: ChatMessage[]): CheckpointTurnMetadata | undefined {
  return messages.findLast((message) => message.turn)?.turn;
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
