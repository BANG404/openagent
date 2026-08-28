// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  chatTaskUsagesByCheckpoint,
  summarizeCacheUsage,
  summarizeCacheUsages,
} from "../src/lib/cacheUsage";
import type { TaskTokenUsage, TaskTrace } from "../src/lib/types";

function usage(overrides: Partial<TaskTokenUsage>): TaskTokenUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    tool_use_prompt_tokens: 0,
    reasoning_tokens: 0,
    ...overrides,
  };
}

function trace(overrides: Partial<TaskTrace>): TaskTrace {
  return {
    id: crypto.randomUUID(),
    conv_id: "conversation-a",
    session_id: "session-a",
    checkpoint_id: "checkpoint-a",
    task_kind: "chat_request",
    model: "model-a",
    system_prompt: "",
    tools: "[]",
    prompt: "",
    completion: null,
    status: "completed",
    error: null,
    usage: usage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 }),
    created_at: 1,
    ...overrides,
  };
}

describe("cache usage normalization", () => {
  test("uses provider input totals when cached tokens are included in input", () => {
    expect(
      summarizeCacheUsage(
        usage({
          input_tokens: 100,
          output_tokens: 10,
          total_tokens: 110,
          cached_input_tokens: 80,
        }),
      ),
    ).toEqual({
      kind: "available",
      inputTokens: 100,
      cachedTokens: 80,
      writtenTokens: 0,
      readRate: 0.8,
      writeRate: 0,
    });
  });

  test("uses provider input totals when cached tokens are reported separately", () => {
    expect(
      summarizeCacheUsage(
        usage({
          input_tokens: 20,
          output_tokens: 10,
          total_tokens: 110,
          cached_input_tokens: 80,
        }),
      ),
    ).toEqual({
      kind: "available",
      inputTokens: 100,
      cachedTokens: 80,
      writtenTokens: 0,
      readRate: 0.8,
      writeRate: 0,
    });
  });

  test("reports cache reads and writes against the same provider input total", () => {
    expect(
      summarizeCacheUsage(
        usage({
          input_tokens: 10,
          output_tokens: 10,
          total_tokens: 110,
          cached_input_tokens: 70,
          cache_creation_input_tokens: 20,
        }),
      ),
    ).toEqual({
      kind: "available",
      inputTokens: 100,
      cachedTokens: 70,
      writtenTokens: 20,
      readRate: 0.7,
      writeRate: 0.2,
    });
  });

  test("does not mistake zero cache counters for a measured zero-percent hit rate", () => {
    expect(
      summarizeCacheUsage(usage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 })),
    ).toEqual({ kind: "no_activity" });
  });

  test("rejects cache percentages when provider totals do not reconcile", () => {
    expect(
      summarizeCacheUsage(
        usage({
          input_tokens: 20,
          output_tokens: 10,
          total_tokens: 90,
          cached_input_tokens: 80,
        }),
      ),
    ).toEqual({ kind: "unavailable", cachedTokens: 80, writtenTokens: 0 });
  });

  test("aggregates mixed provider accounting across one logical turn", () => {
    expect(
      summarizeCacheUsages([
        usage({
          input_tokens: 100,
          output_tokens: 10,
          total_tokens: 110,
          cached_input_tokens: 80,
        }),
        usage({
          input_tokens: 20,
          output_tokens: 10,
          total_tokens: 110,
          cached_input_tokens: 80,
        }),
      ]),
    ).toEqual({
      kind: "available",
      inputTokens: 200,
      cachedTokens: 160,
      writtenTokens: 0,
      readRate: 0.8,
      writeRate: 0,
    });
  });

  test("groups only persisted chat requests for the selected conversation", () => {
    const selected = usage({
      input_tokens: 100,
      output_tokens: 10,
      total_tokens: 110,
      cached_input_tokens: 80,
    });
    expect(
      chatTaskUsagesByCheckpoint(
        [
          trace({ usage: selected }),
          trace({ id: "second", usage: selected }),
          trace({ id: "other-conversation", conv_id: "conversation-b", usage: selected }),
          trace({ id: "other-task", task_kind: "flash_title", usage: selected }),
          trace({ id: "missing-usage", usage: null }),
        ],
        "conversation-a",
      ),
    ).toEqual({ "checkpoint-a": [selected, selected] });
  });

  test("associates temporary request checkpoints with the persisted terminal turn", () => {
    const selected = usage({
      input_tokens: 13_782,
      output_tokens: 229,
      total_tokens: 14_011,
      cached_input_tokens: 13_440,
    });

    expect(
      chatTaskUsagesByCheckpoint(
        [
          trace({
            checkpoint_id: "temporary-request-checkpoint",
            usage: selected,
            created_at: 1_787_935_749,
          }),
        ],
        "conversation-a",
        [
          {
            checkpointId: "terminal-checkpoint",
            turn: {
              id: "assistant-message",
              input_message_id: "user-message",
              response_message_id: "assistant-message",
              status: "completed",
              started_at: 1_787_935_749_531,
              completed_at: 1_787_935_755_407,
              duration_ms: 5_876,
            },
          },
        ],
      ),
    ).toEqual({ "terminal-checkpoint": [selected] });
  });

  test("does not guess when a coarse trace timestamp overlaps multiple turns", () => {
    const selected = usage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 });

    expect(
      chatTaskUsagesByCheckpoint(
        [trace({ checkpoint_id: "temporary", usage: selected, created_at: 10 })],
        "conversation-a",
        [
          {
            checkpointId: "first",
            turn: {
              id: "first",
              input_message_id: "first-user",
              response_message_id: "first",
              status: "completed",
              started_at: 9_800,
              completed_at: 10_400,
            },
          },
          {
            checkpointId: "second",
            turn: {
              id: "second",
              input_message_id: "second-user",
              response_message_id: "second",
              status: "completed",
              started_at: 10_500,
              completed_at: 11_200,
            },
          },
        ],
      ),
    ).toEqual({});
  });
});
