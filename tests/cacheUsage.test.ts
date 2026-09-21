import { describe, expect, test } from "bun:test";
import {
  chatTaskUsagesByCheckpoint,
  latestContextUsageTokens,
  summarizeCacheUsage,
  summarizeCacheUsages,
} from "../src/lib/cacheUsage";
import type { ChatTaskUsage, TaskTokenUsage } from "../src/lib/types";

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

function taskUsage(overrides: Partial<ChatTaskUsage>): ChatTaskUsage {
  return {
    checkpoint_id: "checkpoint-a",
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

  test("uses separately reported input when total tokens are omitted", () => {
    expect(
      summarizeCacheUsage(
        usage({
          input_tokens: 0,
          output_tokens: 256,
          total_tokens: 0,
          cached_input_tokens: 12_000,
          cache_creation_input_tokens: 500,
        }),
      ),
    ).toEqual({
      kind: "available",
      inputTokens: 12_500,
      cachedTokens: 12_000,
      writtenTokens: 500,
      readRate: 12_000 / 12_500,
      writeRate: 500 / 12_500,
    });
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

  test("groups the server-scoped persisted chat usage projection", () => {
    const selected = usage({
      input_tokens: 100,
      output_tokens: 10,
      total_tokens: 110,
      cached_input_tokens: 80,
    });
    expect(
      chatTaskUsagesByCheckpoint([
        taskUsage({ usage: selected }),
        taskUsage({ usage: selected }),
        taskUsage({ checkpoint_id: null, usage: selected }),
      ]),
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
          taskUsage({
            checkpoint_id: "temporary-request-checkpoint",
            usage: selected,
            created_at: 1_787_935_749,
          }),
        ],
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
        [taskUsage({ checkpoint_id: "temporary", usage: selected, created_at: 10 })],
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

describe("composer context usage", () => {
  test("reports the newest measurement on the active path", () => {
    expect(
      latestContextUsageTokens(["first", "second"], {
        first: [usage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 })],
        second: [usage({ input_tokens: 400, output_tokens: 40, total_tokens: 440 })],
      }),
    ).toBe(400);
  });

  test("falls back to the nearest ancestor while the tip turn streams", () => {
    expect(
      latestContextUsageTokens(["first", "second", "streaming"], {
        first: [usage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 })],
        second: [usage({ input_tokens: 400, output_tokens: 40, total_tokens: 440 })],
      }),
    ).toBe(400);
  });

  test("keeps walking when a checkpoint has no measured input yet", () => {
    expect(
      latestContextUsageTokens(["first", "second"], {
        first: [usage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 })],
        second: [usage({ input_tokens: 0, output_tokens: 0, total_tokens: 0 })],
      }),
    ).toBe(100);
  });

  test("uses the newest round of the selected checkpoint", () => {
    expect(
      latestContextUsageTokens(["first"], {
        first: [
          usage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 }),
          usage({ input_tokens: 250, output_tokens: 25, total_tokens: 275 }),
        ],
      }),
    ).toBe(250);
  });

  test("reports nothing before the first measurement", () => {
    expect(latestContextUsageTokens([], {})).toBeNull();
    expect(latestContextUsageTokens(["first"], {})).toBeNull();
  });
});

describe("completed-turn cache usage", () => {
  test("loads and renders usage in production builds", async () => {
    const [routeSource, messageListSource] = await Promise.all([
      Bun.file(new URL("../src/routes/+page.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/lib/components/MessageList.svelte", import.meta.url)).text(),
    ]);

    expect(routeSource).toContain("if (!tauriAvailable) return;");
    expect(routeSource).not.toContain("if (!isDebugBuild || !tauriAvailable) return;");
    expect(routeSource).toContain('openAgent.invokeProduct("get_chat_task_usages", { convId })');
    expect(routeSource).toContain("void refreshTaskUsagesForConversation(convId);");
    expect(
      await Bun.file(new URL("../src/lib/components/MessageInput.svelte", import.meta.url)).text(),
    ).toContain("(!contextUsage && !isStreaming)");
    expect(routeSource).not.toContain('invoke<ChatTaskUsage[]>("get_chat_task_usages"');
    expect(routeSource).not.toContain('invoke<TaskTrace[]>("get_task_traces")');
    expect(messageListSource).toContain("if (!message.checkpointId) return null;");
    expect(messageListSource).not.toContain("if (!devMode || !message.checkpointId) return null;");
    expect(messageListSource).toContain("isCompactionReplayUser(msg) && !liveCompactionDivider");
    expect(messageListSource).toContain(
      'currentStreamItems.some(\n        (item) => item.type === "compaction" || item.type === "compaction_boundary",\n      )',
    );
  });
});

describe("streaming-turn indicators", () => {
  test("keeps the composer usage indicator and compaction divider mounted while streaming", async () => {
    const [routeSource, surfaceSource, streamRendererSource] = await Promise.all([
      Bun.file(new URL("../src/routes/+page.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/lib/components/ConversationSurface.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/lib/components/StreamItemRenderer.svelte", import.meta.url)).text(),
    ]);

    // The composer indicator walks the active path for the newest measurement,
    // so a turn whose checkpoint is still pending keeps reporting usage.
    expect(surfaceSource).not.toContain("if (view.isStreaming) return null;");
    expect(surfaceSource).toContain("ckIdsAlongActivePath(view.activeTree)");
    // A successful compaction mounts its divider for the rest of the turn and
    // hands the same boundary to the durable replay at reconciliation.
    expect(routeSource).toContain("completeCompactionProgress(previousItems)");
    expect(routeSource).toContain(
      "clearCompactionProgress(chatStreams.itemsByConversation[convId] ?? [])",
    );
    // The optimistic marker must not be persisted: the reconciled replay owns
    // the boundary once the turn is durable.
    expect(routeSource).toContain(
      'const durableItems = items.filter((item) => item.type !== "compaction_boundary");',
    );
    expect(streamRendererSource).toContain('{:else if item.type === "compaction_boundary"}');
    expect(streamRendererSource).not.toContain(
      'item.type === "compaction_boundary" && !isStreaming',
    );
  });
});
