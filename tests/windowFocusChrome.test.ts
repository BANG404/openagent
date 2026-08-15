// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const componentsUrl = new URL("../src/lib/components/", import.meta.url);

describe("window focus chrome", () => {
  test("dims both top-chrome segments from one window focus state", async () => {
    const route = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
    const sidebar = await readFile(new URL("DesktopSidebar.svelte", componentsUrl), "utf8");
    const titleBar = await readFile(new URL("DesktopTitleBar.svelte", componentsUrl), "utf8");
    const preview = await readFile(new URL("DesktopShellPreview.svelte", componentsUrl), "utf8");

    expect(route).toContain(".onFocusChanged(({ payload: focused }) =>");
    expect(route).toContain('window.addEventListener("blur", handleBlur)');
    expect(route.match(/\{windowFocused\}/g)).toHaveLength(2);
    expect(sidebar).toContain("class:window-inactive={!windowFocused}");
    expect(sidebar).toMatch(/\.sidebar\.window-inactive \.sidebar-top \{\s*opacity: 0\.55;/);
    expect(titleBar).toContain("class:window-inactive={!windowFocused}");
    expect(titleBar).toMatch(
      /\.title-bar\.window-inactive \.title-bar-menu,[\s\S]*?opacity: 0\.55;/,
    );
    expect(titleBar).toContain("background: var(--app-chrome-bg)");
    expect(preview).toContain('query.get("desktop-shell-preview-focused") !== "false"');
    expect(preview.match(/\{windowFocused\}/g)).toHaveLength(2);
  });
});
