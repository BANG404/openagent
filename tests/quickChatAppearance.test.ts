// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const quickChatUrl = new URL("../src/lib/components/QuickChat.svelte", import.meta.url);

describe("quick chat appearance", () => {
  test("keeps the shared composer shell on an opaque theme surface", async () => {
    const quickChat = await readFile(quickChatUrl, "utf8");

    expect(quickChat).toMatch(
      /\.composer-slot :global\(\.composer\)\s*{[^}]*background: var\(--surface\);/s,
    );
    expect(quickChat).not.toMatch(
      /\.composer-slot :global\(\.composer\)\s*{[^}]*background: transparent;/s,
    );
    expect(quickChat).not.toMatch(/\.composer-slot :global\(\.composer\)\s*{[^}]*border: 0;/s);
    expect(quickChat).not.toMatch(
      /\.composer-slot :global\(\.composer\)\s*{[^}]*border-radius: 0;/s,
    );
    expect(quickChat).toMatch(
      /\.composer-slot :global\(\.composer:focus-within\)[^}]*box-shadow: var\(--mica-shadow\);/s,
    );
  });
});
