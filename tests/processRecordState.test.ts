import { describe, expect, test } from "bun:test";
import {
  assistantTurnStatus,
  latestTurnMetadata,
  shouldShowProcessRecords,
  thinkingRecordOpen,
} from "../src/lib/processRecordState";
import type { ChatMessage, CheckpointTurnStatus } from "../src/lib/types";

function assistant(
  id: string,
  status?: CheckpointTurnStatus,
  transientTurnStatus?: CheckpointTurnStatus,
): ChatMessage {
  return {
    id,
    role: "assistant",
    content: "",
    timestamp: 0,
    transientTurnStatus,
    turn: status
      ? {
          id,
          input_message_id: "user-1",
          response_message_id: id,
          status,
          started_at: 0,
        }
      : undefined,
  };
}

describe("process record state", () => {
  test("uses the latest durable status across interrupt and resume records", () => {
    const messages = [assistant("interrupt", "interrupted"), assistant("resume", "completed")];

    expect(latestTurnMetadata(messages)?.status).toBe("completed");
    expect(assistantTurnStatus(messages, false)).toBe("completed");
  });

  test("retains an optimistic interrupted status until checkpoint reconciliation", () => {
    expect(assistantTurnStatus([assistant("interrupt", undefined, "interrupted")], false)).toBe(
      "interrupted",
    );
  });

  test("treats an active stream as running even with a durable prefix", () => {
    expect(assistantTurnStatus([assistant("prefix", "interrupted")], true)).toBe("running");
  });

  test("shows process records only for completed turns", () => {
    expect(shouldShowProcessRecords("completed", 1)).toBe(true);
    expect(shouldShowProcessRecords("completed", 0)).toBe(false);
    expect(shouldShowProcessRecords("running", 1)).toBe(false);
    expect(shouldShowProcessRecords("interrupted", 1)).toBe(false);
    expect(shouldShowProcessRecords("cancelled", 1)).toBe(false);
    expect(shouldShowProcessRecords("failed", 1)).toBe(false);
  });
});

describe("thinking record disclosure", () => {
  test("keeps only the trailing record of a running turn open", () => {
    expect(thinkingRecordOpen(true, "running", false)).toBe(true);
    expect(thinkingRecordOpen(false, "running", false)).toBe(false);
  });

  test("collapses every record once the turn is no longer producing output", () => {
    for (const status of ["completed", "failed", "cancelled"] as const) {
      expect(thinkingRecordOpen(true, status, false)).toBe(false);
      expect(thinkingRecordOpen(false, status, false)).toBe(false);
    }
  });

  test("keeps an interrupted turn's trailing record open", () => {
    expect(thinkingRecordOpen(true, "interrupted", false)).toBe(true);
    expect(thinkingRecordOpen(false, "interrupted", false)).toBe(false);
  });

  test("honors the record the live stream left open across finalization", () => {
    expect(thinkingRecordOpen(false, "completed", true)).toBe(true);
  });
});
