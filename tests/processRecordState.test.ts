// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  assistantTurnStatus,
  latestTurnMetadata,
  shouldShowProcessRecords,
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
