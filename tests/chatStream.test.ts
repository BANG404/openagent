// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { appendToolCall, attachToolResult } from "../src/lib/chatStream";

describe("tool stream correlation", () => {
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

  test("keeps the legacy latest-pending fallback without an id", () => {
    let items = appendToolCall([], "fetch", { url: "first" }, "call-1");
    items = appendToolCall(items, "fetch", { url: "second" }, "call-2");

    items = attachToolResult(items, "legacy result");

    expect(items[1]).toMatchObject({ result: "legacy result" });
  });
});
