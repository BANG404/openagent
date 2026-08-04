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
});
