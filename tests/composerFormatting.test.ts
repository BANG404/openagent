import { describe, expect, test } from "bun:test";
import { applyComposerFormat } from "../src/lib/components/composerFormatting";

describe("composer formatting", () => {
  test("wraps and selects formatted text", () => {
    expect(applyComposerFormat("hello", 0, 5, { prefix: "**" })).toEqual({
      value: "**hello**",
      start: 2,
      end: 7,
    });
  });

  test("toggles an existing format off", () => {
    expect(applyComposerFormat("**hello**", 2, 7, { prefix: "**" })).toEqual({
      value: "hello",
      start: 0,
      end: 5,
    });
  });

  test("inserts a placeholder when there is no selection", () => {
    expect(applyComposerFormat("say ", 4, 4, { prefix: "`", placeholder: "code" })).toEqual({
      value: "say `code`",
      start: 5,
      end: 9,
    });
  });

  test("toggles a complete source span selected by select-all", () => {
    expect(applyComposerFormat("**hello**", 0, 9, { prefix: "**" })).toEqual({
      value: "hello",
      start: 0,
      end: 5,
    });
    expect(applyComposerFormat("**a** and **b**", 0, 15, { prefix: "**" }).value).toBe(
      "****a** and **b****",
    );
  });

  test("formats each selected line and preserves blank lines and block markers", () => {
    const source = "# heading\n\n- item\nplain ";
    const result = applyComposerFormat(source, 0, source.length, { prefix: "**" });
    expect(result.value).toBe("# **heading**\n\n- **item**\n**plain** ");
    expect(result.start).toBe(4);
    expect(result.end).toBe(result.value.length - 3);
    const code = "```\n**literal**\n```";
    expect(applyComposerFormat(code, 0, code.length, { prefix: "*" }).value).toBe(code);
  });
});
