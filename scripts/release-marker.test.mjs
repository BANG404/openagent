import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("automation verifies new release markers but ignores markers inherited by merges", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/check-automation.yml", import.meta.url),
    "utf8",
  );
  const detector = workflow.match(/git diff-tree[^\r\n)]+/)?.[0];
  if (!detector) throw new Error("Missing release marker detector");
  const root = mkdtempSync(path.join(tmpdir(), "release-marker-"));
  /** @param {string[]} args */
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  /** @param {string} value */
  const marker = (value) => writeFileSync(path.join(root, ".github/release.json"), value);
  /** @param {string} message */
  const commit = (message) => {
    git(["add", "."]);
    git(["commit", "-m", message]);
  };
  const detected = () => {
    const result = spawnSync("bash", ["-c", detector], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(0);
    return result.stdout.trim();
  };
  try {
    git(["init", "--initial-branch=main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Release fixture"]);
    mkdirSync(path.join(root, ".github"));
    marker("base\n");
    commit("base");
    git(["checkout", "-b", "release"]);
    marker("release\n");
    commit("release marker");
    expect(detected()).toBe(".github/release.json");
    git(["checkout", "main"]);
    writeFileSync(path.join(root, "task.txt"), "task\n");
    commit("task");
    expect(detected()).toBe("");
    git(["checkout", "-b", "release-first", "release"]);
    git(["merge", "--no-ff", "main", "-m", "keep release marker"]);
    expect(detected()).toBe("");
    git(["checkout", "main"]);
    git(["merge", "--no-ff", "release", "-m", "inherit release"]);
    expect(detected()).toBe("");

    git(["checkout", "-b", "other"]);
    marker("other\n");
    commit("other marker");
    git(["checkout", "main"]);
    marker("main\n");
    commit("main marker");
    expect(detected()).toBe(".github/release.json");
    const conflict = spawnSync("git", ["merge", "other"], { cwd: root });
    expect(conflict.status).toBe(1);
    marker("resolved\n");
    commit("resolve new marker");
    expect(detected()).toBe(".github/release.json");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
