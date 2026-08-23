// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const componentPaths = [
  "../src/lib/components/MentionPalette.svelte",
  "../src/lib/components/RoleSelector.svelte",
  "../src/lib/components/WorkspaceSwitcher.svelte",
  "../src/lib/components/ui/Combobox.svelte",
  "../src/lib/components/ui/Select.svelte",
];

test("owns translucent interaction and desktop-menu states in app.css", async () => {
  const appCss = await readFile(new URL("../src/app.css", import.meta.url), "utf8");

  expect(appCss.match(/--interactive-state-opacity: 10%;/g)).toHaveLength(1);
  expect(appCss.match(/--interactive-state-bg: color-mix\(/g)).toHaveLength(1);
  expect(appCss).toMatch(
    /--interactive-state-bg: color-mix\(\s*in srgb,\s*var\(--text\) var\(--interactive-state-opacity\),\s*transparent\s*\);/s,
  );
  expect(appCss).toContain("--item-selected-bg: var(--interactive-state-bg);");
  expect(appCss).toContain("--item-selected-hover-bg: var(--interactive-state-bg);");
  expect(appCss).toContain(".interactive-control:hover:not(:disabled)");
  expect(appCss).toContain(".desktop-menu-item[data-selected]:not([data-disabled])");
  expect(appCss).toContain(".desktop-menu-search-input:focus-visible");

  const sources = await Promise.all(
    componentPaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    expect(source).toContain("desktop-menu-item");
    expect(source).not.toContain("background: var(--interactive-state-bg);");
  }

  const applicationMenu = await readFile(
    new URL("../src/lib/components/ApplicationMenuBar.svelte", import.meta.url),
    "utf8",
  );
  expect(appCss).toContain(".application-menu-item[data-highlighted]:not([data-disabled])");
  expect(applicationMenu).not.toContain("background: var(--interactive-state-bg);");
});
