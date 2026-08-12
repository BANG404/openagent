// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { finalAssistantOutput, finalAssistantOutputStartIndex } from "../src/lib/assistantOutput";

const assistantMessage = (overrides = {}) => ({
  id: "assistant-1",
  role: "assistant",
  content: "",
  timestamp: 0,
  ...overrides,
});

describe("final assistant output", () => {
  test("starts at the trailing final-output run", () => {
    const items = [
      { type: "text", content: "I will inspect it." },
      { type: "tool_call", name: "read_file", args: "{}", result: "contents" },
      { type: "thinking", content: "private reasoning" },
      { type: "text", content: "Final " },
      { type: "text", content: "answer" },
    ];

    expect(finalAssistantOutputStartIndex(items)).toBe(3);
    expect(finalAssistantOutputStartIndex([{ type: "text", content: "Only answer" }])).toBe(0);
    expect(
      finalAssistantOutputStartIndex([
        { type: "text", content: "Before tool" },
        { type: "tool_call", name: "read_file", args: "{}", result: "contents" },
      ]),
    ).toBe(2);
  });

  test("includes trailing render and Goal update tools in the final-output boundary", () => {
    expect(
      finalAssistantOutputStartIndex([
        { type: "thinking", content: "private reasoning" },
        { type: "tool_call", name: "render_html", args: "{}", result: '{"ok":true}' },
        { type: "text", content: "Final answer" },
        { type: "tool_call", name: "render_mermaid", args: "{}", result: '{"ok":true}' },
        { type: "tool_call", name: "update_goal", args: "{}", result: "updated" },
      ]),
    ).toBe(1);
  });

  test("uses plain message content when no structured items are present", () => {
    expect(finalAssistantOutput(assistantMessage({ content: "  Final answer  " }))).toBe(
      "Final answer",
    );
  });

  test("copies only text emitted after the final tool call", () => {
    expect(
      finalAssistantOutput(
        assistantMessage({
          items: [
            { type: "text", content: "I will inspect it." },
            { type: "tool_call", name: "read_file", args: "{}", result: "contents" },
            { type: "thinking", content: "private reasoning" },
            { type: "text", content: "Final " },
            { type: "text", content: "answer" },
          ],
        }),
      ),
    ).toBe("Final answer");
  });

  test("copies final text when a render or Goal update follows it", () => {
    expect(
      finalAssistantOutput(
        assistantMessage({
          items: [
            { type: "thinking", content: "private reasoning" },
            { type: "text", content: "Final answer" },
            { type: "tool_call", name: "render_mermaid", args: "{}", result: '{"ok":true}' },
            { type: "tool_call", name: "update_goal", args: "{}", result: "updated" },
          ],
        }),
      ),
    ).toBe("Final answer");
  });

  test("excludes narration separated from the final answer by later reasoning", () => {
    expect(
      finalAssistantOutput(
        assistantMessage({
          items: [
            { type: "text", content: "I am still working." },
            { type: "thinking", content: "one more check" },
            { type: "text", content: "Finished." },
          ],
        }),
      ),
    ).toBe("Finished.");
  });

  test("finds the final output across every record in one assistant reply", () => {
    expect(
      finalAssistantOutput([
        assistantMessage({
          id: "assistant-tool",
          items: [
            { type: "text", content: "I will inspect it." },
            { type: "tool_call", name: "read_file", args: "{}", result: "contents" },
          ],
        }),
        assistantMessage({ id: "assistant-final", content: "Final answer" }),
      ]),
    ).toBe("Final answer");
  });

  test("treats a dedicated user-input tool as the final interaction", () => {
    expect(
      finalAssistantOutput(
        assistantMessage({
          items: [
            { type: "text", content: "Before input" },
            {
              type: "user_input",
              request: { request_id: "question-1", conv_id: "conv-1", fields: [] },
              state: "answered",
            },
            { type: "text", content: "After input" },
          ],
        }),
      ),
    ).toBe("After input");
  });

  test("does not fall back to pre-tool content when no final text exists", () => {
    expect(
      finalAssistantOutput(
        assistantMessage({
          content: "Pre-tool content",
          items: [
            { type: "text", content: "Pre-tool content" },
            { type: "tool_call", name: "read_file", args: "{}", result: "contents" },
          ],
        }),
      ),
    ).toBe("");
  });
});
