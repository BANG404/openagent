// @ts-nocheck -- Bun provides the test module at runtime.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const hostSource = readFileSync("src-tauri/src/lib.rs", "utf8");
const settingsSource = readFileSync("src/lib/components/SettingsView.svelte", "utf8");

describe("product release identity", () => {
  test("exposes the packaged product version separately from component versions", () => {
    expect(hostSource).toContain("release: String");
    expect(hostSource).toContain('release: env!("CARGO_PKG_VERSION").to_string()');
    expect(hostSource).toContain('shell: env!("CARGO_PKG_VERSION").to_string()');
  });

  test("presents the product release before component details", () => {
    expect(settingsSource).toContain(
      '<h3 class="about-app-name">OpenAgent {componentVersions.release}</h3>',
    );
    expect(settingsSource).toContain('{$t("aboutVersionFrontend")}');
    expect(settingsSource).toContain('{$t("aboutVersionRuntime")}');
  });
});
