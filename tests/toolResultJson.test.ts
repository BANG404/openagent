import { describe, expect, test } from "bun:test";
import { parseToolResultJson } from "../src/lib/toolResultJson";

describe("parseToolResultJson", () => {
  test("parses a whole JSON result", () => {
    expect(parseToolResultJson('{"id":"message-1","seq":2}')).toEqual({
      id: "message-1",
      seq: 2,
    });
    expect(parseToolResultJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  test("reads the leading value when model context is appended", () => {
    const appended = "\n[Automation hook: demo automation]\nC:\\plugins\\demo\\after-tool.cmd";
    expect(parseToolResultJson(`{"group":{"id":"group-a"}}${appended}`)).toEqual({
      group: { id: "group-a" },
    });
    expect(parseToolResultJson(`[{"seq":1}\n]${appended}`)).toEqual([{ seq: 1 }]);
  });

  test("does not close the value on braces inside strings", () => {
    const result = '{"content":"a } b [ c","nested":"\\"}{\\""}\n[Automation hook: demo]';
    expect(parseToolResultJson(result)).toEqual({ content: "a } b [ c", nested: '"}{"' });
  });

  test("keeps plain text and truncated JSON unstructured", () => {
    expect(parseToolResultJson("Unknown role 'Debater'")).toBeNull();
    expect(parseToolResultJson("")).toBeNull();
    expect(parseToolResultJson('{"content":"truncated"')).toBeNull();
    expect(parseToolResultJson('Error: {"ok":false}')).toBeNull();
  });
});
