// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const messageListUrl = new URL("../src/lib/components/MessageList.svelte", import.meta.url);

describe("assistant reply actions", () => {
  test("wait for the complete Agent reply before rendering", async () => {
    const source = await readFile(messageListUrl, "utf8");

    expect(source).toMatch(
      /showAssistantActions\s*=\s*!isStreaming\s*&&\s*\(isRerunnable \|\| Boolean\(copyableOutput\) \|\| renderedAssistantItems\.length > 0\)/s,
    );
    expect(source).toContain("{#if showAssistantActions}");
  });
});
