// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const quickChatUrl = new URL("../src/lib/components/QuickChat.svelte", import.meta.url);

describe("quick chat appearance", () => {
  test("renders one opaque shared composer surface with a unified toolbar", async () => {
    const quickChat = await readFile(quickChatUrl, "utf8");

    expect(quickChat).toContain('class="quick-chat conversation-input-surface"');
    expect(quickChat).toContain(
      'class="quick-drag-region" data-tauri-drag-region aria-hidden="true"',
    );
    expect(quickChat).toMatch(
      /\.quick-drag-region\s*{[^}]*inset: 0 16px auto;[^}]*height: 12px;[^}]*cursor: grab;/s,
    );
    expect(quickChat).toMatch(/\.quick-chat\s*{[^}]*background: var\(--surface\);/s);
    expect(quickChat).toMatch(
      /\.composer-slot :global\(\.composer\)\s*{[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/s,
    );
    expect(quickChat).not.toContain('class="quick-selector-space"');
    expect(quickChat).not.toMatch(/\.quick-footer\s*{[^}]*border-(?:top|bottom):/s);
    expect(quickChat).toMatch(
      /\.quick-footer\s*{[^}]*position: absolute;[^}]*bottom: 6px;[^}]*left: 45px;/s,
    );
    expect(quickChat).toMatch(/\.composer-slot :global\(\.input\)\s*{[^}]*font-size: 14px;/s);
  });
});
