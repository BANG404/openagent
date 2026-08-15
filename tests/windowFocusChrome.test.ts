// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const componentsUrl = new URL("../src/lib/components/", import.meta.url);

describe("window focus chrome", () => {
  test("dims title-bar content without changing the chrome surface", async () => {
    const titleBar = await readFile(new URL("DesktopTitleBar.svelte", componentsUrl), "utf8");
    const preview = await readFile(new URL("DesktopShellPreview.svelte", componentsUrl), "utf8");

    expect(titleBar).toContain(".onFocusChanged(({ payload: focused }) =>");
    expect(titleBar).toContain('window.addEventListener("blur", handleBlur)');
    expect(titleBar).toContain("class:window-inactive={!resolvedWindowFocused}");
    expect(titleBar).toMatch(
      /\.title-bar\.window-inactive \.title-bar-menu,[\s\S]*?opacity: 0\.55;/,
    );
    expect(titleBar).toContain("background: var(--app-chrome-bg)");
    expect(preview).toContain('query.get("desktop-shell-preview-focused") === "false"');
    expect(preview).toContain("{windowFocusedOverride}");
  });
});
