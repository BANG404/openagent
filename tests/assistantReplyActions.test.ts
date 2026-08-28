// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const messageListUrl = new URL("../src/lib/components/MessageList.svelte", import.meta.url);

describe("assistant reply actions", () => {
  test("renders actions for completed turns while a later turn streams", async () => {
    const source = await readFile(messageListUrl, "utf8");

    expect(source).toMatch(
      /turnStatus\s*=\s*assistantTurnStatus\(turnMessages, assistantIsStreaming\).*turnIsTerminal\s*=\s*\["completed", "cancelled", "failed"\]\.includes\(turnStatus\)/s,
    );
    expect(source).toMatch(
      /showAssistantActions\s*=\s*!assistantIsStreaming\s*&&\s*turnIsTerminal\s*&&\s*\(isRerunnable \|\| Boolean\(copyableOutput\) \|\| renderedAssistantItems\.length > 0\)/s,
    );
    expect(source).toMatch(
      /isRerunnable\s*=\s*assistantMsg !== null\s*&&\s*assistantMsgIdx >= 0\s*&&\s*!assistantIsStreaming\s*&&\s*turnIsTerminal/s,
    );
    expect(source).toContain("{#if showAssistantActions}");
  });
});
