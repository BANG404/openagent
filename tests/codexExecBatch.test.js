// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";

import {
  buildExecPlan,
  parseArguments,
} from "../.agents/skills/deliver-via-pr/scripts/run-codex-exec-batch.mjs";

describe("Codex exec OWT batch launcher", () => {
  test("builds isolated writable Codex exec commands for every task", () => {
    const options = parseArguments([
      "--repo",
      ".",
      "--max-concurrency",
      "8",
      "--codex-bin",
      "codex-test",
      "--task",
      "OWT add the first independent feature",
      "--task",
      "OWT: add the second independent feature",
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
      "OWT add the first independent feature",
    ]);
  });

  test("requires multiple OWT-prefixed tasks and a valid concurrency", () => {
    expect(() => parseArguments(["--task", "OWT one task only"])).toThrow("at least two --task");
    expect(() =>
      parseArguments(["--task", "OWT valid", "--task", "not OWT", "--max-concurrency", "0"]),
    ).toThrow("positive integer");
    expect(() => parseArguments(["--task", "OWT valid", "--task", "Direct wrong mode"])).toThrow(
      "must start with an OWT",
    );
  });

  test("supports a read-only dry run without weakening task validation", () => {
    const options = parseArguments(["--dry-run", "--task", "OWT first", "--task", "OWT second"]);
    expect(options.dryRun).toBe(true);
    expect(options.tasks).toEqual(["OWT first", "OWT second"]);
  });
});
