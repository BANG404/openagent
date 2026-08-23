// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("native window theme", () => {
  test("previews the resolved theme on both the WebView and native material", async () => {
    const route = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
    const settings = await readFile(
      new URL("../src/lib/components/SettingsView.svelte", import.meta.url),
      "utf8",
    );

    expect(route).toContain(
      'const nativeTheme = theme === "system" ? null : dark ? "dark" : "light";',
    );
    expect(route).toContain(".setTheme(nativeTheme)");
    expect(route).toContain("onThemePreview={applyTheme}");
    expect(settings).toContain("if (onThemePreview) onThemePreview(theme);");
    expect(settings).toContain("else applyDocumentTheme(theme);");
  });
});
