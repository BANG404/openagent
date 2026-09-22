import { describe, expect, test } from "bun:test";
import type { UserInputRequest } from "../src/lib/types";
import {
  appendToolCall,
  appendUserInput,
  attachToolResult,
  initializeStreamItems,
  preserveResolvedUserInputs,
} from "../src/lib/chatStream";

describe("tool stream correlation", () => {
  test("preserves a pending form received before run startup", () => {
    const request: UserInputRequest = {
      request_id: "question-1",
      conv_id: "conv-1",
      kind: "ask_user",
      fields: [],
    };
    const pending = appendUserInput([], request);
    expect(initializeStreamItems(pending)).toEqual(pending);
    expect(initializeStreamItems(undefined)).toEqual([]);
  });

  test("attaches out-of-order results by provider tool id", () => {
    let items = appendToolCall([], "fetch", { url: "first" }, "call-1");
    items = appendToolCall(items, "fetch", { url: "second" }, "call-2");

    items = attachToolResult(items, "first result", "call-1");

    expect(items[0]).toMatchObject({
      type: "tool_call",
      toolUseId: "call-1",
      result: "first result",
    });
    expect(items[1]).toMatchObject({
      type: "tool_call",
      toolUseId: "call-2",
    });
    expect("result" in items[1]).toBe(false);
  });

  test("does not append a replayed tool call with the same provider id", () => {
    const items = appendToolCall(
      appendToolCall([], "fetch", { url: "first" }, "call-1"),
      "fetch",
      { url: "first" },
      "call-1",
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "tool_call",
      name: "fetch",
      toolUseId: "call-1",
    });
  });

  test("keeps the first payload when a replayed call has conflicting details", () => {
    const first = appendToolCall([], "fetch", { url: "first" }, "call-1");
    const replayed = appendToolCall(first, "write_file", { path: "second" }, "call-1");

    expect(replayed).toEqual(first);
  });

  test("keeps the legacy latest-pending fallback without an id", () => {
    let items = appendToolCall([], "fetch", { url: "first" }, "call-1");
    items = appendToolCall(items, "fetch", { url: "second" }, "call-2");

    items = attachToolResult(items, "legacy result");

    expect(items[1]).toMatchObject({ result: "legacy result" });
  });

  test("resolves approval metadata from the canonical tool result", () => {
    const request: UserInputRequest = {
      request_id: "call-1",
      conv_id: "conv-1",
      kind: "tool_approval",
      fields: [],
    };
    let items = appendToolCall([], "write_file", { path: "a.txt" }, "call-1");
    items = appendUserInput(items, request);

    items = attachToolResult(
      items,
      "Tool 'write_file' was not approved because the user continued the conversation. It was not executed.",
      "call-1",
    );

    expect(items[0]).toMatchObject({
      type: "tool_call",
      result: expect.any(String),
      approval: { state: "unanswered" },
    });
  });

  test("treats a repeated correlated result as idempotent", () => {
    let items = appendToolCall([], "fetch", { url: "first" }, "call-1");
    items = appendToolCall(items, "fetch", { url: "second" }, "call-2");
    items = attachToolResult(items, "first result", "call-1");

    const repeated = attachToolResult(items, "duplicate result", "call-1");

    expect(repeated).toEqual(items);
    expect(repeated[1]).toMatchObject({ type: "tool_call", toolUseId: "call-2" });
    expect("result" in repeated[1]).toBe(false);
  });

  test("keeps the canonical result when a late replay carries different output", () => {
    let items = appendToolCall([], "fetch", { url: "first" }, "call-1");
    items = attachToolResult(items, "first result", "call-1");

    expect(attachToolResult(items, "late conflicting result", "call-1")).toEqual(items);
  });

  test("does not reassign a repeated approval to a sibling tool", () => {
    const request: UserInputRequest = {
      request_id: "call-1",
      conv_id: "conv-1",
      kind: "tool_approval" as const,
      fields: [],
    };
    let items = appendToolCall([], "write_file", { path: "one.txt" }, "call-1");
    items = appendToolCall(items, "write_file", { path: "two.txt" }, "call-2");
    items = appendUserInput(items, request);

    const repeated = appendUserInput(items, request);

    expect(repeated).toEqual(items);
    expect(repeated[0]).toMatchObject({
      type: "tool_call",
      toolUseId: "call-1",
      approval: { request, state: "pending" },
    });
    expect(repeated[1]).toMatchObject({ type: "tool_call", toolUseId: "call-2" });
    expect("approval" in repeated[1]).toBe(false);
  });

  test("preserves an optimistic sibling resolution during hydration", () => {
    const request: UserInputRequest = {
      request_id: "call-1",
      conv_id: "conv-1",
      kind: "tool_approval",
      fields: [],
    };
    const visible = appendUserInput(
      appendToolCall([], "exec_command", { cmd: "one" }, "call-1"),
      request,
    );
    const resolved = visible.map((item) =>
      item.type === "tool_call"
        ? { ...item, approval: { ...item.approval!, state: "answered" as const } }
        : item,
    );
    const hydrated = appendUserInput(
      appendToolCall([], "exec_command", { cmd: "one" }, "call-1"),
      request,
    );
    expect(preserveResolvedUserInputs(resolved, hydrated)[0]).toMatchObject({
      approval: { state: "answered" },
    });
  });
});
