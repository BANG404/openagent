// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import {
  buildPreflightCommands,
  selectPreflightBase,
  verifyBunVersion,
} from "../scripts/preflight.mjs";

test("preflight rejects an old or absent Bun runtime before launching checks", () => {
  expect(() => verifyBunVersion("1.2.21", "1.3.14")).toThrow("Bun 1.3.14 is required");
  expect(() => verifyBunVersion(undefined, "1.3.14")).toThrow("not Bun");
  expect(() => verifyBunVersion("1.3.14", "1.3.14")).not.toThrow();
});

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
    expect(selectPreflightBase({ currentBranch: "agent/feature" })).toBe("main");
    expect(selectPreflightBase({ currentBranch: "main" })).toBe("origin/main");
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

  test("shares affected-test selection with CI and preserves explicit full qualification", () => {
    const affected = buildPreflightCommands({ ...nothing, frontend: true }, { base: "abc123" });
    expect(affected.find(({ id }) => id === "frontend-tests").args).toEqual([
      "scripts/run-selected-tests.mjs",
      "--scope",
      "frontend",
      "--base",
      "abc123",
    ]);
    const full = buildPreflightCommands(
      { ...nothing, automation: true },
      { base: "abc123", full: true },
    );
    expect(full.find(({ id }) => id === "automation-tests").args).toContain("--all");
  });

  test("deduplicates shared checks when automation and frontend are selected", () => {
    expect(commandIds({ automation: true, frontend: true })).toEqual([
      "skill-contract",
      "actions",
      "lint",
      "format",
      "test-types",
      "protocol-bindings",
      "svelte-check",
      "frontend-build",
      "bundle-size",
      "bootstrap-build",
      "frontend-tests",
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
    expect(ids.indexOf("bundle-size")).toBeLessThan(ids.indexOf("frontend-tests"));
    expect(ids.indexOf("bundle-size")).toBeLessThan(ids.indexOf("bootstrap-build"));
    expect(commandIds({ automation: true })).not.toContain("bundle-size");
  });

  test("uses host compile checks while leaving cross-platform coverage to CI", () => {
    expect(commandIds({ nativeQuality: true, nativePlatform: true })).toEqual([
      "node-runtime",
      "terminal-tools",
      "frontend-dist",
      "protocol-bindings",
      "public-rust-format",
      "public-rust-lint",
      "public-rust-tests",
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
    for (const selection of [{ nativeQuality: true }, { nativePlatform: true }]) {
      const commands = buildPreflightCommands({ ...nothing, ...selection });
      expect(commands.slice(0, 3).map(({ id }) => id)).toEqual([
        "node-runtime",
        "terminal-tools",
        "frontend-dist",
      ]);
      expect(commands.find(({ id }) => id === "node-runtime")).toMatchObject({
        command: "bun",
        args: ["scripts/prepare-node-runtime.mjs"],
      });
      expect(commands.find(({ id }) => id === "terminal-tools")).toMatchObject({
        command: "bun",
        args: ["scripts/prepare-terminal-tools.mjs"],
      });
    }
    expect(commandIds({ frontend: true })).not.toContain("node-runtime");
    expect(commandIds({ automation: true })).not.toContain("terminal-tools");
  });

  test("uses the quick resource and contract validators", () => {
    expect(commandIds({ embedding: true })).toEqual(["embedding"]);
  });
});
