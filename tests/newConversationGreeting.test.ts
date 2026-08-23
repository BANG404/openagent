// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { NEW_CONVERSATION_GREETING } from "../src/lib/newConversation";

const i18nUrl = new URL("../src/lib/i18n.ts", import.meta.url);

describe("new conversation greeting", () => {
  test("stays fixed outside locale dictionaries", async () => {
    expect(NEW_CONVERSATION_GREETING).toBe("Where should we start?");

    const i18n = await readFile(i18nUrl, "utf8");
    expect(i18n).not.toContain("newConversationGreeting:");
    expect(i18n).not.toContain("remoteNewConversationGreeting:");
  });
});
