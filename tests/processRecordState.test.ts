// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  assistantTurnStatus,
  latestTurnMetadata,
  processRecordsDefaultOpen,
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

  test("opens every non-completed process state", () => {
    expect(processRecordsDefaultOpen("running")).toBe(true);
    expect(processRecordsDefaultOpen("interrupted")).toBe(true);
    expect(processRecordsDefaultOpen("cancelled")).toBe(true);
    expect(processRecordsDefaultOpen("failed")).toBe(true);
    expect(processRecordsDefaultOpen("completed")).toBe(false);
  });
});
