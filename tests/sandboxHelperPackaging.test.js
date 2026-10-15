import { describe, expect, test } from "bun:test";
import { cargoProfileDirectory, sourceCargoEnvironment } from "../scripts/source-cargo.mjs";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** @param {URL|string} url */
const readText = (url) => readFileSync(url, "utf8").replace(/\r\n/g, "\n");

const nativeWorkflow = readText(new URL("../.github/workflows/check-native.yml", import.meta.url));
const sdkWorkflow = readText(new URL("../.github/workflows/sdk-ci.yml", import.meta.url));
const windowsHelper = readText(
  new URL("../scripts/prepare-windows-sandbox-helpers.mjs", import.meta.url),
);
const cargoManifest = readText(new URL("../src-tauri/Cargo.toml", import.meta.url));
const tauriLauncher = readText(new URL("../scripts/tauri.mjs", import.meta.url));
const packageManifest = JSON.parse(readText(new URL("../package.json", import.meta.url)));
const linuxHelper = readText(
  new URL("../scripts/prepare-linux-sandbox-helper.mjs", import.meta.url),
);
const baseTauriConfig = JSON.parse(
  readText(new URL("../src-tauri/tauri.conf.json", import.meta.url)),
);
const windowsTauriConfig = JSON.parse(
  readText(new URL("../src-tauri/tauri.windows.conf.json", import.meta.url)),
);

describe("sandbox helper packaging", () => {
  test("qualifies private Linux helpers and release digest in SDK CI", () => {
    expect(nativeWorkflow).not.toContain("prepare-linux-sandbox-helper");
    expect(sdkWorkflow).toContain(
      "prepare-linux-sandbox-helper.mjs --profile release --github-env",
    );
    expect(sdkWorkflow).toContain(
      "- name: Verify Linux release sandbox digest guard\n        if: inputs.full",
    );
    expect(sdkWorkflow).toContain(
      "--release --manifest-path runtime/Cargo.toml -p openagent-server",
    );
  });

  test("explains when the checked-out SDK differs from the parent gitlink", () => {
    expect(windowsHelper).toContain('["rev-parse", "HEAD:runtime"]');
    expect(windowsHelper).toContain('["-C", "runtime", "rev-parse", "HEAD"]');
    expect(windowsHelper).toContain("Preserve any SDK work");
    expect(windowsHelper).toContain("git submodule update --init --checkout runtime");
  });

  test("builds Bubblewrap from the same checkout as the pinned Linux sandbox", () => {
    expect(linuxHelper).toContain('candidate.name === "codex-linux-sandbox"');
    expect(linuxHelper).toContain('"bwrap",\n    "Cargo.toml"');
    expect(linuxHelper).toContain('candidate.name === "codex-bwrap"');
    expect(linuxHelper).toContain('target.name === "bwrap"');
  });

  test("keeps private sandbox compiler output outside the public Tauri target", () => {
    expect(linuxHelper).toContain('targetDirectory = path.join(root, "runtime", "target")');
    expect(windowsHelper).toContain('argument("--target-dir", environment.CARGO_TARGET_DIR)');
    const environment = sourceCargoEnvironment({
      repositoryRoot: root,
      platform: "win32",
      environment: {},
    });
    expect(environment.CARGO_TARGET_DIR).not.toContain("src-tauri");
    expect(environment.CARGO_TARGET_DIR).toContain("openagent-source-target");
    expect(
      sourceCargoEnvironment({ repositoryRoot: root, profile: "release", environment: {} })
        .CARGO_TARGET_DIR,
    ).toBe(join(root, "runtime", "target"));
    expect(nativeWorkflow).not.toContain("runtime/target");
    expect(sdkWorkflow).toContain("--target-dir runtime/target");
  });

  test("stages Windows helpers where the sandbox orchestrator finds them", () => {
    expect(windowsHelper).not.toContain("parseRustHost");
    expect(windowsHelper).toContain(
      'const requestedTarget = argument("--target", process.env.OPENAGENT_RUNTIME_TARGET);',
    );
    expect(windowsHelper).toContain('...(requestedTarget ? ["--target", requestedTarget] : []),');
    expect(windowsHelper).toContain("path.join(helperProfileDirectory, helperName)");
    expect(cargoProfileDirectory(join(root, "runtime", "target"), "debug", undefined)).toBe(
      join(root, "runtime", "target", "debug"),
    );
  });

  test("builds Windows helpers before the SDK confinement scenarios", () => {
    const helperStep = sdkWorkflow.indexOf("- name: Build pinned Windows sandbox helpers");
    const confinement = sdkWorkflow.indexOf("- name: Exercise confined plugin MCP on Windows");
    expect(helperStep).toBeGreaterThan(-1);
    expect(confinement).toBeGreaterThan(helperStep);
    expect(sdkWorkflow.slice(helperStep, confinement)).toContain("--target-dir runtime/target");
  });

  test("packages Windows helpers only in the NSIS Windows bundle", () => {
    expect(baseTauriConfig.bundle.resources).not.toHaveProperty("resources/codex-resources/");
    expect(windowsTauriConfig.bundle.targets).toEqual(["nsis"]);
    expect(windowsTauriConfig.bundle.resources).toBeUndefined();
  });

  test("keeps embedded Runtime code out of ordinary desktop binaries", () => {
    expect(cargoManifest).not.toContain("openagent-runtime = {");
    expect(cargoManifest).toContain('openagent-app = { path = "../crates/openagent-app" }');
    expect(cargoManifest).toContain(
      'openagent-protocol = { path = "../crates/openagent-protocol" }',
    );
    expect(cargoManifest).toContain("autobins = false");
    expect(tauriLauncher).not.toContain("embedded-cargo");
    expect(packageManifest.scripts["dev:agent-server"]).toBeUndefined();
    expect(packageManifest.scripts["tauri:dev:embedded"]).toBeUndefined();
    const discoveredBinaries = readdirSync(new URL("../src-tauri/src/", import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && entry.name === "bin")
      .flatMap((entry) => readdirSync(new URL(`../src-tauri/src/${entry.name}/`, import.meta.url)));
    expect(discoveredBinaries).toEqual([]);
    expect(existsSync(new URL("../src-tauri/src/embedded-agent-server.rs", import.meta.url))).toBe(
      false,
    );
  });
});
