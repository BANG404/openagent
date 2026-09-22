import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

test("keeps the composer workspace switcher out of the composer surface selector", async () => {
  const source = await readFile(
    new URL("../src/lib/components/WorkspaceSwitcher.svelte", import.meta.url),
    "utf8",
  );

  expect(source).toContain('<div class="workspace-switcher">');
  expect(source).not.toContain("class:composer=");

  const baseFolderNameRule = source.indexOf("\n  .folder-name {");
  const composerFolderNameRule = source.indexOf(
    "\n  :global(.composer-workspace-btn .folder-name) {",
  );
  expect(baseFolderNameRule).toBeGreaterThan(-1);
  expect(composerFolderNameRule).toBeGreaterThan(baseFolderNameRule);
});

test("keeps the recent workspace submenu content-sized", async () => {
  const source = await readFile(
    new URL("../src/lib/components/WorkspaceSwitcher.svelte", import.meta.url),
    "utf8",
  );

  const recentSubmenuRule = source.match(/:global\(\.ws-recent-submenu\)\s*{([^}]*)}/s)?.[1];
  expect(recentSubmenuRule).toContain("width: max-content;");
  expect(recentSubmenuRule).toContain("max-width: calc(100vw - 24px);");
  expect(recentSubmenuRule).not.toContain("width: min(460px");
});
