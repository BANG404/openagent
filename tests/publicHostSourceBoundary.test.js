// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const allowlistPath = ".githooks/public-host-sources.txt";

function lines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    })
    .map((path) => path.replaceAll("\\", "/"))
    .sort();
}

describe("public host Rust source boundary", () => {
  test("explicitly allows every tracked Tauri host module", () => {
    const allowed = lines(readFileSync(allowlistPath, "utf8"));
    const hostSources = sourceFiles("src-tauri/src");

    expect(allowed).toEqual([...allowed].sort());
    expect(hostSources).toEqual(allowed);
  });

  test("keeps the pre-push hook tied to the exact allowlist", () => {
    const hook = readFileSync(".githooks/pre-push", "utf8");
    const verifier = readFileSync("scripts/verify-private-sdk-boundary.mjs", "utf8");

    expect(hook).toContain("public-host-sources.txt");
    expect(hook).toContain('grep -Fvx -f "$public_host_sources"');
    expect(hook).toContain("src-tauri/crates/openagent-runtime");
    expect(verifier).toContain("public-host-sources.txt");
  });
});
