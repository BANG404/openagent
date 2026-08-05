// @ts-nocheck -- Bun provides the test module at runtime.
import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildReconciliationPlan,
  isMatchingReadyPullRequest,
  prepareReconciliation,
} from "../.agents/skills/deliver-via-pr/scripts/reconcile-opr.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(repo, args, input) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    input,
  }).trim();
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "openagent-opr-test-"));
  temporaryRoots.push(root);
  const repo = join(root, "repo");
  const remote = join(root, "remote.git");
  mkdirSync(repo);
  git(repo, ["init", "--initial-branch=master"]);
  git(repo, ["config", "user.name", "OpenAgent Test"]);
  git(repo, ["config", "user.email", "openagent@example.com"]);
  git(repo, ["config", "core.autocrlf", "false"]);
  git(root, ["init", "--bare", remote]);
  git(repo, ["remote", "add", "origin", remote]);
  writeFileSync(join(repo, "base.txt"), "base\n");
  git(repo, ["add", "base.txt"]);
  git(repo, ["commit", "-m", "chore: base"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  git(repo, ["push", "origin", "master"]);
  git(repo, ["fetch", "origin"]);
  return { root, repo, remote, base };
}

function commitFile(repo, name, content, message) {
  writeFileSync(join(repo, name), content);
  git(repo, ["add", name]);
  git(repo, ["commit", "-m", message]);
  return git(repo, ["rev-parse", "HEAD"]);
}

describe("OPR history reconciliation", () => {
  test("keeps a linear unpublished tail without rebuilding it", () => {
    const { repo, base } = createRepository();
    const first = commitFile(repo, "first.txt", "first\n", "docs: first");
    const second = commitFile(repo, "second.txt", "second\n", "docs: second");

    const plan = buildReconciliationPlan(repo, { defaultBranch: "master" });

    expect(plan.boundary.localSha).toBe(base);
    expect(plan.commits).toEqual([first, second]);
    expect(plan.requiresRebuild).toBe(false);
    expect(plan.changedPaths).toEqual(["first.txt", "second.txt"]);
  }, 20_000);

  test("drops squash-equivalent history and replays only the unpublished tail", () => {
    const { root, repo } = createRepository();
    commitFile(repo, "published-a.txt", "a\n", "docs: published a");
    const publishedHead = commitFile(repo, "published-b.txt", "b\n", "docs: published b");
    const publishedTree = git(repo, ["rev-parse", `${publishedHead}^{tree}`]);
    const remoteParent = git(repo, ["rev-parse", "origin/master"]);
    const squash = git(
      repo,
      ["commit-tree", publishedTree, "-p", remoteParent],
      "docs: squash published work\n",
    );
    git(repo, ["push", "--force", "origin", `${squash}:refs/heads/master`]);
    git(repo, ["fetch", "origin"]);
    const convergence = git(
      repo,
      ["commit-tree", publishedTree, "-p", publishedHead, "-p", squash],
      "Merge remote squash\n",
    );
    git(repo, ["reset", "--hard", convergence]);
    const unpublished = commitFile(repo, "unpublished.txt", "new\n", "fix: unpublished");
    const originalHead = git(repo, ["rev-parse", "HEAD"]);
    const worktree = join(root, "task-worktree");

    const plan = buildReconciliationPlan(repo, { defaultBranch: "master" });
    expect(plan.boundary.localSha).toBe(convergence);
    expect(plan.boundary.remoteSha).toBe(squash);
    expect(plan.commits).toEqual([unpublished]);
    expect(plan.requiresRebuild).toBe(true);

    const prepared = prepareReconciliation(repo, {
      taskBranch: "agent/reconciled",
      worktreePath: worktree,
      defaultBranch: "master",
    });

    expect(git(repo, ["rev-parse", "master"])).toBe(originalHead);
    expect(git(repo, ["rev-parse", prepared.recoveryBranch])).toBe(originalHead);
    expect(git(worktree, ["diff", "--name-only", "origin/master", "HEAD"])).toBe("unpublished.txt");
    expect(prepared.rebasedCommits).toHaveLength(1);
    expect(prepared.preparedTaskHead).not.toBe(unpublished);
  }, 20_000);

  test("rejects a merge commit in the unpublished semantic tail", () => {
    const { repo, base } = createRepository();
    const first = commitFile(repo, "first.txt", "first\n", "docs: first");
    const tree = git(repo, ["rev-parse", `${first}^{tree}`]);
    const merge = git(repo, ["commit-tree", tree, "-p", first, "-p", base], "Merge tail\n");
    git(repo, ["reset", "--hard", merge]);

    expect(() => buildReconciliationPlan(repo, { defaultBranch: "master" })).toThrow(
      `Unpublished tail contains merge commit ${merge}`,
    );
  }, 20_000);

  test("requires the exact ready PR head and base before finalization", () => {
    const state = {
      taskBranch: "agent/reconciled",
      preparedTaskHead: "abc123",
      defaultBranch: "master",
    };
    const pullRequest = {
      state: "OPEN",
      isDraft: false,
      headRefName: "agent/reconciled",
      headRefOid: "abc123",
      baseRefName: "master",
    };

    expect(isMatchingReadyPullRequest(pullRequest, state)).toBe(true);
    expect(isMatchingReadyPullRequest({ ...pullRequest, headRefOid: "different" }, state)).toBe(
      false,
    );
    expect(isMatchingReadyPullRequest({ ...pullRequest, isDraft: true }, state)).toBe(false);
  });
});
