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

  test("exposes stable theme hooks for fenced code surfaces", () => {
    expect(chatMarkdownTheme.code?.header.split(/\s+/)).toContain("chat-code-header");
    expect(chatMarkdownTheme.code?.container.split(/\s+/)).toContain("chat-code-container");
    expect(chatMarkdownTheme.code?.skeleton.split(/\s+/)).toContain("chat-code-skeleton");
  });
});
