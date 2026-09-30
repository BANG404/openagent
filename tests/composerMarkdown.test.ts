import { describe, expect, test } from "bun:test";
import {
  insertSoftLineBreak,
  parseBlocks,
  parseInline,
  protectedSpans,
  removeLineMarker,
  serializeBlocks,
  serializeInline,
  wordBoundaryAfter,
  wordBoundaryBefore,
} from "../src/lib/composerMarkdown";

const references = new Map([["[Image #1]", "C:/screenshots/example.png"]]);

describe("composer markdown blocks", () => {
  test("keeps one block per line with exact source offsets", () => {
    const blocks = parseBlocks("# Title\nplain\n\n> quoted");
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
      "quote",
    ]);
    expect(blocks[0]).toMatchObject({
      raw: "# Title",
      start: 0,
      end: 7,
      markerRaw: "# ",
      level: 1,
    });
    expect(blocks[1]).toMatchObject({ raw: "plain", start: 8, end: 13, markerRaw: "" });
    expect(blocks[2]).toMatchObject({ raw: "", start: 14, end: 14 });
    expect(blocks[3]).toMatchObject({ raw: "> quoted", start: 15, end: 23, markerRaw: "> " });
  });

  test("recognises task, unordered, and ordered list items", () => {
    const [task, unordered, ordered] = parseBlocks("- [x] done\n- item\n3) third");
    expect(task).toMatchObject({
      kind: "listItem",
      markerRaw: "- [x] ",
      checked: true,
      ordered: false,
    });
    expect(task.inline.map((node) => node.text)).toEqual(["done"]);
    expect(unordered).toMatchObject({ kind: "listItem", markerRaw: "- ", checked: null });
    expect(ordered).toMatchObject({ kind: "listItem", markerRaw: "3) ", ordered: true });
    expect(ordered).toMatchObject({ start: 18, contentStart: 21 });
  });

  test("round-trips the exact source through serialization", () => {
    const source = "# Head\n\ntext **bold** and `code`\n- [ ] todo\n> quote ";
    expect(serializeBlocks(parseBlocks(source))).toBe(source);
  });
});

describe("composer markdown inline", () => {
  test("hides markers but keeps the raw slice and absolute offsets", () => {
    const nodes = parseInline("a **b** c", 10);
    expect(nodes.map((node) => node.kind)).toEqual(["text", "strong", "text"]);
    expect(nodes[0]).toMatchObject({ text: "a ", start: 10, end: 12 });
    expect(nodes[1]).toMatchObject({
      text: "b",
      raw: "**b**",
      start: 12,
      end: 17,
      contentStart: 14,
      contentEnd: 15,
    });
    expect(nodes[2]).toMatchObject({ text: " c", start: 17, end: 19 });
    expect(serializeInline(nodes)).toBe("a **b** c");
  });

  test("renders every supported inline format", () => {
    const nodes = parseInline("**b** *i* ~~s~~ `c` [l](u)");
    expect(nodes.map((node) => node.kind)).toEqual([
      "strong",
      "text",
      "em",
      "text",
      "del",
      "text",
      "code",
      "text",
      "link",
    ]);
    const link = nodes.at(-1);
    expect(link).toMatchObject({ kind: "link", text: "l", href: "u" });
  });

  test("leaves a half-typed marker literal until it closes", () => {
    expect(parseInline("**bo").map((node) => node.kind)).toEqual(["text"]);
    expect(parseInline("**bo")[0].text).toBe("**bo");
    expect(parseInline("`co").map((node) => node.kind)).toEqual(["text"]);
  });

  test("does not italicise a lone asterisk surrounded by spaces", () => {
    expect(parseInline("2 * 3 * 4").map((node) => node.kind)).toEqual(["text"]);
  });

  test("protects attachment labels and mention tokens from markdown parsing", () => {
    const nodes = parseInline("see [Image #1] and @agent here", 0, references);
    expect(nodes.map((node) => node.kind)).toEqual(["text", "chip", "text", "chip", "text"]);
    expect(nodes[1]).toMatchObject({
      raw: "[Image #1]",
      chipKind: "attachment",
      text: "[Image #1]",
    });
    expect(nodes[3]).toMatchObject({ raw: "@agent", chipKind: "token" });
    expect(serializeInline(nodes)).toBe("see [Image #1] and @agent here");
  });

  test("never turns a bracket label into a link", () => {
    for (const nodes of [parseInline("[Image #1]"), parseInline("[Image #1]", 0, references)]) {
      expect(nodes.map((node) => node.kind)).not.toContain("link");
    }
  });

  test("reports protected spans with their offsets", () => {
    expect(protectedSpans("@agent #file.ts", new Map())).toEqual([
      { start: 0, end: 6, kind: "token" },
      { start: 7, end: 15, kind: "token" },
    ]);
  });
});

describe("composer markdown line edits", () => {
  test("continues lists and quotes on a soft line break", () => {
    expect(insertSoftLineBreak("- a", 3)).toEqual({ value: "- a\n- ", caret: 6 });
    expect(insertSoftLineBreak("3) a", 4)).toEqual({ value: "3) a\n4) ", caret: 8 });
    expect(insertSoftLineBreak("> q", 3)).toEqual({ value: "> q\n> ", caret: 6 });
  });

  test("drops an empty marker instead of carrying it forward", () => {
    expect(insertSoftLineBreak("- ", 2)).toEqual({ value: "", caret: 0 });
    expect(insertSoftLineBreak("> ", 2)).toEqual({ value: "", caret: 0 });
  });

  test("starts a fresh unchecked task item", () => {
    expect(insertSoftLineBreak("- [x] done", 10)).toEqual({
      value: "- [x] done\n- [ ] ",
      caret: 17,
    });
  });

  test("inserts a plain newline outside any marker", () => {
    expect(insertSoftLineBreak("plain", 5)).toEqual({ value: "plain\n", caret: 6 });
  });

  test("keeps soft breaks outside inline formatting delimiters", () => {
    expect(insertSoftLineBreak("撤**地方**", 7)).toEqual({
      value: "撤**地方**\n",
      caret: 8,
    });
    expect(insertSoftLineBreak("撤**地方**", 3, 5)).toEqual({
      value: "撤**地方**\n",
      caret: 8,
    });
  });

  test("never carries a heading marker onto the next line", () => {
    expect(insertSoftLineBreak("## Title", 8)).toEqual({ value: "## Title\n", caret: 9 });
    expect(insertSoftLineBreak("## ", 3)).toEqual({ value: "", caret: 0 });
  });

  test("clears a line marker on backspace at the content start", () => {
    expect(removeLineMarker("- a", 2)).toEqual({ value: "a", caret: 0 });
    expect(removeLineMarker("# T", 2)).toEqual({ value: "T", caret: 0 });
    expect(removeLineMarker("> q", 2)).toEqual({ value: "q", caret: 0 });
    expect(removeLineMarker("- a", 3)).toBeNull();
    expect(removeLineMarker("plain", 2)).toBeNull();
  });

  test("finds word boundaries for keyboard deletion", () => {
    expect(wordBoundaryBefore("hello world", 11)).toBe(6);
    expect(wordBoundaryBefore("hello world", 5)).toBe(0);
    expect(wordBoundaryAfter("hello world", 0)).toBe(5);
    expect(wordBoundaryAfter("hello world", 6)).toBe(11);
  });
});
