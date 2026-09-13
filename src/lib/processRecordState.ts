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

/** Turn states that can still append records, either live or on resume. */
const ACTIVE_TURN_STATUSES: ReadonlySet<CheckpointTurnStatus> = new Set(["running", "interrupted"]);

/**
 * Thinking follows the transcript's auto-collapse rule: only a turn's trailing
 * record — the one still being produced — stays open while that turn can still
 * append records. As soon as a later record arrives the block collapses, and an
 * explicit reader toggle is the only way back. `carriedOver` is the finalization
 * handoff from the live stream, which keeps the record that stream left open
 * expanded once the turn settles.
 */
export function thinkingRecordOpen(
  isTrailingRecord: boolean,
  status: CheckpointTurnStatus,
  carriedOver: boolean,
): boolean {
  return carriedOver || (ACTIVE_TURN_STATUSES.has(status) && isTrailingRecord);
}
