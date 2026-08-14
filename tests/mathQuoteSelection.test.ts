// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const sourceRoot = new URL("../src/lib/", import.meta.url);

describe("math quote selection", () => {
  test("preserves KaTeX source and routes selections through the math-aware extractor", async () => {
    const [math, messageList, quote, renderer, retry] = await Promise.all([
      readFile(new URL("streamdown/ChatMath.svelte", sourceRoot), "utf8"),
      readFile(new URL("components/MessageList.svelte", sourceRoot), "utf8"),
      readFile(new URL("components/UserQuote.svelte", sourceRoot), "utf8"),
      readFile(new URL("components/StreamItemRenderer.svelte", sourceRoot), "utf8"),
      readFile(new URL("components/RetryAttempt.svelte", sourceRoot), "utf8"),
    ]);

    expect(math).toContain("data-chat-math-source={token.text}");
    expect(messageList).toContain("selectionTextWithMath(selection)");
    expect(quote).toContain("<QuoteContent content={context.text} />");
    expect(renderer).toContain("math: ChatMath");
    expect(retry).toContain("math: ChatMath");
  });
});
