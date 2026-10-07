import { describe, expect, test } from "bun:test";
import {
  replaceMarkdownRange,
  selectedMarkdown,
  visibleDeletionRange,
} from "../src/lib/composerEditing";
import { parseInline, serializeInline } from "../src/lib/composerMarkdown";

describe("visible Markdown editing", () => {
  test("backspace skips closing markers and removes the last formatted character", () => {
    const range = visibleDeletionRange("x **ab**", 8, true);
    expect(range).toEqual({ start: 5, end: 6 });
    expect(replaceMarkdownRange("x **ab**", range.start, range.end, "")).toEqual({
      value: "x **a**",
      caret: 5,
    });
    expect(replaceMarkdownRange("x **a**", 4, 5, "")).toEqual({ value: "x ", caret: 2 });
  });

  test("forward deletion skips opening markers", () => {
    const range = visibleDeletionRange("**ab**", 0, false);
    expect(replaceMarkdownRange("**ab**", range.start, range.end, "")).toEqual({
      value: "**b**",
      caret: 2,
    });
  });

  test("deletes graphemes and atomic attachment or mention chips", () => {
    const emoji = "👨‍👩‍👧‍👦";
    expect(visibleDeletionRange(`a${emoji}`, 1 + emoji.length, true)).toEqual({
      start: 1,
      end: 1 + emoji.length,
    });
    expect(visibleDeletionRange("aé", 3, true)).toEqual({ start: 1, end: 3 });
    expect(visibleDeletionRange("@agent", 6, true)).toEqual({ start: 0, end: 6 });
    const references = new Map([["[Image #1]", "image.png"]]);
    expect(visibleDeletionRange("[Image #1]", 0, false, references)).toEqual({ start: 0, end: 10 });
  });

  test("range replacement retains format and deletion removes only affected wrappers", () => {
    expect(replaceMarkdownRange("**ab**", 2, 4, "中文")).toEqual({ value: "**中文**", caret: 4 });
    expect(replaceMarkdownRange("before **bold** after", 11, 17, "").value).toBe("before bofter");
    expect(replaceMarkdownRange("**bold** after", 0, 4, "").value).toBe("ld after");
    expect(replaceMarkdownRange("literal **** and ` `", 0, 0, "x").value).toBe(
      "xliteral **** and ` `",
    );
  });

  test("merging lines removes only the second line's hidden marker", () => {
    expect(replaceMarkdownRange("- a\n- b", 3, 4, "")).toEqual({ value: "- ab", caret: 3 });
    expect(replaceMarkdownRange("# A\n> B", 3, 4, "")).toEqual({ value: "# AB", caret: 3 });
  });

  test("copies selected formatted text as a balanced Markdown fragment", () => {
    expect(selectedMarkdown("**bold**", 2, 6)).toBe("**bold**");
    expect(selectedMarkdown("**bold**", 3, 5)).toBe("**ol**");
    expect(selectedMarkdown("**a *bc* d**", 5, 6)).toBe("***b***");
    expect(selectedMarkdown("- **ab**\n- c", 0, 12)).toBe("- **ab**\n- c");
  });
});

describe("inline parser source preservation", () => {
  test("recognizes underscore and nested emphasis without italicizing identifiers", () => {
    expect(parseInline("__bold__ _italic_").map((node) => node.kind)).toEqual([
      "strong",
      "text",
      "em",
    ]);
    expect(parseInline("snake_case_name")[0].kind).toBe("text");
    const [strong] = parseInline("***both***");
    expect(strong.kind).toBe("strong");
    expect(strong.children?.[0].kind).toBe("em");
  });

  test("supports exact code delimiters and balanced parentheses in destinations", () => {
    expect(parseInline("``a ` b``")[0]).toMatchObject({ kind: "code", text: "a ` b" });
    expect(parseInline("` x `")[0]).toMatchObject({ kind: "code", text: " x " });
    expect(parseInline("[label](https://example.com/a(b))")[0].href).toBe(
      "https://example.com/a(b)",
    );
    expect(parseInline("[label](unfinished")[0].kind).toBe("text");
  });

  test("formats around chips and keeps code free of token interpretation", () => {
    const references = new Map([["[Image #1]", "image.png"]]);
    const [strong] = parseInline("**see [Image #1]**", 0, references);
    expect(strong.kind).toBe("strong");
    expect(strong.children?.at(-1)?.kind).toBe("chip");
    const source = "`@agent **literal**`";
    expect(parseInline(source)[0].children?.[0].kind).toBe("text");
    expect(serializeInline(parseInline(source))).toBe(source);
    expect(parseInline(String.raw`\*literal\*`)[0].kind).toBe("text");
  });
});
