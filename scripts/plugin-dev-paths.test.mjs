// @ts-check
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPluginDevIndex, resolvePluginDevPath } from "./plugin-dev-paths.mjs";

describe("explicit plugin development index", () => {
  test("resolves paths beside the selected .env without exporting secrets", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-dev-"));
    try {
      const directory = join(root, "directory with spaces");
      mkdirSync(directory);
      writeFileSync(
        join(directory, "plugin.json"),
        JSON.stringify({ name: "goal", version: "2.2.0" }),
      );
      const envFile = join(root, ".env");
      writeFileSync(
        envFile,
        `SECRET=do-not-export\nOPENAGENT_PLUGIN_DIRS='{"goal":"directory with spaces"}'\n`,
      );
      const index = readPluginDevIndex({ envFile, environment: {} });
      expect(resolvePluginDevPath(index, "goal")).toEqual({
        id: "goal",
        directory,
        version: "2.2.0",
      });
      expect(JSON.stringify(index)).not.toContain("do-not-export");
      expect(() => resolvePluginDevPath(index, "graph")).toThrow("No directory configured");
      writeFileSync(
        join(directory, "plugin.json"),
        JSON.stringify({ name: "graph", version: "1.0.3" }),
      );
      expect(() => resolvePluginDevPath(index, "goal")).toThrow("matching plugin.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails closed for absent, invalid and stale mappings instead of searching", () => {
    const envFile = join(tmpdir(), "missing-plugin-index", ".env");
    expect(() => readPluginDevIndex({ envFile, environment: {} })).toThrow("never searched");
    for (const raw of ["bad-json", "[]", "null", "{}", '{"goal":42}', '{"../goal":"x"}']) {
      expect(() =>
        readPluginDevIndex({ envFile, environment: { OPENAGENT_PLUGIN_DIRS: raw } }),
      ).toThrow();
    }
    const index = readPluginDevIndex({
      envFile,
      environment: { OPENAGENT_PLUGIN_DIRS: '{"goal":"absent"}' },
    });
    expect(() => resolvePluginDevPath(index, "goal")).toThrow("does not exist");
  });
});
