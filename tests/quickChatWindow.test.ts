// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const quickChatWindowUrl = new URL("../src/lib/quickChatWindow.ts", import.meta.url);

describe("quick chat window geometry", () => {
  test("uses one fixed size without resize-after-center repositioning", async () => {
    const source = await readFile(quickChatWindowUrl, "utf8");

    expect(source).toContain("export const QUICK_CHAT_SIZE = { width: 856, height: 246 }");
    expect(source).not.toContain("QUICK_CHAT_COMPACT_SIZE");
    expect(source).not.toContain("QUICK_CHAT_EXPANDED_SIZE");
    expect(source).toContain("await quickWindow.center();\n  }\n  await quickWindow.unminimize");
  });
});
