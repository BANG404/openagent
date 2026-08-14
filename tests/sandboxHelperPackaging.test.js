// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const nativeWorkflow = readFileSync(
  new URL("../.github/workflows/check-native.yml", import.meta.url),
  "utf8",
);
const windowsHelper = readFileSync(
  new URL("../scripts/prepare-windows-sandbox-helpers.mjs", import.meta.url),
  "utf8",
);
const linuxHelper = readFileSync(
  new URL("../scripts/prepare-linux-sandbox-helper.mjs", import.meta.url),
  "utf8",
);
const baseTauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const windowsTauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.windows.conf.json", import.meta.url), "utf8"),
);

describe("sandbox helper packaging", () => {
  test("prepares the Linux sidecar before Rust compilation and gates the release digest", () => {
    const prepare = nativeWorkflow.indexOf("- name: Prepare pinned Linux sandbox helper");
    const lint = nativeWorkflow.indexOf("- name: Lint Rust");

    expect(prepare).toBeGreaterThan(-1);
    expect(lint).toBeGreaterThan(prepare);
    expect(nativeWorkflow).toContain('if [[ "${{ inputs.full }}" == "true" ]]');
    expect(nativeWorkflow).toContain(
      "- name: Verify Linux release sandbox digest guard\n        if: inputs.full",
    );
  });

  test("explains when the checked-out SDK differs from the parent gitlink", () => {
    expect(windowsHelper).toContain('["rev-parse", "HEAD:sdk"]');
    expect(windowsHelper).toContain('["-C", "sdk", "rev-parse", "HEAD"]');
    expect(windowsHelper).toContain("Preserve any SDK work");
    expect(windowsHelper).toContain("git submodule update --init --checkout sdk");
  });

  test("builds Bubblewrap from the same checkout as the pinned Linux sandbox", () => {
    expect(linuxHelper).toContain('candidate.name === "codex-linux-sandbox"');
    expect(linuxHelper).toContain('"bwrap",\n    "Cargo.toml"');
    expect(linuxHelper).toContain('candidate.name === "codex-bwrap"');
    expect(linuxHelper).toContain('target.name === "bwrap"');
  });

  test("packages Windows helpers only in the NSIS Windows bundle", () => {
    expect(baseTauriConfig.bundle.resources).not.toHaveProperty("resources/codex-resources/");
    expect(windowsTauriConfig.bundle.targets).toEqual(["nsis"]);
    expect(windowsTauriConfig.bundle.resources).toEqual({
      "resources/codex-resources/": "codex-resources/",
    });
  });
});
