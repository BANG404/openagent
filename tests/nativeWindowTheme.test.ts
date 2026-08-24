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
    const onboarding = await readFile(
      new URL("../src/lib/components/OnboardingFlow.svelte", import.meta.url),
      "utf8",
    );
    const host = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
    const cargo = await readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
    const capability = JSON.parse(
      await readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
    );

    expect(route).toContain(
      'const nativeTheme = theme === "system" ? null : dark ? "dark" : "light";',
    );
    expect(route).toContain(".setTheme(nativeTheme)");
    expect(route).toContain("onThemePreview={applyTheme}");
    expect(settings).toContain("if (onThemePreview) onThemePreview(theme);");
    expect(settings).toContain("else applyDocumentTheme(theme);");
    expect(onboarding).toContain("if (onThemePreview) onThemePreview(theme);");
    expect(onboarding).toContain("else applyDocumentTheme(theme);");
    expect(capability.permissions).toContain("core:window:allow-set-theme");
    expect(capability.permissions).toContain("pilot:default");
    expect(cargo).toContain('tauri-plugin-pilot = "=0.7.2"');
    expect(host).toContain("builder.plugin(tauri_plugin_pilot::init())");
    expect(host.indexOf("tauri_plugin_single_instance::init")).toBeLessThan(
      host.indexOf("builder.plugin(tauri_plugin_pilot::init())"),
    );
  });
});
