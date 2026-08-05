#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string; input?: string }} options
 */
function run(command, args, options) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  }).trim();
}

/** @param {string} repo @param {string[]} args */
function git(repo, args) {
  return run("git", args, { cwd: repo });
}

/** @param {string} repo */
function repositoryRoot(repo) {
  return resolve(git(repo, ["rev-parse", "--show-toplevel"]));
}

/** @param {string} repo */
function requireCleanWorktree(repo) {
  const status = git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status)
    throw new Error("The default worktree must be completely clean before OPR reconciliation.");
}

/** @param {string} repo @param {string} remote @param {string | undefined} requested */
function resolveDefaultBranch(repo, remote, requested) {
  if (requested) return requested;
  try {
    return git(repo, ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`]).replace(
      `${remote}/`,
      "",
    );
  } catch {
    return git(repo, ["branch", "--show-current"]);
  }
}

/**
 * @param {string} repo
 * @param {string} sha
 */
function commitPatchId(repo, sha) {
  const patch = execFileSync(
    "git",
    ["show", "--pretty=format:", "--binary", "--no-ext-diff", sha],
    {
      cwd: repo,
      encoding: "utf8",
    },
  );
  const result = spawnSync("git", ["patch-id", "--stable"], {
    cwd: repo,
    encoding: "utf8",
    input: patch,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || `Unable to compute patch id for ${sha}.`);
  const patchId = result.stdout.trim().split(/\s+/)[0];
  if (!patchId) throw new Error(`Commit ${sha} has no reproducible patch id.`);
  return patchId;
}

/**
 * Find the newest first-parent commit whose complete tree already exists in the
 * remote default history. Everything after it is the unpublished semantic tail.
 *
 * @param {string} repo
 * @param {{ remote?: string; defaultBranch?: string }} [options]
 */
export function buildReconciliationPlan(repo, options = {}) {
  const root = repositoryRoot(repo);
  const remote = options.remote ?? "origin";
  const defaultBranch = resolveDefaultBranch(root, remote, options.defaultBranch);
  const baseRef = `${remote}/${defaultBranch}`;

  requireCleanWorktree(root);
  const currentBranch = git(root, ["branch", "--show-current"]);
  if (currentBranch !== defaultBranch) {
    throw new Error(
      `Run reconciliation from ${defaultBranch}, not ${currentBranch || "detached HEAD"}.`,
    );
  }

  const baseSha = git(root, ["rev-parse", "--verify", baseRef]);
  const originalHead = git(root, ["rev-parse", "HEAD"]);
  const remoteHistory = git(root, ["log", "--format=%H%x09%T", baseRef])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, tree] = line.split("\t");
      return { sha, tree };
    });
  const remoteByTree = new Map(remoteHistory.map(({ sha, tree }) => [tree, sha]));
  const localHistory = git(root, ["log", "--first-parent", "--format=%H%x09%T%x09%P", "HEAD"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, tree, parents = ""] = line.split("\t");
      return { sha, tree, parents: parents.split(" ").filter(Boolean) };
    });

  const boundaryIndex = localHistory.findIndex(({ tree }) => remoteByTree.has(tree));
  if (boundaryIndex < 0) {
    throw new Error(
      `No content-equivalent boundary exists between local ${defaultBranch} and ${baseRef}; reconcile manually.`,
    );
  }

  const boundary = localHistory[boundaryIndex];
  const commits = localHistory.slice(0, boundaryIndex).reverse();
  if (commits.length === 0) {
    throw new Error(`Local ${defaultBranch} has no unpublished content relative to ${baseRef}.`);
  }
  const mergeCommit = commits.find(({ parents }) => parents.length > 1);
  if (mergeCommit) {
    throw new Error(
      `Unpublished tail contains merge commit ${mergeCommit.sha}; automatic OPR reconciliation requires a linear tail.`,
    );
  }

  const changedPaths = git(root, ["diff", "--name-only", boundary.sha, originalHead])
    .split(/\r?\n/)
    .filter(Boolean);

  return {
    schemaVersion: 1,
    repoRoot: root,
    remote,
    defaultBranch,
    baseRef,
    baseSha,
    originalHead,
    boundary: {
      localSha: boundary.sha,
      remoteSha: remoteByTree.get(boundary.tree),
      tree: boundary.tree,
    },
    commits: commits.map(({ sha }) => sha),
    changedPaths,
    requiresRebuild: boundary.sha !== baseSha,
  };
}

/** @param {string} root @param {string} taskBranch */
function statePath(root, taskBranch) {
  const commonDir = git(root, ["rev-parse", "--git-common-dir"]);
  const absoluteCommonDir = isAbsolute(commonDir) ? commonDir : resolve(root, commonDir);
  return resolve(absoluteCommonDir, "openagent-opr", `${encodeURIComponent(taskBranch)}.json`);
}

/** @param {string} repo @param {string} remote */
function fetchRemote(repo, remote) {
  run("git", ["fetch", remote], { cwd: repo });
}

/**
 * @param {string} repo
 * @param {{ taskBranch: string; worktreePath: string; recoveryBranch?: string; remote?: string; defaultBranch?: string }} options
 */
export function prepareReconciliation(repo, options) {
  if (!options.taskBranch?.startsWith("agent/")) {
    throw new Error("The OPR task branch must use the agent/ prefix.");
  }
  if (!options.worktreePath) throw new Error("A dedicated OPR worktree path is required.");
  const root = repositoryRoot(repo);
  fetchRemote(root, options.remote ?? "origin");
  const plan = buildReconciliationPlan(root, options);
  const worktreePath = resolve(options.worktreePath);
  if (existsSync(worktreePath)) throw new Error(`Worktree path already exists: ${worktreePath}`);

  const taskRef = `refs/heads/${options.taskBranch}`;
  try {
    git(root, ["show-ref", "--verify", taskRef]);
    throw new Error(`Local task branch already exists: ${options.taskBranch}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Local task branch")) throw error;
  }

  const recoveryBranch =
    options.recoveryBranch ??
    `backup/opr-${options.taskBranch.slice("agent/".length).replaceAll("/", "-")}-${plan.originalHead.slice(0, 8)}`;
  const recoveryRef = `refs/heads/${recoveryBranch}`;
  try {
    git(root, ["show-ref", "--verify", recoveryRef]);
    throw new Error(`Recovery branch already exists: ${recoveryBranch}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Recovery branch")) throw error;
  }

  git(root, ["branch", recoveryBranch, plan.originalHead]);
  const taskStart = plan.requiresRebuild ? plan.baseSha : plan.originalHead;
  git(root, ["branch", options.taskBranch, taskStart]);
  git(root, ["worktree", "add", worktreePath, options.taskBranch]);

  /** @type {string[]} */
  const rebasedCommits = [];
  if (plan.requiresRebuild) {
    for (const originalCommit of plan.commits) {
      try {
        git(worktreePath, ["cherry-pick", originalCommit]);
      } catch {
        throw new Error(
          `Cherry-pick conflict while replaying ${originalCommit}. Resolve or abort it only inside ${worktreePath}; the default worktree and ${recoveryBranch} remain untouched.`,
        );
      }
      const rebasedCommit = git(worktreePath, ["rev-parse", "HEAD"]);
      if (commitPatchId(root, originalCommit) !== commitPatchId(worktreePath, rebasedCommit)) {
        throw new Error(`Patch verification failed while replaying ${originalCommit}.`);
      }
      rebasedCommits.push(rebasedCommit);
    }
  } else {
    rebasedCommits.push(...plan.commits);
  }

  const preparedTaskHead = git(worktreePath, ["rev-parse", "HEAD"]);
  const state = {
    ...plan,
    taskBranch: options.taskBranch,
    worktreePath,
    recoveryBranch,
    preparedTaskHead,
    rebasedCommits,
    finalized: false,
  };
  const path = statePath(root, options.taskBranch);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return { ...state, statePath: path };
}

/**
 * @param {{ state: string; isDraft: boolean; headRefName: string; headRefOid: string; baseRefName: string }} pullRequest
 * @param {{ taskBranch: string; preparedTaskHead: string; defaultBranch: string }} state
 */
export function isMatchingReadyPullRequest(pullRequest, state) {
  return (
    pullRequest.state === "OPEN" &&
    pullRequest.isDraft === false &&
    pullRequest.headRefName === state.taskBranch &&
    pullRequest.headRefOid === state.preparedTaskHead &&
    pullRequest.baseRefName === state.defaultBranch
  );
}

/**
 * @param {string} repo
 * @param {{ taskBranch: string; pr: string; remote?: string }} options
 */
export function finalizeReconciliation(repo, options) {
  if (!options.taskBranch?.startsWith("agent/")) {
    throw new Error("The OPR task branch must use the agent/ prefix.");
  }
  if (!options.pr) throw new Error("The ready PR number or URL is required for finalization.");
  const root = repositoryRoot(repo);
  const path = statePath(root, options.taskBranch);
  if (!existsSync(path))
    throw new Error(`No prepared OPR reconciliation state exists for ${options.taskBranch}.`);
  const state = JSON.parse(readFileSync(path, "utf8"));
  const remote = options.remote ?? state.remote;
  fetchRemote(root, remote);
  requireCleanWorktree(root);

  const currentBranch = git(root, ["branch", "--show-current"]);
  if (currentBranch !== state.defaultBranch) {
    throw new Error(
      `Finalize from ${state.defaultBranch}, not ${currentBranch || "detached HEAD"}.`,
    );
  }
  if (git(root, ["rev-parse", "HEAD"]) !== state.originalHead) {
    throw new Error("The default branch moved after OPR preparation; refusing to reset it.");
  }
  if (git(root, ["rev-parse", state.taskBranch]) !== state.preparedTaskHead) {
    throw new Error("The local task branch no longer matches the prepared OPR head.");
  }
  if (git(root, ["rev-parse", state.recoveryBranch]) !== state.originalHead) {
    throw new Error("The recovery branch no longer preserves the original default head.");
  }

  const remoteLine = git(root, [
    "ls-remote",
    "--heads",
    remote,
    `refs/heads/${options.taskBranch}`,
  ]);
  const remoteHead = remoteLine.split(/\s+/)[0] ?? "";
  if (remoteHead !== state.preparedTaskHead) {
    throw new Error("The remote task branch does not match the prepared OPR head.");
  }

  const repository = run(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    {
      cwd: root,
    },
  );
  const pullRequest = JSON.parse(
    run(
      "gh",
      [
        "pr",
        "view",
        options.pr,
        "--repo",
        repository,
        "--json",
        "state,isDraft,headRefName,headRefOid,baseRefName,url",
      ],
      { cwd: root },
    ),
  );
  if (!isMatchingReadyPullRequest(pullRequest, state)) {
    throw new Error("The ready PR does not exactly match the prepared task head and default base.");
  }

  const finalBaseSha = git(root, ["rev-parse", `${remote}/${state.defaultBranch}`]);
  git(root, ["reset", "--hard", finalBaseSha]);
  if (git(root, ["rev-parse", "HEAD"]) !== finalBaseSha) {
    throw new Error("The default branch did not align with its remote after finalization.");
  }
  state.finalized = true;
  state.finalBaseSha = finalBaseSha;
  state.pr = pullRequest.url;
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return { ...state, statePath: path };
}

function parseArguments() {
  const [command = "plan", ...args] = process.argv.slice(2);
  /** @type {Record<string, string>} */
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value)
      throw new Error(`Unknown or incomplete argument: ${key ?? ""}`);
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function main() {
  const { command, options } = parseArguments();
  const repo = options.repo ?? ".";
  let result;
  if (command === "plan") {
    if (options.fetch !== "false") fetchRemote(repositoryRoot(repo), options.remote ?? "origin");
    result = buildReconciliationPlan(repo, {
      remote: options.remote,
      defaultBranch: options.default,
    });
  } else if (command === "prepare") {
    result = prepareReconciliation(repo, {
      taskBranch: options.task,
      worktreePath: options.worktree,
      recoveryBranch: options.recovery,
      remote: options.remote,
      defaultBranch: options.default,
    });
  } else if (command === "finalize") {
    result = finalizeReconciliation(repo, {
      taskBranch: options.task,
      pr: options.pr,
      remote: options.remote,
    });
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
