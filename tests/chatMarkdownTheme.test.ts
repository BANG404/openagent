// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { chatMarkdownTheme } from "../src/lib/streamdown/chatMarkdownTheme";

describe("chat Markdown theme", () => {
  test("keeps markers aligned with block paragraphs in loose lists", () => {
    expect(chatMarkdownTheme.ol?.base.split(/\s+/)).toContain("list-outside");
    expect(chatMarkdownTheme.ol?.base.split(/\s+/)).not.toContain("list-inside");
    expect(chatMarkdownTheme.ul?.base.split(/\s+/)).toContain("list-outside");
    expect(chatMarkdownTheme.ul?.base.split(/\s+/)).not.toContain("list-inside");
  });
});
