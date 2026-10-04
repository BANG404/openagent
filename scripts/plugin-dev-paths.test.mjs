// @ts-check
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readPluginDevIndex, resolvePluginDevPath } from "./plugin-dev-paths.mjs";

describe("tracked plugin development index", () => {
  test("resolves portable paths without .env and validates package identity", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-dev-"));
    try {
      const directory = join(root, "directory with spaces");
      mkdirSync(directory);
      const manifest = join(directory, "plugin.json");
      writeFileSync(manifest, JSON.stringify({ name: "goal", version: "2.2.0" }));
      const indexFile = join(root, "dev-index.json");
      writeFileSync(indexFile, JSON.stringify({ goal: "directory with spaces" }));
      const index = readPluginDevIndex({ indexFile });
      expect(resolvePluginDevPath(index, "goal")).toEqual({
        id: "goal",
        directory: realpathSync(directory),
        version: "2.2.0",
      });
      expect(() => resolvePluginDevPath(index, "graph")).toThrow("No directory configured");
      expect(() => resolvePluginDevPath(index, "toString")).toThrow("No directory configured");
      for (const value of [
        { name: "graph", version: "1.0.3" },
        { name: "goal", version: "" },
      ]) {
        writeFileSync(manifest, JSON.stringify(value));
        expect(() => resolvePluginDevPath(index, "goal")).toThrow("matching plugin.json");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects malformed indexes and explains uninitialized submodules", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-dev-invalid-"));
    try {
      const indexFile = join(root, "dev-index.json");
      expect(() => readPluginDevIndex({ indexFile })).toThrow("index does not exist");
      for (const raw of [
        "bad-json",
        "[]",
        "null",
        "{}",
        '{"goal":42}',
        '{"../goal":"goal"}',
        '{"goal":""}',
        '{"goal":"."}',
        '{"goal":"../outside"}',
        JSON.stringify({ goal: root }),
      ]) {
        writeFileSync(indexFile, raw);
        expect(() => readPluginDevIndex({ indexFile })).toThrow();
      }
      writeFileSync(indexFile, JSON.stringify({ goal: "goal" }));
      const index = readPluginDevIndex({ indexFile });
      expect(() => resolvePluginDevPath(index, "goal")).toThrow("git submodule update");
      mkdirSync(join(root, "goal"));
      expect(() => resolvePluginDevPath(index, "goal")).toThrow("has no plugin.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a plugin junction outside the indexed directory", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-dev-link-"));
    const outside = mkdtempSync(join(tmpdir(), "plugin-dev-outside-"));
    try {
      writeFileSync(join(outside, "plugin.json"), JSON.stringify({ name: "goal", version: "1" }));
      symlinkSync(outside, join(root, "goal"), process.platform === "win32" ? "junction" : "dir");
      const indexFile = join(root, "dev-index.json");
      writeFileSync(indexFile, JSON.stringify({ goal: "goal" }));
      expect(() => resolvePluginDevPath(readPluginDevIndex({ indexFile }), "goal")).toThrow(
        "escapes plugins",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("CLI uses all five checkout-local packages despite stale environment overrides", () => {
    const cli = fileURLToPath(new URL("./plugin-dev.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [cli], {
      cwd: tmpdir(),
      encoding: "utf8",
      env: {
        ...process.env,
        OPENAGENT_PLUGIN_DIRS: "invalid",
        OPENAGENT_PLUGIN_ENV_FILE: "absent.env",
      },
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.indexFile.replaceAll("\\", "/")).toEndWith("/plugins/dev-index.json");
    expect(output.plugins.map((/** @type {{id: string}} */ plugin) => plugin.id)).toEqual([
      "goal",
      "graph",
      "chat-groups",
      "cua-driver",
      "message-board",
    ]);
    expect(result.stdout).not.toContain("absent.env");
    const path = spawnSync(process.execPath, [cli, "--path", "message-board"], {
      encoding: "utf8",
    });
    expect(path.status).toBe(0);
    expect(path.stdout.trim().replaceAll("\\", "/")).toEndWith("/plugins/message-board");
  });
});
