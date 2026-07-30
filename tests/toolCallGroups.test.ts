// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  appendLiveStreamEntry,
  groupMessageToolCalls,
  groupStreamItems,
  isAssistantTurnEntry,
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

  test("keeps specialized and approval tool calls outside groups", () => {
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
      call("render_html"),
      call("render_mermaid"),
    ]);

    expect(segments.every((segment) => segment.kind === "item")).toBe(true);
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

  test("retains the virtual row key when a live stream becomes a completed message", () => {
    const assistantId = "assistant-1";
    const liveEntries = appendLiveStreamEntry([], assistantId);
    const completedEntries = groupMessageToolCalls([
      {
        msg: {
          id: assistantId,
          role: "assistant",
          content: "done",
          timestamp: 0,
        },
        index: 0,
      },
    ]);

    expect(liveEntries).toEqual([{ kind: "live_stream", key: assistantId }]);
    expect(completedEntries[0]?.key).toBe(liveEntries[0]?.key);
    expect(isAssistantTurnEntry(liveEntries[0])).toBe(true);
    expect(isAssistantTurnEntry(completedEntries[0])).toBe(true);
  });
});
