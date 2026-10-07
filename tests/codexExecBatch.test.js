import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildExecPlan,
  parseArguments,
} from "../.agents/skills/deliver-via-owt/scripts/run-codex-exec-batch.mjs";

describe("Codex exec OWT batch launcher", () => {
  let repo = "";
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "openagent-codex-batch-"));
    execFileSync("git", ["init", "-b", "master", repo], { stdio: "ignore" });
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test("builds isolated writable Codex exec commands for every task", () => {
    const options = parseArguments([
      "--repo",
      repo,
      "--max-concurrency",
      "8",
      "--codex-bin",
      "codex-test",
      "--task",
      "add the first independent feature",
      "--task",
      "add the second independent feature",
    ]);
    const plan = buildExecPlan(options);

    expect(plan.maxConcurrency).toBe(2);
    expect(plan.codexBin).toBe("codex-test");
    expect(plan.tasks.map(({ id }) => id)).toEqual(["task-1", "task-2"]);
    expect(plan.tasks[0].args).toEqual([
      "exec",
      "--approve-for-me",
      "--cd",
      plan.repo,
      "--add-dir",
      plan.writableParent,
      plan.tasks[0].prompt,
    ]);
    for (const task of plan.tasks) {
      expect(task.prompt).toContain("Use $deliver-via-owt and the OWT workflow");
      expect(task.prompt).toContain("keep the default directory on master");
    }
    expect(plan.tasks[0].prompt).toEndWith("add the first independent feature");
  });

  test("requires multiple non-empty tasks and a valid concurrency", () => {
    expect(() => parseArguments(["--task", "one task only"])).toThrow("at least two --task");
    expect(() =>
      parseArguments(["--task", "first", "--task", "second", "--max-concurrency", "0"]),
    ).toThrow("positive integer");
    expect(() => parseArguments(["--task", "valid", "--task", " "])).toThrow("non-empty prompt");
  });

  test("supports a read-only dry run without weakening task validation", () => {
    const options = parseArguments(["--dry-run", "--task", "first", "--task", "second"]);
    expect(options.dryRun).toBe(true);
    expect(options.tasks).toEqual(["first", "second"]);
  });

  test("rejects task branches and detached HEAD without switching the repository", () => {
    const options = { repo, tasks: ["first", "second"], maxConcurrency: 2, codexBin: "codex-test" };
    execFileSync("git", ["-C", repo, "symbolic-ref", "HEAD", "refs/heads/agent/task"]);
    expect(() => buildExecPlan(options)).toThrow("default directory on master");
    expect(
      execFileSync("git", ["-C", repo, "branch", "--show-current"], { encoding: "utf8" }).trim(),
    ).toBe("agent/task");
    execFileSync(
      "git",
      [
        "-C",
        repo,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.test",
        "commit",
        "--allow-empty",
        "-m",
        "base",
      ],
      { stdio: "ignore" },
    );
    execFileSync("git", ["-C", repo, "checkout", "--detach"], { stdio: "ignore" });
    expect(() => buildExecPlan(options)).toThrow("default directory on master");
  });
});
