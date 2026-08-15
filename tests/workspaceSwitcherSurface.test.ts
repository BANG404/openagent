// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

test("keeps the composer workspace switcher out of the composer surface selector", async () => {
  const source = await readFile(
    new URL("../src/lib/components/WorkspaceSwitcher.svelte", import.meta.url),
    "utf8",
  );

  expect(source).toContain('<div class="workspace-switcher">');
  expect(source).not.toContain("class:composer=");
});
