// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import { buildPreflightCommands } from "../scripts/preflight.mjs";

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
    ]);
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
      args: ["-e", "require('fs').mkdirSync('build', { recursive: true })"],
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
