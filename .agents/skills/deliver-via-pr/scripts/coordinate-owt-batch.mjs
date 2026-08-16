#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const LOCK_WAIT_MS = 25;
const LOCK_TIMEOUT_MS = 30_000;
const STALE_LOCK_MS = 30_000;
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

/**
 * @typedef {{ path: string; branch?: string; detached?: boolean }} WorktreeRecord
 * @typedef {{
 *   taskId: string;
 *   branch: string;
 *   worktreePath: string;
 *   state: "running" | "ready";
 *   registeredHeadSha: string;
 *   registeredAt: string;
 *   headSha: string;
 *   readyAt?: string;
 * }} BatchTask
 * @typedef {{ taskId: string; leaseId: string; claimedAt: string }} BatchIntegrator
 * @typedef {{ branch: string; worktreePath: string; baseSha: string; preparedAt: string }} BatchIntegration
 * @typedef {{
 *   schemaVersion: number;
 *   batchId: string;
 *   repoRoot: string;
 *   defaultWorktreePath: string;
 *   defaultBranch: string;
 *   baseSha: string;
 *   sealed: boolean;
 *   state: "collecting" | "integrating" | "blocked" | "integrated";
 *   tasks: BatchTask[];
 *   createdAt: string;
 *   updatedAt: string;
 *   sealedAt?: string;
 *   integrator?: BatchIntegrator;
 *   integration?: BatchIntegration;
 *   blockedReason?: string;
 *   blockedAt?: string;
 *   lastObservedDefaultHead?: string;
 *   finalHead?: string;
 *   integratedAt?: string;
 *   cleanedAt?: string;
 *   removedWorktrees?: string[];
 *   removedBranches?: string[];
 * }} BatchState
 */

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** @param {string} repo @param {string[]} args */
function git(repo, args) {
  return run("git", args, repo);
}

/** @param {string} repo @param {string[]} args */
function gitSucceeds(repo, args) {
  const result = spawnSync("git", args, { cwd: repo, stdio: "ignore", shell: false });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git ${args.join(" ")} failed with status ${result.status ?? "unknown"}.`);
}

/** @param {unknown} error */
function errorCode(error) {
  return error instanceof Error && "code" in error
    ? /** @type {NodeJS.ErrnoException} */ (error).code
    : undefined;
}

/** @param {string} path */
function lockOwnerIsAlive(path) {
  try {
    const owner = JSON.parse(readFileSync(resolve(path, "owner.json"), "utf8"));
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) return false;
    try {
      process.kill(owner.pid, 0);
      return true;
    } catch (error) {
      return errorCode(error) === "EPERM";
    }
  } catch {
    return false;
  }
}

/** @param {string} repo @param {string} ref */
function refExists(repo, ref) {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", ref], {
    cwd: repo,
    stdio: "ignore",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1 || result.status === 128) return false;
  throw new Error(`Unable to inspect Git ref ${ref}; status ${result.status ?? "unknown"}.`);
}

/** @param {string} repo */
function repositoryRoot(repo) {
  return resolve(git(repo, ["rev-parse", "--show-toplevel"]));
}

/** @param {string} repo */
function commonDirectory(repo) {
  const common = git(repo, ["rev-parse", "--git-common-dir"]);
  return isAbsolute(common) ? resolve(common) : resolve(repositoryRoot(repo), common);
}

/** @param {string} value @param {string} label */
function requireIdentifier(value, label) {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${label} must match ${IDENTIFIER}.`);
  }
}

/** @param {string} repo @param {string} branch */
function requireBranchName(repo, branch) {
  if (!branch.startsWith("agent/")) {
    throw new Error(`OWT branches must use the agent/ prefix: ${branch}`);
  }
  git(repo, ["check-ref-format", "--branch", branch]);
}

/** @param {string} path */
function comparablePath(path) {
  const normalized = resolve(path).replaceAll("\\", "/").replace(/\/$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/** @param {string} repo */
function listWorktrees(repo) {
  /** @type {WorktreeRecord[]} */
  const records = [];
  /** @type {Partial<WorktreeRecord>} */
  let current = {};
  for (const line of git(repo, ["worktree", "list", "--porcelain"]).split(/\r?\n/)) {
    if (!line) {
      if (current.path) records.push({ ...current, path: current.path });
      current = {};
    } else if (line.startsWith("worktree ")) {
      current.path = resolve(line.slice("worktree ".length));
    } else if (line.startsWith("branch refs/heads/")) {
      current.branch = line.slice("branch refs/heads/".length);
    } else if (line === "detached") {
      current.detached = true;
    }
  }
  if (current.path) records.push({ ...current, path: current.path });
  return records;
}

/**
 * @param {string} repo
 * @param {string} path
 * @param {string} branch
 */
function requireRegisteredWorktree(repo, path, branch) {
  const record = listWorktrees(repo).find(
    (candidate) => comparablePath(candidate.path) === comparablePath(path),
  );
  if (!record) throw new Error(`Worktree is not registered: ${path}`);
  if (record.branch !== branch) {
    throw new Error(
      `Worktree ${path} is on ${record.branch ?? "detached HEAD"}, expected ${branch}.`,
    );
  }
  return record;
}

/** @param {string} repo */
function requireCleanWorktree(repo) {
  const status = git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) throw new Error(`Worktree must be completely clean: ${repositoryRoot(repo)}`);
}

/** @param {string} repo @param {string} ancestor @param {string} descendant */
function isAncestor(repo, ancestor, descendant) {
  return gitSucceeds(repo, ["merge-base", "--is-ancestor", ancestor, descendant]);
}

/** @param {string} repo @param {string} ref */
function commitSha(repo, ref) {
  return git(repo, ["rev-parse", "--verify", `${ref}^{commit}`]);
}

/** @param {string} root @param {string} batchId */
function batchPaths(root, batchId) {
  requireIdentifier(batchId, "Batch id");
  const directory = resolve(commonDirectory(root), "openagent-owt", "batches");
  const encoded = encodeURIComponent(batchId);
  return {
    directory,
    state: resolve(directory, `${encoded}.json`),
    lock: resolve(directory, `${encoded}.lock`),
    deliveryLock: resolve(commonDirectory(root), "openagent-owt", "delivery.lock"),
  };
}

/** @param {string} path @param {unknown} state */
function writeJsonAtomically(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

/** @param {string} path */
function acquireLock(path) {
  mkdirSync(dirname(path), { recursive: true });
  const startedAt = Date.now();
  while (true) {
    try {
      mkdirSync(path);
      writeFileSync(
        resolve(path, "owner.json"),
        `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
        "utf8",
      );
      return;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") {
        throw error;
      }
      let age;
      try {
        age = Date.now() - statSync(path).mtimeMs;
      } catch (statError) {
        if (errorCode(statError) === "ENOENT") {
          continue;
        }
        throw statError;
      }
      if (age > STALE_LOCK_MS && !lockOwnerIsAlive(path)) {
        const stale = `${path}.stale-${randomUUID()}`;
        try {
          renameSync(path, stale);
          rmSync(stale, { recursive: true, force: true });
        } catch {
          // Another process recovered or replaced the stale lock first.
        }
        continue;
      }
      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for OWT batch lock: ${path}`);
      }
      Atomics.wait(WAIT_BUFFER, 0, 0, LOCK_WAIT_MS);
    }
  }
}

/** @template T @param {string} path @param {() => T} callback */
function withLock(path, callback) {
  acquireLock(path);
  try {
    return callback();
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}

/** @param {string} root @param {string} batchId @returns {BatchState} */
function readBatch(root, batchId) {
  const path = batchPaths(root, batchId).state;
  if (!existsSync(path)) throw new Error(`OWT batch does not exist: ${batchId}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** @param {string} path @param {BatchState} state */
function saveBatch(path, state) {
  state.updatedAt = new Date().toISOString();
  writeJsonAtomically(path, state);
}

/** @param {BatchState} state */
function integrationResult(state) {
  if (!state.integrator || !state.integration) {
    throw new Error("The OWT batch has no prepared integration lease.");
  }
  return {
    action: "integrate",
    batchId: state.batchId,
    leaseId: state.integrator.leaseId,
    integrationBranch: state.integration.branch,
    integrationWorktree: state.integration.worktreePath,
    integrationBaseSha: state.integration.baseSha,
    defaultBranch: state.defaultBranch,
    branches: state.tasks.map((task) => ({
      taskId: task.taskId,
      branch: task.branch,
      headSha: task.headSha,
    })),
  };
}

/**
 * @param {string} repo
 * @param {{ batchId: string; defaultBranch?: string; base?: string }} options
 */
export function createBatch(repo, options) {
  const root = repositoryRoot(repo);
  const paths = batchPaths(root, options.batchId);
  return withLock(paths.lock, () => {
    if (existsSync(paths.state)) throw new Error(`OWT batch already exists: ${options.batchId}`);
    const defaultBranch = options.defaultBranch ?? git(root, ["branch", "--show-current"]);
    const currentBranch = git(root, ["branch", "--show-current"]);
    if (currentBranch !== defaultBranch) {
      throw new Error(`Create the batch from ${defaultBranch}, not ${currentBranch || "detached HEAD"}.`);
    }
    const defaultHead = commitSha(root, "HEAD");
    const baseSha = commitSha(root, options.base ?? "HEAD");
    if (baseSha !== defaultHead) {
      throw new Error("The OWT batch base must equal the committed default-branch HEAD.");
    }
    const now = new Date().toISOString();
    /** @type {BatchState} */
    const state = {
      schemaVersion: 1,
      batchId: options.batchId,
      repoRoot: root,
      defaultWorktreePath: root,
      defaultBranch,
      baseSha,
      sealed: false,
      state: "collecting",
      tasks: [],
      createdAt: now,
      updatedAt: now,
    };
    writeJsonAtomically(paths.state, state);
    return { action: "created", ...state, statePath: paths.state };
  });
}

/**
 * @param {string} repo
 * @param {{ batchId: string; taskId: string; branch: string; worktreePath: string }} options
 */
export function registerTask(repo, options) {
  const root = repositoryRoot(repo);
  requireIdentifier(options.taskId, "Task id");
  requireBranchName(root, options.branch);
  const paths = batchPaths(root, options.batchId);
  return withLock(paths.lock, () => {
    const state = readBatch(root, options.batchId);
    if (state.state !== "collecting" || state.sealed) {
      throw new Error(`OWT batch ${options.batchId} no longer accepts tasks.`);
    }
    if (state.tasks.some((task) => task.taskId === options.taskId)) {
      throw new Error(`Task id is already registered: ${options.taskId}`);
    }
    if (state.tasks.some((task) => task.branch === options.branch)) {
      throw new Error(`Task branch is already registered: ${options.branch}`);
    }
    const worktreePath = resolve(options.worktreePath);
    if (comparablePath(worktreePath) === comparablePath(state.defaultWorktreePath)) {
      throw new Error("A batch task cannot use the default worktree.");
    }
    requireRegisteredWorktree(root, worktreePath, options.branch);
    const headSha = commitSha(worktreePath, "HEAD");
    if (!isAncestor(root, state.baseSha, headSha)) {
      throw new Error(`Task branch ${options.branch} does not descend from batch base ${state.baseSha}.`);
    }
    state.tasks.push({
      taskId: options.taskId,
      branch: options.branch,
      worktreePath,
      state: "running",
      registeredHeadSha: headSha,
      registeredAt: new Date().toISOString(),
      headSha: "",
    });
    saveBatch(paths.state, state);
    return { action: "registered", batchId: state.batchId, taskId: options.taskId };
  });
}

/** @param {string} repo @param {{ batchId: string }} options */
export function sealBatch(repo, options) {
  const root = repositoryRoot(repo);
  const paths = batchPaths(root, options.batchId);
  return withLock(paths.lock, () => {
    const state = readBatch(root, options.batchId);
    if (state.state !== "collecting") {
      throw new Error(`Cannot seal OWT batch in state ${state.state}.`);
    }
    if (state.tasks.length === 0) throw new Error("Cannot seal an empty OWT batch.");
    state.sealed = true;
    state.sealedAt = new Date().toISOString();
    saveBatch(paths.state, state);
    return { action: "sealed", batchId: state.batchId, tasks: state.tasks.length };
  });
}

/** @param {BatchState} state */
function prepareIntegration(state) {
  const slug = state.batchId.toLowerCase().replaceAll(/[^a-z0-9-]/g, "-").slice(0, 40);
  const digest = createHash("sha256").update(state.batchId).digest("hex").slice(0, 8);
  const integrationName = `${slug}-${digest}`;
  const branch = `agent/integration-${integrationName}`;
  const worktreePath = resolve(
    dirname(state.defaultWorktreePath),
    `${basename(state.defaultWorktreePath)}-wt-integration-${integrationName}`,
  );
  requireBranchName(state.defaultWorktreePath, branch);
  if (existsSync(worktreePath)) {
    throw new Error(`Integration worktree path already exists: ${worktreePath}`);
  }
  if (refExists(state.defaultWorktreePath, `refs/heads/${branch}`)) {
    throw new Error(`Integration branch already exists: ${branch}`);
  }
  const defaultHead = commitSha(state.defaultWorktreePath, state.defaultBranch);
  if (!isAncestor(state.defaultWorktreePath, state.baseSha, defaultHead)) {
    throw new Error(
      `Default branch ${state.defaultBranch} no longer descends from batch base ${state.baseSha}.`,
    );
  }
  git(state.defaultWorktreePath, ["worktree", "add", "-b", branch, worktreePath, defaultHead]);
  state.integration = {
    branch,
    worktreePath,
    baseSha: defaultHead,
    preparedAt: new Date().toISOString(),
  };
}

/**
 * @param {string} repo
 * @param {{ batchId: string; taskId: string; verifiedHead: string }} options
 */
export function markTaskReady(repo, options) {
  const taskRoot = repositoryRoot(repo);
  const paths = batchPaths(taskRoot, options.batchId);
  return withLock(paths.lock, () => {
    const state = readBatch(taskRoot, options.batchId);
    const task = state.tasks.find((candidate) => candidate.taskId === options.taskId);
    if (!task) throw new Error(`Task is not registered in batch ${options.batchId}: ${options.taskId}`);
    requireRegisteredWorktree(taskRoot, task.worktreePath, task.branch);
    if (comparablePath(taskRoot) !== comparablePath(task.worktreePath)) {
      throw new Error(`Mark task ready from its own worktree: ${task.worktreePath}`);
    }
    requireCleanWorktree(taskRoot);
    const currentBranch = git(taskRoot, ["branch", "--show-current"]);
    if (currentBranch !== task.branch) {
      throw new Error(`Task worktree is on ${currentBranch || "detached HEAD"}, expected ${task.branch}.`);
    }
    const headSha = commitSha(taskRoot, "HEAD");
    const verifiedHead = commitSha(taskRoot, options.verifiedHead);
    if (headSha !== verifiedHead) {
      throw new Error(`Preflight verification covered ${verifiedHead}, but task HEAD is ${headSha}.`);
    }
    if (!isAncestor(taskRoot, state.baseSha, headSha)) {
      throw new Error(`Task HEAD ${headSha} no longer descends from batch base ${state.baseSha}.`);
    }
    if (task.state === "ready" && task.headSha !== headSha) {
      throw new Error(`Ready task ${task.taskId} moved from ${task.headSha} to ${headSha}.`);
    }
    if (state.state === "integrating") {
      if (!state.integrator) throw new Error("The integrating batch has no lease owner.");
      return state.integrator.taskId === task.taskId
        ? integrationResult(state)
        : {
            action: "finish",
            batchId: state.batchId,
            reason: "another-agent-is-integrating",
            integratorTaskId: state.integrator.taskId,
          };
    }
    if (state.state === "integrated") {
      return { action: "finish", batchId: state.batchId, reason: "batch-already-integrated" };
    }
    if (state.state === "blocked") {
      return { action: "blocked", batchId: state.batchId, reason: state.blockedReason };
    }
    if (!state.sealed) {
      return { action: "blocked", batchId: state.batchId, reason: "batch-not-sealed" };
    }

    task.state = "ready";
    task.headSha = headSha;
    task.readyAt = new Date().toISOString();
    saveBatch(paths.state, state);

    const pending = state.tasks.filter((candidate) => candidate.state !== "ready");
    if (pending.length > 0) {
      return {
        action: "finish",
        batchId: state.batchId,
        reason: "waiting-for-other-tasks",
        pendingTaskIds: pending.map((candidate) => candidate.taskId),
      };
    }

    state.state = "integrating";
    state.integrator = {
      taskId: task.taskId,
      leaseId: randomUUID(),
      claimedAt: new Date().toISOString(),
    };
    saveBatch(paths.state, state);
    try {
      prepareIntegration(state);
      saveBatch(paths.state, state);
      return integrationResult(state);
    } catch (error) {
      state.state = "blocked";
      state.blockedReason = error instanceof Error ? error.message : String(error);
      state.blockedAt = new Date().toISOString();
      saveBatch(paths.state, state);
      return { action: "blocked", batchId: state.batchId, reason: state.blockedReason };
    }
  });
}

/**
 * @param {string} repo
 * @param {{ batchId: string; leaseId: string; reason: string }} options
 */
export function blockBatch(repo, options) {
  const root = repositoryRoot(repo);
  const paths = batchPaths(root, options.batchId);
  return withLock(paths.lock, () => {
    const state = readBatch(root, options.batchId);
    if (state.state !== "integrating" && state.state !== "blocked") {
      throw new Error(`Cannot block OWT batch in state ${state.state}.`);
    }
    if (state.integrator?.leaseId !== options.leaseId) {
      throw new Error("The integration lease does not match this batch.");
    }
    state.state = "blocked";
    state.blockedReason = options.reason;
    state.blockedAt = new Date().toISOString();
    saveBatch(paths.state, state);
    return { action: "blocked", batchId: state.batchId, reason: state.blockedReason };
  });
}

/**
 * @param {string} repo
 * @param {{ batchId: string; leaseId: string; verifiedHead: string }} options
 */
export function finalizeBatch(repo, options) {
  const root = repositoryRoot(repo);
  const paths = batchPaths(root, options.batchId);
  return withLock(paths.lock, () =>
    withLock(paths.deliveryLock, () => {
      const state = readBatch(root, options.batchId);
      if (state.state !== "integrating" && state.state !== "blocked") {
        throw new Error(`Cannot finalize OWT batch in state ${state.state}.`);
      }
      if (state.integrator?.leaseId !== options.leaseId) {
        throw new Error("The integration lease does not match this batch.");
      }
      if (!state.integration) {
        throw new Error("The batch has no prepared integration worktree.");
      }
      requireRegisteredWorktree(
        state.defaultWorktreePath,
        state.integration.worktreePath,
        state.integration.branch,
      );
      requireCleanWorktree(state.integration.worktreePath);
      const integrationHead = commitSha(state.integration.worktreePath, "HEAD");
      const verifiedHead = commitSha(state.integration.worktreePath, options.verifiedHead);
      if (integrationHead !== verifiedHead) {
        throw new Error(
          `Combined preflight covered ${verifiedHead}, but integration HEAD is ${integrationHead}.`,
        );
      }
      for (const task of state.tasks) {
        if (commitSha(state.defaultWorktreePath, task.branch) !== task.headSha) {
          throw new Error(`Ready task branch moved after election: ${task.branch}`);
        }
        if (!isAncestor(state.integration.worktreePath, task.headSha, integrationHead)) {
          throw new Error(`Integration HEAD does not contain ${task.branch} at ${task.headSha}.`);
        }
      }

      requireRegisteredWorktree(
        state.defaultWorktreePath,
        state.defaultWorktreePath,
        state.defaultBranch,
      );
      const defaultHead = commitSha(state.defaultWorktreePath, state.defaultBranch);
      if (!isAncestor(state.defaultWorktreePath, state.baseSha, defaultHead)) {
        state.state = "blocked";
        state.blockedReason = `Default branch ${state.defaultBranch} no longer descends from batch base ${state.baseSha}.`;
        state.blockedAt = new Date().toISOString();
        saveBatch(paths.state, state);
        return { action: "blocked", batchId: state.batchId, reason: state.blockedReason };
      }
      if (!isAncestor(state.integration.worktreePath, defaultHead, integrationHead)) {
        state.lastObservedDefaultHead = defaultHead;
        saveBatch(paths.state, state);
        return {
          action: "refresh",
          batchId: state.batchId,
          defaultBranch: state.defaultBranch,
          defaultHead,
          integrationWorktree: state.integration.worktreePath,
          reason: "default-branch-advanced",
        };
      }

      requireCleanWorktree(state.defaultWorktreePath);
      try {
        git(state.defaultWorktreePath, ["merge", "--ff-only", integrationHead]);
      } catch (error) {
        const latestDefaultHead = commitSha(state.defaultWorktreePath, state.defaultBranch);
        if (
          latestDefaultHead !== defaultHead &&
          isAncestor(state.defaultWorktreePath, state.baseSha, latestDefaultHead)
        ) {
          state.lastObservedDefaultHead = latestDefaultHead;
          saveBatch(paths.state, state);
          return {
            action: "refresh",
            batchId: state.batchId,
            defaultBranch: state.defaultBranch,
            defaultHead: latestDefaultHead,
            integrationWorktree: state.integration.worktreePath,
            reason: "default-branch-advanced",
          };
        }
        throw error;
      }
      const finalHead = commitSha(state.defaultWorktreePath, "HEAD");
      if (finalHead !== integrationHead) {
        throw new Error("The default branch did not reach the verified integration HEAD.");
      }
      state.state = "integrated";
      state.finalHead = finalHead;
      state.integratedAt = new Date().toISOString();
      delete state.blockedReason;
      delete state.blockedAt;
      saveBatch(paths.state, state);
      return {
        action: "integrated",
        batchId: state.batchId,
        defaultBranch: state.defaultBranch,
        finalHead,
        cleanupRequired: true,
      };
    }),
  );
}

/** @param {string} repo @param {string} branch */
function branchExists(repo, branch) {
  return refExists(repo, `refs/heads/${branch}`);
}

/**
 * @param {string} repo
 * @param {{ batchId: string; leaseId: string }} options
 */
export function cleanupBatch(repo, options) {
  const root = repositoryRoot(repo);
  const paths = batchPaths(root, options.batchId);
  return withLock(paths.lock, () =>
    withLock(paths.deliveryLock, () => {
      const state = readBatch(root, options.batchId);
      if (state.state !== "integrated") {
        throw new Error(`Cannot clean up OWT batch in state ${state.state}.`);
      }
      if (state.integrator?.leaseId !== options.leaseId) {
        throw new Error("The integration lease does not match this batch.");
      }
      if (comparablePath(root) !== comparablePath(state.defaultWorktreePath)) {
        throw new Error(`Run cleanup from the default worktree: ${state.defaultWorktreePath}`);
      }
      if (!state.integration || !state.finalHead) {
        throw new Error("The integrated batch is missing its final integration identity.");
      }
      requireRegisteredWorktree(root, state.defaultWorktreePath, state.defaultBranch);
      requireCleanWorktree(root);
      const defaultHead = commitSha(root, "HEAD");
      const targets = [
        ...state.tasks.map((task) => ({
          branch: task.branch,
          worktreePath: task.worktreePath,
          headSha: task.headSha,
        })),
        {
          branch: state.integration.branch,
          worktreePath: state.integration.worktreePath,
          headSha: state.finalHead,
        },
      ];
      const removedWorktrees = [];
      const removedBranches = [];
      for (const target of targets) {
        if (!isAncestor(root, target.headSha, defaultHead)) {
          throw new Error(`Refusing to remove unmerged branch ${target.branch}.`);
        }
        const record = listWorktrees(root).find(
          (candidate) => comparablePath(candidate.path) === comparablePath(target.worktreePath),
        );
        if (record) {
          requireRegisteredWorktree(root, target.worktreePath, target.branch);
          requireCleanWorktree(target.worktreePath);
          git(root, ["worktree", "remove", target.worktreePath]);
          removedWorktrees.push(target.worktreePath);
        }
        if (branchExists(root, target.branch)) {
          git(root, ["branch", "-d", target.branch]);
          removedBranches.push(target.branch);
        }
      }
      state.cleanedAt = new Date().toISOString();
      state.removedWorktrees = removedWorktrees;
      state.removedBranches = removedBranches;
      saveBatch(paths.state, state);
      return {
        action: "cleaned",
        batchId: state.batchId,
        removedWorktrees,
        removedBranches,
        statePath: paths.state,
      };
    }),
  );
}

/** @param {string} repo @param {{ batchId: string }} options */
export function batchStatus(repo, options) {
  return readBatch(repositoryRoot(repo), options.batchId);
}

function parseArguments() {
  const [command = "status", ...args] = process.argv.slice(2);
  /** @type {Record<string, string>} */
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(`Unknown or incomplete argument: ${key ?? ""}`);
    }
    options[key.slice(2)] = value;
  }
  return { command, options };
}

/** @param {Record<string, string>} options @param {string} name */
function requireOption(options, name) {
  const value = options[name];
  if (!value) throw new Error(`Missing required option: --${name}`);
  return value;
}

function main() {
  const { command, options } = parseArguments();
  const repo = options.repo ?? ".";
  const batchId = requireOption(options, "batch");
  let result;
  if (command === "create") {
    result = createBatch(repo, {
      batchId,
      defaultBranch: options.default,
      base: options.base,
    });
  } else if (command === "register") {
    result = registerTask(repo, {
      batchId,
      taskId: requireOption(options, "task"),
      branch: requireOption(options, "branch"),
      worktreePath: requireOption(options, "worktree"),
    });
  } else if (command === "seal") {
    result = sealBatch(repo, { batchId });
  } else if (command === "ready") {
    result = markTaskReady(repo, {
      batchId,
      taskId: requireOption(options, "task"),
      verifiedHead: requireOption(options, "verified-head"),
    });
  } else if (command === "finalize") {
    result = finalizeBatch(repo, {
      batchId,
      leaseId: requireOption(options, "lease"),
      verifiedHead: requireOption(options, "verified-head"),
    });
  } else if (command === "block") {
    result = blockBatch(repo, {
      batchId,
      leaseId: requireOption(options, "lease"),
      reason: requireOption(options, "reason"),
    });
  } else if (command === "cleanup") {
    result = cleanupBatch(repo, {
      batchId,
      leaseId: requireOption(options, "lease"),
    });
  } else if (command === "status") {
    result = batchStatus(repo, { batchId });
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
