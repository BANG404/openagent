// @ts-nocheck -- Bun provides the test module at runtime.
import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  batchStatus,
  cleanupBatch,
  createBatch,
  finalizeBatch,
  markTaskReady,
  registerTask,
  sealBatch,
} from "../.agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs";

const temporaryRoots = [];
const coordinator = fileURLToPath(
  new URL("../.agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs", import.meta.url),
);

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "openagent-owt-batch-test-"));
  temporaryRoots.push(root);
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, ["init", "--initial-branch=master"]);
  git(repo, ["config", "user.name", "OpenAgent Test"]);
  git(repo, ["config", "user.email", "openagent@example.com"]);
  git(repo, ["config", "core.autocrlf", "false"]);
  writeFileSync(join(repo, "base.txt"), "base\n");
  git(repo, ["add", "base.txt"]);
  git(repo, ["commit", "-m", "chore: base"]);
  return { root, repo, base: git(repo, ["rev-parse", "HEAD"]) };
}

function createTask(repo, root, name, file) {
  const branch = `agent/${name}`;
  const worktree = join(root, `worktree-${name}`);
  git(repo, ["worktree", "add", "-b", branch, worktree, "master"]);
  writeFileSync(join(worktree, file), `${name}\n`);
  git(worktree, ["add", file]);
  git(worktree, ["commit", "-m", `test: ${name}`]);
  return { taskId: name, branch, worktree, head: git(worktree, ["rev-parse", "HEAD"]) };
}

function register(repo, batchId, task) {
  return registerTask(repo, {
    batchId,
    taskId: task.taskId,
    branch: task.branch,
    worktreePath: task.worktree,
  });
}

function mergeTasks(integration, branches) {
  for (const branch of branches) {
    git(integration, ["merge", "--no-edit", branch.headSha]);
  }
  return git(integration, ["rev-parse", "HEAD"]);
}

function runCoordinator(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [coordinator, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Coordinator exited with ${code}.`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

describe("OWT batch coordination", () => {
  test("elects the last ready task and integrates the immutable task heads", () => {
    const { root, repo, base } = createRepository();
    const first = createTask(repo, root, "first", "first.txt");
    const second = createTask(repo, root, "second", "second.txt");
    createBatch(repo, { batchId: "batch-one", defaultBranch: "master", base });
    register(repo, "batch-one", first);
    register(repo, "batch-one", second);
    sealBatch(repo, { batchId: "batch-one" });

    expect(
      markTaskReady(first.worktree, {
        batchId: "batch-one",
        taskId: first.taskId,
        verifiedHead: first.head,
      }),
    ).toMatchObject({
      action: "finish",
      reason: "waiting-for-other-tasks",
      pendingTaskIds: [second.taskId],
    });

    const election = markTaskReady(second.worktree, {
      batchId: "batch-one",
      taskId: second.taskId,
      verifiedHead: second.head,
    });
    expect(election).toMatchObject({ action: "integrate" });
    expect(election.branches.map(({ headSha }) => headSha)).toEqual([first.head, second.head]);
    expect(existsSync(election.integrationWorktree)).toBe(true);

    const integrationHead = mergeTasks(election.integrationWorktree, election.branches);
    const finalized = finalizeBatch(election.integrationWorktree, {
      batchId: "batch-one",
      leaseId: election.leaseId,
      verifiedHead: integrationHead,
    });
    expect(finalized).toMatchObject({ action: "integrated", finalHead: integrationHead });
    expect(git(repo, ["rev-parse", "master"])).toBe(integrationHead);

    const cleaned = cleanupBatch(repo, {
      batchId: "batch-one",
      leaseId: election.leaseId,
    });
    expect(cleaned.action).toBe("cleaned");
    expect(existsSync(first.worktree)).toBe(false);
    expect(existsSync(second.worktree)).toBe(false);
    expect(existsSync(election.integrationWorktree)).toBe(false);
    expect(batchStatus(repo, { batchId: "batch-one" }).cleanedAt).toBeString();
  }, 20_000);

  test("asks the integrator to refresh when master advances", () => {
    const { root, repo, base } = createRepository();
    const task = createTask(repo, root, "feature", "feature.txt");
    createBatch(repo, { batchId: "batch-refresh", defaultBranch: "master", base });
    register(repo, "batch-refresh", task);
    sealBatch(repo, { batchId: "batch-refresh" });
    const election = markTaskReady(task.worktree, {
      batchId: "batch-refresh",
      taskId: task.taskId,
      verifiedHead: task.head,
    });
    expect(election.action).toBe("integrate");
    let integrationHead = mergeTasks(election.integrationWorktree, election.branches);

    writeFileSync(join(repo, "concurrent.txt"), "concurrent\n");
    git(repo, ["add", "concurrent.txt"]);
    git(repo, ["commit", "-m", "test: concurrent default advance"]);
    const concurrentHead = git(repo, ["rev-parse", "HEAD"]);

    const refresh = finalizeBatch(election.integrationWorktree, {
      batchId: "batch-refresh",
      leaseId: election.leaseId,
      verifiedHead: integrationHead,
    });
    expect(refresh).toMatchObject({
      action: "refresh",
      reason: "default-branch-advanced",
      defaultHead: concurrentHead,
    });

    git(election.integrationWorktree, ["merge", "--no-edit", refresh.defaultHead]);
    integrationHead = git(election.integrationWorktree, ["rev-parse", "HEAD"]);
    const finalized = finalizeBatch(election.integrationWorktree, {
      batchId: "batch-refresh",
      leaseId: election.leaseId,
      verifiedHead: integrationHead,
    });
    expect(finalized).toMatchObject({ action: "integrated", finalHead: integrationHead });
    expect(git(repo, ["rev-parse", "master"])).toBe(integrationHead);
  }, 20_000);

  test("rejects ready state when the asserted preflight head is stale", () => {
    const { root, repo, base } = createRepository();
    const task = createTask(repo, root, "stale", "stale.txt");
    createBatch(repo, { batchId: "batch-stale", defaultBranch: "master", base });
    register(repo, "batch-stale", task);
    sealBatch(repo, { batchId: "batch-stale" });
    writeFileSync(join(task.worktree, "later.txt"), "later\n");
    git(task.worktree, ["add", "later.txt"]);
    git(task.worktree, ["commit", "-m", "test: move after verification"]);

    expect(() =>
      markTaskReady(task.worktree, {
        batchId: "batch-stale",
        taskId: task.taskId,
        verifiedHead: task.head,
      }),
    ).toThrow("Preflight verification covered");
  }, 20_000);

  test("does not strand a ready task before the batch is sealed", () => {
    const { root, repo, base } = createRepository();
    const task = createTask(repo, root, "unsealed", "unsealed.txt");
    createBatch(repo, { batchId: "batch-unsealed", defaultBranch: "master", base });
    register(repo, "batch-unsealed", task);

    expect(
      markTaskReady(task.worktree, {
        batchId: "batch-unsealed",
        taskId: task.taskId,
        verifiedHead: task.head,
      }),
    ).toEqual({
      action: "blocked",
      batchId: "batch-unsealed",
      reason: "batch-not-sealed",
    });
    expect(batchStatus(repo, { batchId: "batch-unsealed" }).tasks[0].state).toBe("running");
  }, 20_000);

  test("elects only one integrator when ready commands race", async () => {
    const { root, repo, base } = createRepository();
    const first = createTask(repo, root, "race-first", "race-first.txt");
    const second = createTask(repo, root, "race-second", "race-second.txt");
    createBatch(repo, { batchId: "batch-race", defaultBranch: "master", base });
    register(repo, "batch-race", first);
    register(repo, "batch-race", second);
    sealBatch(repo, { batchId: "batch-race" });

    const results = await Promise.all([
      runCoordinator(first.worktree, [
        "ready",
        "--batch",
        "batch-race",
        "--task",
        first.taskId,
        "--verified-head",
        first.head,
      ]),
      runCoordinator(second.worktree, [
        "ready",
        "--batch",
        "batch-race",
        "--task",
        second.taskId,
        "--verified-head",
        second.head,
      ]),
    ]);

    expect(results.map(({ action }) => action).sort()).toEqual(["finish", "integrate"]);
    expect(results.filter(({ action }) => action === "integrate")).toHaveLength(1);
    expect(batchStatus(repo, { batchId: "batch-race" }).state).toBe("integrating");
  }, 20_000);
});
