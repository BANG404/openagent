import { describe, expect, test } from "bun:test";
import {
  mergeTerminalSessions,
  terminalHistory,
  isHistoricalTerminal,
} from "../src/lib/terminalHistory";
import type { ChatMessage, StreamItem } from "../src/lib/types";

function observation(id: string, output: string, status = "exited:0"): StreamItem {
  return {
    type: "tool_call",
    toolUseId: id,
    name: "exec_command",
    args: '{"cmd":"echo saved"}',
    result: JSON.stringify({
      output,
      status,
      truncated: false,
      metadata: {
        kind: "terminal_poll",
        session_id: "session-1",
        command: "echo saved",
        cwd: "/workspace",
        started_at: 123,
      },
    }),
  };
}

function message(items: StreamItem[]): ChatMessage {
  return { id: "assistant-1", role: "assistant", content: "", timestamp: 123000, items };
}

describe("terminal history recovery", () => {
  test("restores a completed exec whose top-level session id was omitted", () => {
    const history = terminalHistory(
      [message([observation("call-1", "saved\n")])],
      [],
      "conv-1",
      "branch-1",
    );
    expect(history).toEqual([
      {
        session_id: "session-1",
        command: "echo saved",
        cwd: "/workspace",
        started_at: 123,
        status: "exited:0",
        conv_id: "conv-1",
        branch_id: "branch-1",
        output: "saved\n",
        truncated: false,
        historical: true,
      },
    ]);
    expect(mergeTerminalSessions(history, [])).toEqual(history);
  });

  test("joins distinct polls and deduplicates the hydrated stream observation", () => {
    const start = observation("start", "one\n", "running");
    const poll = {
      ...observation("poll", "two\n"),
      name: "write_stdin",
      args: '{"session_id":"session-1"}',
    };
    const history = terminalHistory(
      [message([start, { type: "retry", items: [poll], attempt: 1, maxAttempts: 2 }])],
      [poll],
      "conv",
      "branch",
    );
    expect(history).toHaveLength(1);
    expect(history[0].output).toBe("one\ntwo\n");
    expect(history[0].status).toBe("exited:0");
  });

  test("does not infer a live process from a saved running observation", () => {
    const history = terminalHistory(
      [message([observation("start", "ready", "running")])],
      [],
      "conv",
      "branch",
    );
    expect(history[0].status).toBe("unavailable");
    expect(isHistoricalTerminal(history[0])).toBe(true);
    const live = {
      session_id: "session-1",
      command: "echo saved",
      cwd: "/workspace",
      started_at: 123,
      status: "running",
      conv_id: "conv",
      branch_id: "branch",
    };
    const merged = mergeTerminalSessions(history, [live]);
    expect(merged).toEqual([live]);
    expect(isHistoricalTerminal(merged[0])).toBe(false);
    expect(mergeTerminalSessions(history, [])).toEqual(history);
  });

  test("retains leading JSON results with appended Runtime context", () => {
    const item = observation("call", "saved");
    if (item.type !== "tool_call") throw new Error("expected tool call");
    item.result += "\nAppended context";
    expect(terminalHistory([message([item])], [], "conv", "branch")[0].output).toBe("saved");
  });

  test("ignores pending calls, approvals, malformed results and unrelated tools", () => {
    const valid = observation("call", "saved");
    const invalid: StreamItem[] = [
      { type: "tool_call", name: "exec_command", args: "{}" },
      { type: "tool_call", name: "exec_command", args: "{}", result: '{"interrupt":true}' },
      { type: "tool_call", name: "exec_command", args: "{}", result: "failed to start" },
      { ...valid, name: "other_tool" } as StreamItem,
    ];
    expect(terminalHistory([message(invalid)], [], "conv", "branch")).toEqual([]);
    expect(terminalHistory([message([valid])], [], null, null)).toEqual([]);
    expect(terminalHistory([], [], "other-conv", "other-branch")).toEqual([]);
  });
});
