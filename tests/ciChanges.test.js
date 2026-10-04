import { describe, expect, test } from "bun:test";
import { classifyChangedModules } from "../scripts/ci-changes.mjs";

const nothing = {
  automation: false,
  frontend: false,
  nativeQuality: false,
  nativePlatform: false,
  embedding: false,
};

describe("CI module classification", () => {
  test("runs only frontend checks for UI and frontend test changes", () => {
    expect(classifyChangedModules(["src/lib/chatStream.ts", "tests/chatStream.test.ts"])).toEqual({
      ...nothing,
      frontend: true,
    });
  });

  test("runs Rust quality and platform checks for ordinary native changes", () => {
    expect(classifyChangedModules(["src-tauri/src/lib.rs"])).toEqual({
      ...nothing,
      nativeQuality: true,
      nativePlatform: true,
    });
  });

  test("runs every capability when the CI router or result verifier changes", () => {
    const all = {
      automation: true,
      frontend: true,
      nativeQuality: true,
      nativePlatform: true,
      embedding: true,
    };
    expect(classifyChangedModules([".github/workflows/ci.yml"])).toEqual(all);
    expect(classifyChangedModules([".github/workflows/report-pr-head-ci.yml"])).toEqual(all);
    expect(classifyChangedModules(["scripts/ci-changes.mjs"])).toEqual(all);
    expect(classifyChangedModules(["scripts/ci-reuse.mjs"])).toEqual(all);
    expect(classifyChangedModules(["scripts/preflight.mjs"])).toEqual(all);
    expect(classifyChangedModules(["scripts/verify-ci-results.mjs"])).toEqual(all);
  });

  test("runs only automation for release workflow changes", () => {
    expect(classifyChangedModules([".github/workflows/release.yml"])).toEqual({
      ...nothing,
      automation: true,
    });
  });

  test("runs the module owned by a reusable check workflow", () => {
    expect(classifyChangedModules([".github/workflows/check-frontend.yml"])).toEqual({
      ...nothing,
      automation: true,
      frontend: true,
    });
    expect(classifyChangedModules([".github/workflows/check-native.yml"])).toEqual({
      automation: true,
      frontend: false,
      nativeQuality: true,
      nativePlatform: true,
      embedding: true,
    });
  });

  test("runs dependency consumers for shared manifest changes", () => {
    expect(classifyChangedModules(["package.json", "bun.lock"])).toEqual({
      automation: true,
      frontend: true,
      nativeQuality: true,
      nativePlatform: true,
      embedding: true,
    });
  });

  test("runs every SDK consumer when the pinned private SDK changes", () => {
    expect(classifyChangedModules(["sdk"])).toEqual({
      automation: false,
      frontend: true,
      nativeQuality: true,
      nativePlatform: true,
      embedding: true,
    });
  });

  test("qualifies plugin gitlinks and the portable index without native SDK checks", () => {
    for (const path of [
      ".gitmodules",
      "plugins/goal",
      "plugins/message-board",
      "plugins/dev-index.json",
    ]) {
      expect(classifyChangedModules([path])).toEqual({
        ...nothing,
        automation: true,
        frontend: true,
      });
    }
  });

  test("isolates embedding resource checks", () => {
    expect(
      classifyChangedModules(["src-tauri/resources/models/all-MiniLM-L6-v2-q/config.json"]),
    ).toEqual({
      ...nothing,
      embedding: true,
    });
    expect(classifyChangedModules(["scripts/fetch-embedding-model.mjs"])).toEqual({
      ...nothing,
      automation: true,
      embedding: true,
    });
  });

  test("reruns embedding coverage when native dependencies change", () => {
    expect(classifyChangedModules(["src-tauri/Cargo.toml"])).toEqual({
      ...nothing,
      nativeQuality: true,
      nativePlatform: true,
      embedding: true,
    });
  });

  test("runs native checks when runtime sidecar packaging changes", () => {
    expect(classifyChangedModules(["scripts/prepare-runtime-server.mjs"])).toEqual({
      ...nothing,
      automation: true,
      nativeQuality: true,
      nativePlatform: true,
    });
    expect(classifyChangedModules(["scripts/prepare-runtime-server.test.mjs"])).toEqual({
      ...nothing,
      automation: true,
      nativeQuality: true,
      nativePlatform: true,
    });
    expect(classifyChangedModules(["scripts/stage-release-runtime.mjs"])).toEqual({
      ...nothing,
      automation: true,
      nativeQuality: true,
      nativePlatform: true,
    });
  });

  test("runs frontend checks when signed frontend packaging changes", () => {
    expect(classifyChangedModules(["scripts/frontend-artifacts.mjs"])).toEqual({
      ...nothing,
      automation: true,
      frontend: true,
    });
    expect(classifyChangedModules(["scripts/frontend-artifacts.test.mjs"])).toEqual({
      ...nothing,
      automation: true,
      frontend: true,
    });
  });

  test("keeps automation-only tests out of the frontend suite", () => {
    expect(classifyChangedModules(["tests/codexExecBatch.test.js"])).toEqual({
      ...nothing,
      automation: true,
    });
    expect(classifyChangedModules(["tests/ciResults.test.js"])).toEqual({
      ...nothing,
      automation: true,
    });
    expect(classifyChangedModules(["tests/ciReuse.test.js"])).toEqual({
      ...nothing,
      automation: true,
    });
    expect(classifyChangedModules(["tests/privateSdkDiagnostic.test.js"])).toEqual({
      ...nothing,
      automation: true,
    });
  });

  test("routes skill and frontend contract tests to their owning modules", () => {
    expect(classifyChangedModules([".agents/skills/openagent-chat-frontend/SKILL.md"])).toEqual({
      ...nothing,
      automation: true,
    });
    expect(classifyChangedModules(["tests/componentUsage.test.js"])).toEqual({
      ...nothing,
      automation: true,
    });
    expect(classifyChangedModules(["src/lib/components/ToolCallCard.svelte"])).toEqual({
      ...nothing,
      frontend: true,
    });
  });

  test("only verifies automation for generated release metadata", () => {
    expect(
      classifyChangedModules([
        ".github/release.json",
        "package.json",
        "src-tauri/tauri.conf.json",
        "src-tauri/Cargo.toml",
        "src-tauri/Cargo.lock",
        "CHANGELOG.md",
      ]),
    ).toEqual({
      automation: true,
      frontend: false,
      nativeQuality: false,
      nativePlatform: false,
      embedding: false,
    });
  });

  test("skips expensive modules for documentation-only changes", () => {
    expect(
      classifyChangedModules([
        "README.md",
        ".agents/skills/openagent-design-system/references/colors.md",
      ]),
    ).toEqual({ ...nothing, automation: true });
  });

  test("routes modular release documentation through automation checks", () => {
    expect(
      classifyChangedModules([
        ".agents/skills/openagent-release-engineering/references/publishing.md",
      ]),
    ).toEqual({
      ...nothing,
      automation: true,
    });
  });

  test("can force a complete run when no reliable base commit exists", () => {
    expect(classifyChangedModules([], true)).toEqual({
      automation: true,
      frontend: true,
      nativeQuality: true,
      nativePlatform: true,
      embedding: true,
    });
  });
});
