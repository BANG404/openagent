import { describe, expect, test } from "bun:test";
import { cargoProfileDirectory, sourceCargoEnvironment } from "../scripts/source-cargo.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** @param {URL|string} url */
const readText = (url) => readFileSync(url, "utf8").replace(/\r\n/g, "\n");

const nativeWorkflow = readText(new URL("../.github/workflows/check-native.yml", import.meta.url));
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

  test("keeps private sandbox compiler output outside the public Tauri target", () => {
    expect(linuxHelper).toContain('targetDirectory = path.join(root, "sdk", "target")');
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
    ).toBe(join(root, "sdk", "target"));
    expect(nativeWorkflow).toContain('$env:CARGO_TARGET_DIR = (Resolve-Path "sdk\\target").Path');
  });

  test("stages Windows helpers where the sandbox orchestrator finds them", () => {
    expect(windowsHelper).not.toContain("parseRustHost");
    expect(windowsHelper).toContain(
      'const requestedTarget = argument("--target", process.env.OPENAGENT_RUNTIME_TARGET);',
    );
    expect(windowsHelper).toContain('...(requestedTarget ? ["--target", requestedTarget] : []),');
    expect(windowsHelper).toContain("path.join(helperProfileDirectory, helperName)");
    expect(cargoProfileDirectory(join(root, "sdk", "target"), "debug", undefined)).toBe(
      join(root, "sdk", "target", "debug"),
    );
  });

  test("materializes the Windows private target before the sandbox steps resolve it", () => {
    const helperStep = nativeWorkflow.indexOf("- name: Build pinned Windows sandbox helpers");
    const resolvedTarget = nativeWorkflow.indexOf(
      '$env:CARGO_TARGET_DIR = (Resolve-Path "sdk\\target").Path',
    );

    expect(helperStep).toBeGreaterThan(-1);
    expect(resolvedTarget).toBeGreaterThan(helperStep);
    expect(
      nativeWorkflow.slice(
        helperStep,
        nativeWorkflow.indexOf("- name: Check all Rust targets on Windows"),
      ),
    ).toContain("CARGO_TARGET_DIR: sdk/target");
  });

  test("packages Windows helpers only in the NSIS Windows bundle", () => {
    expect(baseTauriConfig.bundle.resources).not.toHaveProperty("resources/codex-resources/");
    expect(windowsTauriConfig.bundle.targets).toEqual(["nsis"]);
    expect(windowsTauriConfig.bundle.resources).toBeUndefined();
  });

  test("keeps embedded Runtime code out of ordinary desktop binaries", () => {
    for (const dependency of ["openagent-app", "openagent-protocol", "openagent-runtime"]) {
      expect(cargoManifest).not.toContain(`${dependency} = {`);
    }
    expect(cargoManifest).toContain("autobins = false");
    expect(tauriLauncher).toContain('"embedded-cargo.cmd"');
    expect(packageManifest.scripts["dev:agent-server"]).toContain("scripts/embedded-cargo.mjs");
    const discoveredBinaries = readdirSync(new URL("../src-tauri/src/", import.meta.url), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && entry.name === "bin")
      .flatMap((entry) => readdirSync(new URL(`../src-tauri/src/${entry.name}/`, import.meta.url)));
    expect(discoveredBinaries).toEqual([]);
    expect(
      readText(new URL("../src-tauri/src/embedded-agent-server.rs", import.meta.url)),
    ).toContain("openagent_lib::run_agent_server()");
  });
});
