// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  appendLiveStreamEntry,
  groupAssistantTurns,
  groupMessageToolCalls,
  groupStreamItems,
  isAssistantTurnEntry,
  partitionAssistantSegments,
  shouldDisplayToolCall,
  toolCallStatus,
  type ToolCallItem,
} from "../src/lib/toolCallGroups";
import type { ChatMessage, StreamItem } from "../src/lib/types";

const call = (name: string, result?: string): ToolCallItem => ({
  type: "tool_call",
  name,
  args: "{}",
  ...(result === undefined ? {} : { result }),
});

const message = (id: string, item: StreamItem): ChatMessage => ({
  id,
  role: "assistant",
  content: "",
  timestamp: 0,
  items: [item],
});

describe("tool-call grouping", () => {
  test("groups only consecutive ordinary stream tool calls", () => {
    const segments = groupStreamItems([
      call("read_file", "ok"),
      call("grep", "ok"),
      { type: "text", content: "done" },
      call("write_file"),
    ]);

    expect(segments.map((segment) => segment.kind)).toEqual(["tool_group", "item", "item"]);
  });

  test("keeps render and approval tool calls outside groups but groups Goal updates", () => {
    const approval = {
      request: {
        request_id: "approval-1",
        conv_id: "conv-1",
        fields: [],
      },
      state: "pending" as const,
    };
    const segments = groupStreamItems([
      call("read_file"),
      { ...call("write_file"), approval },
      call("grep"),
      call("update_goal"),
      call("render_html"),
      call("render_mermaid"),
    ]);

    expect(segments.map((segment) => segment.kind)).toEqual([
      "item",
      "item",
      "tool_group",
      "item",
      "item",
    ]);
    expect(segments[2]).toMatchObject({
      kind: "tool_group",
      items: [{ name: "grep" }, { name: "update_goal" }],
    });
  });

  test("keeps every record from the first render outside the process fold", () => {
    const segments = groupStreamItems([
      { type: "thinking", content: "inspect" },
      { type: "text", content: "answer before render" },
      call("render_mermaid", '{"ok":true}'),
      { type: "thinking", content: "summarize" },
      call("update_goal", "updated"),
      { type: "text", content: "final answer" },
    ]);

    const partitioned = partitionAssistantSegments(segments);
    expect(partitioned.processSegments.map((segment) => segment.startIndex)).toEqual([0]);
    expect(partitioned.finalSegments.map((segment) => segment.startIndex)).toEqual([1, 2, 3, 4, 5]);
  });

  test("folds Goal updates that occur before the first render", () => {
    const segments = groupStreamItems([
      { type: "text", content: "updating goal" },
      call("update_goal", "updated"),
      { type: "thinking", content: "prepare preview" },
      call("render_html", '{"ok":true}'),
      call("read_file", "contents"),
      { type: "thinking", content: "inspect preview" },
      { type: "text", content: "final answer" },
    ]);

    const partitioned = partitionAssistantSegments(segments);
    expect(partitioned.processSegments.map((segment) => segment.startIndex)).toEqual([0, 1, 2]);
    expect(partitioned.finalSegments.map((segment) => segment.startIndex)).toEqual([3, 4, 5, 6]);
  });

  test("folds ordinary tools and every text message before the last one", () => {
    const segments = groupStreamItems([
      { type: "text", content: "before read" },
      call("read_file", "contents"),
      { type: "text", content: "before write" },
      call("write_file", "saved"),
      call("render_mermaid", '{"ok":true}'),
      { type: "text", content: "final answer" },
    ]);

    const partitioned = partitionAssistantSegments(segments);
    expect(partitioned.processSegments.map((segment) => segment.startIndex)).toEqual([0, 1, 2, 3]);
    expect(partitioned.finalSegments.map((segment) => segment.startIndex)).toEqual([4, 5]);
  });

  test("groups consecutive standalone calls restored from checkpoints", () => {
    const entries = groupMessageToolCalls([
      { msg: message("tool-1", call("read_file", "ok")), index: 3 },
      { msg: message("tool-2", call("grep", "ok")), index: 4 },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("tool_group");
    if (entries[0].kind === "tool_group") {
      expect(entries[0].items.map((item) => item.name)).toEqual(["read_file", "grep"]);
      expect(entries[0].index).toBe(3);
    }
  });

  test("reports running, successful, and conventional failed results", () => {
    expect(toolCallStatus(call("read_file"), true)).toBe("running");
    expect(toolCallStatus(call("read_file"), false)).toBe("pending");
    expect(toolCallStatus(call("read_file", "2 lines"), false)).toBe("success");
    expect(toolCallStatus(call("read_file", "Error: unavailable"), false)).toBe("failed");
    expect(toolCallStatus(call("read_file", '{"ok":false}'), false)).toBe("failed");
  });

  test("shows render previews only after a successful result", () => {
    expect(shouldDisplayToolCall(call("render_html", "Error: invalid document"), false)).toBe(
      false,
    );
    expect(shouldDisplayToolCall(call("render_mermaid", '{"ok":false}'), false)).toBe(false);
    expect(shouldDisplayToolCall(call("render_html"), true)).toBe(false);
    expect(shouldDisplayToolCall(call("render_mermaid"), false)).toBe(false);
    expect(shouldDisplayToolCall(call("render_html", '{"ok":true}'), false)).toBe(true);
    expect(shouldDisplayToolCall(call("render_mermaid", '{"ok":true}'), false)).toBe(true);
    expect(shouldDisplayToolCall(call("read_file", "Error: unavailable"), false)).toBe(true);
  });

  test("retains the transcript row key when a live stream becomes a completed message", () => {
    const assistantId = "assistant-1";
    const liveEntries = appendLiveStreamEntry([], assistantId);
    const completedEntries = groupAssistantTurns(
      groupMessageToolCalls([
        {
          msg: {
            id: assistantId,
            role: "assistant",
            content: "done",
            timestamp: 0,
          },
          index: 0,
        },
      ]),
    );

    expect(liveEntries).toEqual([{ kind: "live_stream", key: assistantId }]);
    expect(completedEntries[0]?.key).toBe(liveEntries[0]?.key);
    expect(isAssistantTurnEntry(liveEntries[0])).toBe(true);
    expect(isAssistantTurnEntry(completedEntries[0])).toBe(true);
  });

  test("uses the preallocated response message ID when Turn and message IDs differ", () => {
    const assistantId = "assistant-preallocated";
    const liveEntries = appendLiveStreamEntry([], assistantId);
    const completedEntries = groupAssistantTurns(
      groupMessageToolCalls([
        {
          msg: {
            id: assistantId,
            role: "assistant",
            content: "done",
            timestamp: 0,
            turn: {
              id: "logical-turn",
              input_message_id: "user-1",
              response_message_id: assistantId,
              status: "completed",
              started_at: 10,
              completed_at: 20,
              duration_ms: 10,
            },
          },
          index: 0,
        },
      ]),
    );

    expect(completedEntries[0]?.key).toBe(liveEntries[0]?.key);
  });

  test("keeps the original turn key when interrupt resume appends assistant records", () => {
    const entries = groupAssistantTurns(
      groupMessageToolCalls([
        {
          msg: {
            ...message("assistant-turn", call("ask_user", "answered")),
            turn: {
              id: "assistant-turn",
              input_message_id: "user-1",
              response_message_id: "assistant-turn",
              status: "completed",
              started_at: 10,
              completed_at: 30,
              duration_ms: 20,
            },
          },
          index: 1,
        },
        {
          msg: { id: "assistant-after-resume", role: "assistant", content: "done", timestamp: 30 },
          index: 2,
        },
      ]),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.key).toBe("assistant-turn");
  });

  test("collapses every durable record in one assistant reply into one turn row", () => {
    const entries = groupAssistantTurns(
      groupMessageToolCalls([
        {
          msg: { id: "user-1", role: "user", content: "question", timestamp: 0 },
          index: 0,
        },
        { msg: message("tool-1", call("read_file", "ok")), index: 1 },
        { msg: message("tool-2", call("grep", "ok")), index: 2 },
        {
          msg: { id: "assistant-final", role: "assistant", content: "done", timestamp: 0 },
          index: 3,
        },
      ]),
    );

    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      kind: "assistant_turn",
      key: "assistant-final",
      finalIndex: 3,
      messages: [{ id: "tool-1" }, { id: "tool-2" }, { id: "assistant-final" }],
    });
  });

  test("keeps separate assistant replies in separate turn rows", () => {
    const entries = groupAssistantTurns(
      groupMessageToolCalls([
        { msg: { id: "user-1", role: "user", content: "one", timestamp: 0 }, index: 0 },
        {
          msg: { id: "assistant-1", role: "assistant", content: "first", timestamp: 0 },
          index: 1,
        },
        { msg: { id: "user-2", role: "user", content: "two", timestamp: 0 }, index: 2 },
        {
          msg: { id: "assistant-2", role: "assistant", content: "second", timestamp: 0 },
          index: 3,
        },
      ]),
    );

    expect(entries.map((entry) => entry.kind)).toEqual([
      "message",
      "assistant_turn",
      "message",
      "assistant_turn",
    ]);
  });

  test("keeps a compaction continuation inside one complete assistant reply", () => {
    const entries = groupAssistantTurns(
      groupMessageToolCalls([
        { msg: { id: "user-1", role: "user", content: "question", timestamp: 0 }, index: 0 },
        {
          msg: { id: "assistant-before", role: "assistant", content: "Working", timestamp: 0 },
          index: 1,
        },
        {
          msg: {
            id: "compaction-replay",
            role: "user",
            content: "question",
            timestamp: 0,
            tags: ["context_compaction"],
          },
          index: 2,
        },
        {
          msg: { id: "assistant-final", role: "assistant", content: "Done", timestamp: 0 },
          index: 3,
        },
      ]),
    );

    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      kind: "assistant_turn",
      key: "assistant-final",
      finalIndex: 3,
      messages: [
        { id: "assistant-before" },
        { id: "compaction-replay" },
        { id: "assistant-final" },
      ],
    });
  });

  test("keeps a standalone compaction continuation as a visible boundary", () => {
    const entries = groupAssistantTurns(
      groupMessageToolCalls([
        {
          msg: {
            id: "compaction-replay",
            role: "user",
            content: "compacted context",
            timestamp: 0,
            tags: ["context_compaction"],
          },
          index: 0,
        },
      ]),
    );

    expect(entries).toMatchObject([
      {
        kind: "message",
        msg: { id: "compaction-replay", tags: ["context_compaction"] },
      },
    ]);
  });
});
