// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import { buildPreflightCommands, selectPreflightBase } from "../scripts/preflight.mjs";

const nothing = {
  automation: false,
  frontend: false,
  nativeQuality: false,
  nativePlatform: false,
  embedding: false,
};

function commandIds(modules) {
  return buildPreflightCommands({ ...nothing, ...modules }).map(({ id }) => id);
}

describe("local preflight plan", () => {
  test("uses the local default branch for OWT branches", () => {
    expect(selectPreflightBase({ currentBranch: "agent/feature" })).toBe("master");
    expect(selectPreflightBase({ currentBranch: "master" })).toBe("origin/master");
  });

  test("preserves an explicit task or CI baseline", () => {
    expect(
      selectPreflightBase({
        explicitBase: "abc123",
        currentBranch: "agent/feature",
      }),
    ).toBe("abc123");
  });

  test("keeps documentation-only changes to the universal guards", () => {
    expect(commandIds({})).toEqual([]);
  });

  test("runs fast automation coverage without the frontend suite", () => {
    expect(commandIds({ automation: true })).toEqual([
      "skill-contract",
      "actions",
      "lint",
      "format",
      "test-types",
      "automation-tests",
    ]);
  });

  test("includes test type checking in the frontend plan", () => {
    expect(commandIds({ frontend: true })).toContain("test-types");
  });

  test("deduplicates shared checks when automation and frontend are selected", () => {
    expect(commandIds({ automation: true, frontend: true })).toEqual([
      "skill-contract",
      "actions",
      "lint",
      "format",
      "test-types",
      "svelte-check",
      "frontend-tests",
      "frontend-build",
      "bootstrap-build",
      "bundle-size",
    ]);
  });

  test("builds fresh production assets before checking frontend bundle budgets", () => {
    const commands = buildPreflightCommands({ ...nothing, frontend: true });
    const ids = commands.map(({ id }) => id);
    expect(commands.find(({ id }) => id === "frontend-build")).toMatchObject({
      command: "bun",
      args: ["run", "build"],
    });
    expect(commands.find(({ id }) => id === "bundle-size")).toMatchObject({
      command: "bun",
      args: ["run", "check:bundle-size"],
    });
    expect(ids.indexOf("frontend-build")).toBeLessThan(ids.indexOf("bundle-size"));
    expect(commandIds({ automation: true })).not.toContain("bundle-size");
  });

  test("uses host compile checks while leaving cross-platform coverage to CI", () => {
    expect(commandIds({ nativeQuality: true, nativePlatform: true })).toEqual([
      "frontend-dist",
      "rust-format",
      "rust-lint",
      "rust-check",
    ]);
    const rustCheck = buildPreflightCommands({
      ...nothing,
      nativeQuality: true,
      nativePlatform: true,
    }).find(({ id }) => id === "rust-check");
    expect(rustCheck?.args).toEqual(["check", "--manifest-path", "src-tauri/Cargo.toml"]);
  });

  test("materializes Tauri frontendDist before Rust compilation and Clippy", () => {
    const modules = { ...nothing, nativeQuality: true, nativePlatform: true };
    const frontendDist = buildPreflightCommands(modules).find(({ id }) => id === "frontend-dist");
    expect(frontendDist).toMatchObject({
      command: "node",
      args: [
        "-e",
        "for(const p of ['build','.cache/bootstrap-dist'])require('fs').mkdirSync(p,{recursive:true})",
      ],
    });
    const ids = commandIds(modules);
    expect(ids.indexOf("frontend-dist")).toBeLessThan(ids.indexOf("rust-lint"));
    expect(ids.indexOf("frontend-dist")).toBeLessThan(ids.indexOf("rust-check"));
    expect(commandIds({ nativeQuality: true })[0]).toBe("frontend-dist");
    expect(commandIds({ nativePlatform: true })[0]).toBe("frontend-dist");
  });

  test("uses the quick resource and contract validators", () => {
    expect(commandIds({ embedding: true })).toEqual(["embedding"]);
  });
});
