// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const componentPaths = [
  "../src/lib/components/ApplicationMenuBar.svelte",
  "../src/lib/components/MentionPalette.svelte",
  "../src/lib/components/RoleSelector.svelte",
  "../src/lib/components/WorkspaceSwitcher.svelte",
  "../src/lib/components/ui/Combobox.svelte",
  "../src/lib/components/ui/Select.svelte",
];

test("uses one theme-aware neutral fill for hover and selected controls", async () => {
  const appCss = await readFile(new URL("../src/app.css", import.meta.url), "utf8");

  expect(appCss.match(/--interactive-state-bg: #cbd5e1;/g)).toHaveLength(2);
  expect(appCss.match(/--interactive-state-bg: #2b2b2b;/g)).toHaveLength(2);
  expect(appCss).toContain("--item-selected-bg: var(--interactive-state-bg);");
  expect(appCss).toContain("--item-selected-hover-bg: var(--interactive-state-bg);");

  const sources = await Promise.all(
    componentPaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    expect(source).toContain("background: var(--interactive-state-bg);");
  }
});
