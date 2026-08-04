// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { buildPreflightCommands } from "../scripts/preflight.mjs";

const nothing = {
  automation: false,
  frontend: false,
  nativeQuality: false,
  nativePlatform: false,
  embedding: false,
  harness: false,
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
      "actions",
      "lint",
      "format",
      "automation-tests",
    ]);
  });

  test("deduplicates shared checks when automation and frontend are selected", () => {
    expect(commandIds({ automation: true, frontend: true })).toEqual([
      "actions",
      "lint",
      "format",
      "svelte-check",
      "frontend-tests",
    ]);
  });

  test("uses host compile checks while leaving cross-platform coverage to CI", () => {
    expect(commandIds({ nativeQuality: true, nativePlatform: true })).toEqual([
      "rust-format",
      "rust-check",
    ]);
    const rustCheck = buildPreflightCommands({
      ...nothing,
      nativeQuality: true,
      nativePlatform: true,
    }).find(({ id }) => id === "rust-check");
    expect(rustCheck?.args).toEqual(["check", "--manifest-path", "src-tauri/Cargo.toml"]);
  });

  test("uses the quick resource and contract validators", () => {
    expect(commandIds({ embedding: true, harness: true })).toEqual([
      "embedding",
      "harness-openapi",
    ]);
  });
});
