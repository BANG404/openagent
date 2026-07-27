// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { classifyChangedModules } from "../scripts/ci-changes.mjs";

describe("CI module classification", () => {
  test("runs only frontend checks for UI and frontend test changes", () => {
    expect(classifyChangedModules([
      "src/lib/chatStream.ts",
      "tests/chatStream.test.ts",
    ])).toEqual({
      automation: false,
      frontend: true,
      native: false,
    });
  });

  test("runs only native checks for Rust changes", () => {
    expect(classifyChangedModules([
      "src-tauri/src/mcp.rs",
    ])).toEqual({
      automation: false,
      frontend: false,
      native: true,
    });
  });

  test("runs every module when the CI router changes", () => {
    expect(classifyChangedModules([
      ".github/workflows/ci.yml",
    ])).toEqual({
      automation: true,
      frontend: true,
      native: true,
    });
  });

  test("runs only automation for release workflow changes", () => {
    expect(classifyChangedModules([
      ".github/workflows/release.yml",
    ])).toEqual({
      automation: true,
      frontend: false,
      native: false,
    });
  });

  test("runs the module owned by a reusable check workflow", () => {
    expect(classifyChangedModules([
      ".github/workflows/check-frontend.yml",
    ])).toEqual({
      automation: true,
      frontend: true,
      native: false,
    });
    expect(classifyChangedModules([
      ".github/workflows/check-native.yml",
    ])).toEqual({
      automation: true,
      frontend: false,
      native: true,
    });
  });

  test("runs dependency consumers for shared manifest changes", () => {
    expect(classifyChangedModules([
      "package.json",
      "bun.lock",
    ])).toEqual({
      automation: true,
      frontend: true,
      native: true,
    });
  });

  test("runs every SDK consumer when the pinned private SDK changes", () => {
    expect(classifyChangedModules(["sdk"])).toEqual({
      automation: false,
      frontend: true,
      native: true,
    });
  });

  test("only verifies automation for generated release metadata", () => {
    expect(classifyChangedModules([
      ".github/release.json",
      "package.json",
      "src-tauri/tauri.conf.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
      "CHANGELOG.md",
    ])).toEqual({
      automation: true,
      frontend: false,
      native: false,
    });
  });

  test("skips expensive modules for documentation-only changes", () => {
    expect(classifyChangedModules([
      "README.md",
      "docs/design.md",
    ])).toEqual({
      automation: false,
      frontend: false,
      native: false,
    });
  });

  test("can force a complete run when no reliable base commit exists", () => {
    expect(classifyChangedModules([], true)).toEqual({
      automation: true,
      frontend: true,
      native: true,
    });
  });
});
