// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INTEGRATION_LEASE_TTL_MS,
  batchStatus,
  cleanupBatch,
  createBatch,
  finalizeBatch,
  heartbeatBatch,
  integrationLeaseStatus,
  markTaskReady,
  recoverBatch,
  registerTask,
  sealBatch,
  taskEnvironment,
} from "../.agents/skills/deliver-via-owt/scripts/coordinate-owt-batch.mjs";
import { finishWorktree } from "../.agents/skills/deliver-via-owt/scripts/finish-worktree.mjs";

const temporaryRoots = [];
const coordinator = fileURLToPath(
  new URL("../.agents/skills/deliver-via-owt/scripts/coordinate-owt-batch.mjs", import.meta.url),
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
  git(repo, ["init", "--initial-branch=alpha"]);
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
  git(repo, ["worktree", "add", "-b", branch, worktree, "alpha"]);
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
    cleanup: "remove",
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

function createConversation() {
  const fixture = createRepository();
  const worktree = join(fixture.root, "Codex conversation");
  git(fixture.repo, ["worktree", "add", "--detach", worktree, fixture.base]);
  return { ...fixture, worktree };
}

function stageFeature(worktree, file = "feature.txt", content = "task\n") {
  writeFileSync(join(worktree, file), content);
  git(worktree, ["add", file]);
}

describe("Codex conversation delivery", () => {
  test("the CLI runs preflight with the immutable base and propagates its real exit status", () => {
    const finisher = fileURLToPath(
      new URL("../.agents/skills/deliver-via-owt/scripts/finish-worktree.mjs", import.meta.url),
    );
    for (const fail of [false, true]) {
      const { root, repo } = createRepository();
      writeFileSync(
        join(repo, "package.json"),
        JSON.stringify({ scripts: { preflight: "bun preflight.mjs" } }),
      );
      writeFileSync(
        join(repo, "preflight.mjs"),
        `
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
writeFileSync(execFileSync("git", ["rev-parse", "--git-path", "preflight-fixture.json"], { encoding: "utf8" }).trim(), JSON.stringify(process.argv.slice(2)));
process.exit(${fail ? 23 : 0});
`,
      );
      git(repo, ["add", "package.json", "preflight.mjs"]);
      git(repo, ["commit", "-m", "test: fixture validation"]);
      const base = git(repo, ["rev-parse", "HEAD"]);
      const worktree = join(root, "Codex CLI worktree");
      git(repo, ["worktree", "add", "--detach", worktree, base]);
      stageFeature(worktree);
      const invoke = () =>
        execFileSync(
          process.execPath,
          [finisher, "--repo", worktree, "--base", base, "--message", "feat: CLI task"],
          { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
      if (fail) {
        expect(invoke).toThrow();
        expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
        expect(git(worktree, ["rev-parse", "HEAD"])).toBe(base);
        expect(git(worktree, ["show", ":feature.txt"])).toBe("task");
      } else {
        expect(invoke()).toContain('"action": "integrated"');
        expect(git(repo, ["rev-parse", "HEAD"])).toBe(git(worktree, ["rev-parse", "HEAD"]));
        expect(readFileSync(join(repo, "feature.txt"), "utf8")).toBe("task\n");
      }
      const log = git(worktree, ["rev-parse", "--git-path", "preflight-fixture.json"]);
      expect(JSON.parse(readFileSync(log, "utf8"))).toEqual(["--base", base]);
    }
  }, 20_000);

  test("validates and commits detached work, updates local alpha and retains the same checkout", () => {
    const { repo, worktree, base } = createConversation();
    stageFeature(worktree);
    const worktrees = git(repo, ["worktree", "list", "--porcelain"]);
    let checks = 0;
    const result = finishWorktree(
      worktree,
      { base, message: "feat: reviewed task" },
      (root, sha) => {
        expect(root.replaceAll("\\", "/")).toBe(worktree.replaceAll("\\", "/"));
        expect(sha).toBe(base);
        expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
        expect(git(root, ["show", ":feature.txt"])).toBe("task");
        checks += 1;
      },
    );
    expect(checks).toBe(1);
    expect(result).toMatchObject({
      action: "integrated",
      taskBranch: null,
      worktreeRetained: true,
      pushed: false,
    });
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(result.verifiedHead);
    expect(git(worktree, ["rev-parse", "HEAD"])).toBe(result.verifiedHead);
    expect(git(worktree, ["branch", "--show-current"])).toBe("");
    expect(git(repo, ["branch", "--format=%(refname:short)"])).toBe("alpha");
    expect(git(repo, ["branch", "--show-current"])).toBe("alpha");
    expect(git(repo, ["worktree", "list", "--porcelain"]).match(/worktree /g)).toHaveLength(
      worktrees.match(/worktree /g).length,
    );
    expect(readFileSync(join(repo, "feature.txt"), "utf8")).toBe("task\n");
    expect(git(repo, ["status", "--porcelain"])).toBe("");
    expect(git(worktree, ["status", "--porcelain"])).toBe("");
  }, 20_000);

  test("preserves an existing Codex branch and supports already committed tasks", () => {
    const { repo, worktree, base } = createConversation();
    git(worktree, ["switch", "-c", "codex/existing"]);
    stageFeature(worktree);
    git(worktree, ["commit", "-m", "feat: existing task"]);
    const head = git(worktree, ["rev-parse", "HEAD"]);
    const result = finishWorktree(worktree, { base }, () => {});
    expect(result.verifiedHead).toBe(head);
    expect(git(worktree, ["branch", "--show-current"])).toBe("codex/existing");
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(existsSync(worktree)).toBe(true);
  }, 20_000);

  test("merges concurrent alpha commits in the conversation and revalidates the combined tree", () => {
    const { repo, worktree, base } = createConversation();
    stageFeature(worktree);
    let checks = 0;
    let concurrent = "";
    const result = finishWorktree(worktree, { base, message: "feat: task" }, (root) => {
      checks += 1;
      if (checks === 1) {
        stageFeature(repo, "concurrent.txt", "other task\n");
        git(repo, ["commit", "-m", "feat: concurrent delivery"]);
        concurrent = git(repo, ["rev-parse", "HEAD"]);
      } else {
        expect(readFileSync(join(root, "concurrent.txt"), "utf8")).toBe("other task\n");
        expect(readFileSync(join(root, "feature.txt"), "utf8")).toBe("task\n");
        expect(git(repo, ["rev-parse", "HEAD"])).toBe(concurrent);
      }
    });
    expect(checks).toBe(2);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(result.verifiedHead);
    expect(git(repo, ["rev-parse", `${result.verifiedHead}^2`])).toBe(concurrent);
    expect(readFileSync(join(repo, "feature.txt"), "utf8")).toBe("task\n");
    expect(readFileSync(join(repo, "concurrent.txt"), "utf8")).toBe("other task\n");
  }, 20_000);

  test("failed validation preserves the reviewed index and leaves alpha unchanged", () => {
    const { repo, worktree, base } = createConversation();
    stageFeature(worktree);
    const status = git(worktree, ["status", "--porcelain"]);
    expect(() =>
      finishWorktree(worktree, { base, message: "feat: task" }, () => {
        throw new Error("fixture validation failed");
      }),
    ).toThrow("fixture validation failed");
    expect(git(worktree, ["rev-parse", "HEAD"])).toBe(base);
    expect(git(worktree, ["status", "--porcelain"])).toBe(status);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(existsSync(join(repo, "feature.txt"))).toBe(false);
  }, 20_000);

  test("failed validation after a concurrent merge cannot deliver the combined source", () => {
    const { repo, worktree, base } = createConversation();
    stageFeature(worktree);
    let checks = 0;
    let concurrent = "";
    expect(() =>
      finishWorktree(worktree, { base, message: "feat: task" }, () => {
        checks += 1;
        if (checks === 1) {
          stageFeature(repo, "concurrent.txt", "other task\n");
          git(repo, ["commit", "-m", "feat: concurrent delivery"]);
          concurrent = git(repo, ["rev-parse", "HEAD"]);
        } else {
          throw new Error("combined validation failed");
        }
      }),
    ).toThrow("combined validation failed");
    expect(checks).toBe(2);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(concurrent);
    expect(existsSync(join(repo, "feature.txt"))).toBe(false);
    expect(readFileSync(join(worktree, "feature.txt"), "utf8")).toBe("task\n");
    expect(readFileSync(join(worktree, "concurrent.txt"), "utf8")).toBe("other task\n");
    expect(git(worktree, ["status", "--porcelain"])).toBe("");
  }, 20_000);

  test("source changes during verification cannot reach alpha", () => {
    const { repo, worktree, base } = createConversation();
    stageFeature(worktree);
    expect(() =>
      finishWorktree(worktree, { base, message: "feat: task" }, () => {
        stageFeature(worktree, "feature.txt", "changed while validating\n");
      }),
    ).toThrow("Task changed during preflight");
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(git(worktree, ["show", ":feature.txt"])).toBe("changed while validating");
  }, 20_000);

  test("dirty alpha blocks automatic integration without changing developer bytes or staging", () => {
    const { repo, worktree, base } = createConversation();
    stageFeature(worktree);
    stageFeature(repo, "base.txt", "developer staged\n");
    writeFileSync(join(repo, "base.txt"), "developer working\n");
    writeFileSync(join(repo, "untracked.txt"), "developer untracked\n");
    const status = git(repo, ["status", "--porcelain"]);
    expect(() => finishWorktree(worktree, { base, message: "feat: task" }, () => {})).toThrow(
      "Checkout has uncommitted changes",
    );
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(git(repo, ["status", "--porcelain"])).toBe(status);
    expect(git(repo, ["show", ":base.txt"])).toBe("developer staged");
    expect(readFileSync(join(repo, "base.txt"), "utf8")).toBe("developer working\n");
    expect(readFileSync(join(repo, "untracked.txt"), "utf8")).toBe("developer untracked\n");
    expect(git(worktree, ["log", "-1", "--format=%s"])).toBe("feat: task");
  }, 20_000);

  test("a merge conflict stays in the conversation and preserves the committed alpha", () => {
    const { repo, worktree, base } = createConversation();
    stageFeature(worktree, "base.txt", "task content\n");
    stageFeature(repo, "base.txt", "concurrent content\n");
    git(repo, ["commit", "-m", "feat: concurrent change"]);
    const concurrent = git(repo, ["rev-parse", "HEAD"]);
    let checks = 0;
    expect(() =>
      finishWorktree(worktree, { base, message: "feat: task" }, () => {
        checks += 1;
      }),
    ).toThrow();
    expect(checks).toBe(1);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(concurrent);
    expect(readFileSync(join(repo, "base.txt"), "utf8")).toBe("concurrent content\n");
    expect(git(worktree, ["diff", "--name-only", "--diff-filter=U"])).toBe("base.txt");
    expect(git(worktree, ["log", "-1", "--format=%s"])).toBe("feat: task");
  }, 20_000);

  test("rejects the default directory, missing commit message and unreviewed task files", () => {
    const { repo, worktree, base } = createConversation();
    const verify = () => {
      throw new Error("must not verify rejected input");
    };
    expect(() => finishWorktree(worktree, { base: "alpha" }, verify)).toThrow("full immutable");
    expect(() => finishWorktree(repo, { base }, verify)).toThrow("isolated task checkout");
    stageFeature(worktree);
    expect(() => finishWorktree(worktree, { base }, verify)).toThrow("require --message");
    writeFileSync(join(worktree, "unreviewed.txt"), "preserve me\n");
    expect(() => finishWorktree(worktree, { base, message: "feat: task" }, verify)).toThrow(
      "unstaged or untracked",
    );
    expect(readFileSync(join(worktree, "unreviewed.txt"), "utf8")).toBe("preserve me\n");
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
  }, 20_000);

  test("refuses rewritten alpha ancestry without changing either history", () => {
    const { repo, worktree } = createConversation();
    // Record a newer alpha base, then model an external history rewrite.
    stageFeature(repo, "new-base.txt", "new base\n");
    git(repo, ["commit", "-m", "test: newer recorded base"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    git(worktree, ["merge", "--ff-only", base]);
    git(repo, ["reset", "--hard", "HEAD^"]);
    const rewritten = git(repo, ["rev-parse", "HEAD"]);
    stageFeature(worktree);
    expect(() => finishWorktree(worktree, { base, message: "feat: task" }, () => {})).toThrow(
      "must descend from the recorded local base",
    );
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(rewritten);
    expect(git(worktree, ["rev-parse", "HEAD"])).toBe(base);
    expect(git(worktree, ["show", ":feature.txt"])).toBe("task");
  }, 20_000);
});

describe("OWT batch coordination", () => {
  test("reuses a Codex branch and retains its worktree and later edits by default", async () => {
    const { root, repo, base } = createRepository();
    const task = createTask(repo, root, "conversation", "feature.txt");
    task.branch = "codex/conversation";
    git(task.worktree, ["branch", "-m", task.branch]);
    createBatch(repo, { batchId: "batch-conversation", defaultBranch: "alpha", base });
    await runCoordinator(repo, [
      "register",
      "--batch",
      "batch-conversation",
      "--task",
      task.taskId,
      "--branch",
      task.branch,
      "--worktree",
      task.worktree,
    ]);
    expect(batchStatus(repo, { batchId: "batch-conversation" }).tasks[0].cleanup).toBe("retain");
    sealBatch(repo, { batchId: "batch-conversation" });
    const election = markTaskReady(task.worktree, {
      batchId: "batch-conversation",
      taskId: task.taskId,
      verifiedHead: task.head,
    });
    const integrationHead = mergeTasks(election.integrationWorktree, election.branches);
    finalizeBatch(election.integrationWorktree, {
      batchId: "batch-conversation",
      leaseId: election.leaseId,
      verifiedHead: integrationHead,
    });

    // The next conversation turn can start before batch cleanup runs.
    writeFileSync(join(task.worktree, "feature.txt"), "next turn\n");
    git(task.worktree, ["add", "feature.txt"]);
    writeFileSync(join(task.worktree, "feature.txt"), "next turn working edit\n");
    writeFileSync(join(task.worktree, "next.txt"), "untracked conversation work\n");
    const status = git(task.worktree, ["status", "--porcelain"]);
    const cleaned = cleanupBatch(repo, {
      batchId: "batch-conversation",
      leaseId: election.leaseId,
    });
    expect(cleaned.retainedWorktrees).toEqual([task.worktree]);
    expect(cleaned.removedWorktrees).toEqual([election.integrationWorktree]);
    expect(cleaned.removedBranches).not.toContain(task.branch);
    expect(git(task.worktree, ["branch", "--show-current"])).toBe(task.branch);
    expect(git(task.worktree, ["status", "--porcelain"])).toBe(status);
    expect(git(task.worktree, ["show", ":feature.txt"])).toBe("next turn");
    expect(readFileSync(join(task.worktree, "feature.txt"), "utf8")).toBe(
      "next turn working edit\n",
    );
    expect(readFileSync(join(task.worktree, "next.txt"), "utf8")).toBe(
      "untracked conversation work\n",
    );
    expect(git(repo, ["branch", "--show-current"])).toBe("alpha");
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(integrationHead);
    expect(readFileSync(join(repo, "feature.txt"), "utf8")).toBe("conversation\n");
    expect(existsSync(election.integrationWorktree)).toBe(false);
  }, 20_000);

  test("rejects invalid cleanup ownership and default-branch tasks before registration", () => {
    const { root, repo, base } = createRepository();
    const task = createTask(repo, root, "invalid", "feature.txt");
    const batchId = "batch-invalid";
    createBatch(repo, { batchId, defaultBranch: "alpha", base });
    const options = {
      batchId,
      taskId: task.taskId,
      branch: task.branch,
      worktreePath: task.worktree,
    };
    expect(() => registerTask(repo, { ...options, cleanup: "delete" })).toThrow(
      "Task cleanup must be remove or retain",
    );
    expect(() => registerTask(repo, { ...options, branch: "alpha", worktreePath: repo })).toThrow(
      "A batch task cannot use the default branch",
    );
    expect(batchStatus(repo, { batchId }).tasks).toEqual([]);
    expect(existsSync(task.worktree)).toBe(true);
  }, 20_000);

  test("marks integration leases stale only after the configured TTL", () => {
    const claimedAt = "2026-01-01T00:00:00.000Z";
    const state = {
      integrator: {
        taskId: "task",
        leaseId: "lease",
        claimedAt,
        heartbeatAt: claimedAt,
        leaseTtlMs: INTEGRATION_LEASE_TTL_MS,
      },
    };
    expect(
      integrationLeaseStatus(state, Date.parse(claimedAt) + INTEGRATION_LEASE_TTL_MS),
    ).toMatchObject({
      active: true,
      stale: false,
    });
    expect(
      integrationLeaseStatus(state, Date.parse(claimedAt) + INTEGRATION_LEASE_TTL_MS + 1),
    ).toMatchObject({
      active: true,
      stale: true,
    });
  });

  test("elects the last ready task and integrates the immutable task heads", () => {
    const { root, repo, base } = createRepository();
    const first = createTask(repo, root, "first", "first.txt");
    const second = createTask(repo, root, "second", "second.txt");
    createBatch(repo, { batchId: "batch-one", defaultBranch: "alpha", base });
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
    expect(git(repo, ["rev-parse", "alpha"])).toBe(integrationHead);

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

  test("asks the integrator to refresh when alpha advances", () => {
    const { root, repo, base } = createRepository();
    const task = createTask(repo, root, "feature", "feature.txt");
    createBatch(repo, { batchId: "batch-refresh", defaultBranch: "alpha", base });
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
    expect(git(repo, ["rev-parse", "alpha"])).toBe(integrationHead);
  }, 20_000);

  test("rejects ready state when the asserted preflight head is stale", () => {
    const { root, repo, base } = createRepository();
    const task = createTask(repo, root, "stale", "stale.txt");
    createBatch(repo, { batchId: "batch-stale", defaultBranch: "alpha", base });
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
    createBatch(repo, { batchId: "batch-unsealed", defaultBranch: "alpha", base });
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
    createBatch(repo, { batchId: "batch-race", defaultBranch: "alpha", base });
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

  test("blocks a sealed batch when tasks modify the same file", () => {
    const { root, repo, base } = createRepository();
    const first = createTask(repo, root, "overlap-first", "shared.txt");
    const second = createTask(repo, root, "overlap-second", "shared.txt");
    createBatch(repo, { batchId: "batch-overlap", defaultBranch: "alpha", base });
    register(repo, "batch-overlap", first);
    register(repo, "batch-overlap", second);
    sealBatch(repo, { batchId: "batch-overlap" });

    expect(
      markTaskReady(first.worktree, {
        batchId: "batch-overlap",
        taskId: first.taskId,
        verifiedHead: first.head,
      }),
    ).toMatchObject({ action: "finish", reason: "waiting-for-other-tasks" });

    const blocked = markTaskReady(second.worktree, {
      batchId: "batch-overlap",
      taskId: second.taskId,
      verifiedHead: second.head,
    });
    expect(blocked).toMatchObject({
      action: "blocked",
      reason: "OWT tasks modify overlapping files; serialize those tasks or split ownership.",
      overlaps: [{ file: "shared.txt" }],
    });
    expect(batchStatus(repo, { batchId: "batch-overlap" }).state).toBe("blocked");
    expect(batchStatus(repo, { batchId: "batch-overlap" }).blockedOverlaps).toEqual([
      { file: "shared.txt", taskIds: ["overlap-first", "overlap-second"] },
    ]);
  }, 20_000);

  test("blocks overlaps involving deleted files", () => {
    const { root, repo } = createRepository();
    writeFileSync(join(repo, "shared.txt"), "base\n");
    git(repo, ["add", "shared.txt"]);
    git(repo, ["commit", "-m", "test: add shared base file"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    const first = createTask(repo, root, "delete-first", "shared.txt");
    const second = createTask(repo, root, "delete-second", "shared.txt");
    git(first.worktree, ["rm", "shared.txt"]);
    git(first.worktree, ["commit", "-m", "delete shared file"]);
    first.head = git(first.worktree, ["rev-parse", "HEAD"]);
    writeFileSync(join(second.worktree, "shared.txt"), "second change\n");
    git(second.worktree, ["add", "shared.txt"]);
    git(second.worktree, ["commit", "-m", "modify shared file"]);
    second.head = git(second.worktree, ["rev-parse", "HEAD"]);
    createBatch(repo, { batchId: "batch-delete-overlap", defaultBranch: "alpha", base });
    register(repo, "batch-delete-overlap", first);
    register(repo, "batch-delete-overlap", second);
    sealBatch(repo, { batchId: "batch-delete-overlap" });
    expect(
      markTaskReady(first.worktree, {
        batchId: "batch-delete-overlap",
        taskId: first.taskId,
        verifiedHead: first.head,
      }),
    ).toMatchObject({ action: "finish" });
    expect(
      markTaskReady(second.worktree, {
        batchId: "batch-delete-overlap",
        taskId: second.taskId,
        verifiedHead: second.head,
      }),
    ).toMatchObject({ action: "blocked", overlaps: [{ file: "shared.txt" }] });
  }, 20_000);

  test("heartbeats and recovers an abandoned integration lease", () => {
    const { root, repo, base } = createRepository();
    const task = createTask(repo, root, "recover", "recover.txt");
    createBatch(repo, { batchId: "batch-recover", defaultBranch: "alpha", base });
    register(repo, "batch-recover", task);
    sealBatch(repo, { batchId: "batch-recover" });
    expect(taskEnvironment(repo, { batchId: "batch-recover", taskId: task.taskId })).toMatchObject({
      baseSha: base,
      env: {
        OPENAGENT_BATCH_ID: "batch-recover",
        OPENAGENT_TASK_ID: "recover",
        PREFLIGHT_BASE: base,
      },
    });

    const election = markTaskReady(task.worktree, {
      batchId: "batch-recover",
      taskId: task.taskId,
      verifiedHead: task.head,
    });
    expect(election.action).toBe("integrate");
    const heartbeat = heartbeatBatch(repo, {
      batchId: "batch-recover",
      leaseId: election.leaseId,
    });
    expect(heartbeat.action).toBe("heartbeat");
    expect(heartbeat.lease.stale).toBe(false);

    expect(() => recoverBatch(repo, { batchId: "batch-recover", reason: "still-running" })).toThrow(
      "still active",
    );

    const statePath = join(repo, ".git", "openagent-owt", "batches", "batch-recover.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.integrator.heartbeatAt = new Date(
      Date.now() - INTEGRATION_LEASE_TTL_MS - 1,
    ).toISOString();
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const recovered = recoverBatch(repo, {
      batchId: "batch-recover",
      reason: "integrator-exited",
    });
    expect(recovered).toMatchObject({ action: "recovered", reason: "integrator-exited" });
    expect(recovered.leaseId).not.toBe(election.leaseId);
    expect(existsSync(recovered.integrationWorktree)).toBe(true);

    const integrationHead = mergeTasks(recovered.integrationWorktree, recovered.branches);
    const finalized = finalizeBatch(recovered.integrationWorktree, {
      batchId: "batch-recover",
      leaseId: recovered.leaseId,
      verifiedHead: integrationHead,
    });
    expect(finalized.action).toBe("integrated");
    cleanupBatch(repo, { batchId: "batch-recover", leaseId: recovered.leaseId });
  }, 20_000);
});
