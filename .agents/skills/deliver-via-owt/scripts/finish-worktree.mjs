#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { withLocalDeliveryLock } from "./coordinate-owt-batch.mjs";

/** @param {string} repo @param {string[]} args */
function git(repo, args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** @param {string} repo @param {string} ancestor @param {string} head */
function isAncestor(repo, ancestor, head) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, head], {
    cwd: repo,
    stdio: "ignore",
  });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error("Cannot verify local Git ancestry.");
}

/** @param {string} path */
function normalizedPath(path) {
  const absolute = realpathSync(path).replaceAll("\\", "/");
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

/** @param {string} repo */
function defaultWorktree(repo) {
  const matches = git(repo, ["worktree", "list", "--porcelain", "-z"])
    .split("\0\0")
    .map((record) => record.split("\0"))
    .filter((fields) => fields.includes("branch refs/heads/alpha"));
  const path = matches[0]?.find((field) => field.startsWith("worktree "))?.slice(9);
  if (matches.length !== 1 || !path) {
    throw new Error("Identify one registered local alpha worktree before delivery.");
  }
  if (normalizedPath(path) === normalizedPath(repo)) {
    throw new Error("Run finish-worktree from the isolated task checkout, not local alpha.");
  }
  return path;
}

/** @param {string} repo */
function requireStagedOnly(repo) {
  if (
    git(repo, ["diff", "--name-only"]) ||
    git(repo, ["ls-files", "--others", "--exclude-standard"])
  ) {
    throw new Error(
      "Review and stage intended files first; unstaged or untracked task files remain.",
    );
  }
}

/** @param {string} repo */
function requireClean(repo) {
  if (git(repo, ["status", "--porcelain=v1", "--untracked-files=all"])) {
    throw new Error(`Checkout has uncommitted changes; preserve them before delivery: ${repo}`);
  }
}

/** @param {string} repo @param {string} base */
function preflight(repo, base) {
  const result = spawnSync(process.execPath, ["run", "preflight", "--base", base], {
    cwd: repo,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Preflight failed; local alpha was not updated.");
}

/**
 * Validate, commit the reviewed index, and deliver an isolated checkout to alpha.
 * Detached HEAD and existing task branches share the same path. No worktree,
 * task branch, batch manifest, push, or directory cleanup is created here.
 *
 * @param {string} repo
 * @param {{ base: string; message?: string }} options
 * @param {(repo: string, base: string) => void} [verify]
 */
export function finishWorktree(repo, options, verify = preflight) {
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(options.base)) {
    throw new Error("--base must be the full immutable local alpha SHA recorded before editing.");
  }
  const root = git(repo, ["rev-parse", "--show-toplevel"]);
  const destination = defaultWorktree(root);
  const base = git(root, ["rev-parse", "--verify", `${options.base}^{commit}`]);
  const branch = git(root, ["branch", "--show-current"]);
  if (!isAncestor(root, base, "HEAD") || !isAncestor(root, base, "refs/heads/alpha")) {
    throw new Error("Task and local alpha must descend from the recorded local base.");
  }
  requireStagedOnly(root);
  const staged = git(root, ["write-tree"]) !== git(root, ["rev-parse", "HEAD^{tree}"]);
  if (staged && !options.message?.trim()) {
    throw new Error("Staged changes require --message with a reviewed commit message.");
  }
  let verifiedHead = "";
  let taskCommit = "";
  // Bound automatic retries when other deliveries continuously advance alpha.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    requireStagedOnly(root);
    if (git(root, ["branch", "--show-current"]) !== branch) {
      throw new Error("Task branch changed during delivery; inspect the checkout before retrying.");
    }
    const before = git(root, ["rev-parse", "HEAD"]);
    const tree = git(root, ["write-tree"]);
    verify(root, base);
    requireStagedOnly(root);
    if (
      git(root, ["rev-parse", "HEAD"]) !== before ||
      git(root, ["write-tree"]) !== tree ||
      git(root, ["branch", "--show-current"]) !== branch
    ) {
      throw new Error("Task changed during preflight; rerun verification for the current source.");
    }
    if (tree !== git(root, ["rev-parse", "HEAD^{tree}"])) {
      git(root, ["commit", "-m", options.message ?? ""]);
      if (git(root, ["rev-parse", "HEAD^{tree}"]) !== tree) {
        throw new Error("Commit hooks changed the verified tree; rerun preflight before delivery.");
      }
    }
    requireClean(root);
    verifiedHead = git(root, ["rev-parse", "HEAD"]);
    taskCommit ||= verifiedHead;
    const result = withLocalDeliveryLock(root, () => {
      if (normalizedPath(defaultWorktree(root)) !== normalizedPath(destination)) {
        throw new Error("Local alpha moved to another checkout; inspect before retrying.");
      }
      const defaultHead = git(destination, ["rev-parse", "HEAD"]);
      if (!isAncestor(root, base, defaultHead)) {
        throw new Error(
          "Local alpha no longer descends from the recorded base; preserve both histories.",
        );
      }
      requireClean(destination);
      requireClean(root);
      if (
        git(root, ["rev-parse", "HEAD"]) !== verifiedHead ||
        git(root, ["branch", "--show-current"]) !== branch
      ) {
        throw new Error("Task advanced after verification; rerun preflight before delivery.");
      }
      if (!isAncestor(root, defaultHead, verifiedHead)) return { refresh: defaultHead };
      // An immutable verified SHA works for detached HEAD without a task branch.
      try {
        git(destination, ["merge", "--ff-only", verifiedHead]);
      } catch (error) {
        const latest = git(destination, ["rev-parse", "HEAD"]);
        if (latest !== defaultHead && isAncestor(root, defaultHead, latest)) {
          return { refresh: latest };
        }
        throw error;
      }
      if (!isAncestor(root, verifiedHead, git(destination, ["rev-parse", "HEAD"]))) {
        throw new Error("Local alpha did not retain the verified delivery.");
      }
      return { refresh: "" };
    });
    if (!result.refresh) {
      return {
        action: "integrated",
        defaultWorktree: destination,
        defaultBranch: "alpha",
        taskCommit,
        verifiedHead,
        taskBranch: branch || null,
        worktreeRetained: true,
        pushed: false,
      };
    }
    // Preserve both histories. A real conflict remains in this task checkout.
    git(root, ["merge", "--no-edit", result.refresh]);
  }
  throw new Error("Local alpha kept advancing; task commits are preserved. Retry finish-worktree.");
}

/** @param {string[]} args */
function parseArguments(args) {
  /** @type {Record<string, string>} */
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!["--repo", "--base", "--message"].includes(key) || !value?.trim()) {
      throw new Error(
        "Usage: bun finish-worktree.mjs --base <local-base-sha> [--repo <path>] [--message <commit-message>]",
      );
    }
    if (options[key]) throw new Error(`Repeated option: ${key}`);
    options[key] = value;
  }
  if (!options["--base"])
    throw new Error("--base must be the local alpha SHA recorded before editing.");
  return { repo: options["--repo"] ?? ".", base: options["--base"], message: options["--message"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    console.log(JSON.stringify(finishWorktree(options.repo, options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
