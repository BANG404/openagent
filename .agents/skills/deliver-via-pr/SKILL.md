---
name: deliver-via-pr
description: Deliver repository-changing OpenAgent tasks through an isolated git worktree, an agent/* branch, a ready GitHub pull request, authoritative PR CI, policy-correct merge, and safe cleanup. Use for every task that edits this repository unless the user explicitly requests local-only work, uncommitted changes, no push, or no merge.
---

# Deliver via PR

## Overview

Treat the pull request as the unit of delivery. Keep the default worktree and
unrelated work untouched, rely on GitHub Actions for delivery verification, and
retain the task worktree until the merge is confirmed.

## 1. Establish scope

- Read the nearest `AGENTS.md` and the mapped source-of-truth documentation.
- Run `git status --short --branch`, `git worktree list`, `gh auth status`, and
  resolve the remote default branch.
- If the user requests diagnosis or review only, do not create a branch or make
  changes.
- If the user excludes a delivery stage, stop the workflow before that stage.
- Follow `sdk/AGENTS.md` for SDK work. Deliver the SDK repository first, then
  update the parent gitlink through this workflow.

## 2. Create the task worktree

- Fetch `origin/master`.
- Choose a unique `agent/<task-slug>` branch and a non-existing sibling path
  named `openagent-wt-<task-slug>`.
- Create the worktree from `origin/master`, not from a stale local `master`.
- Never relocate, reset, clean, or reuse unrelated worktrees. If intended task
  changes already exist elsewhere, stop and preserve them rather than copying
  or deleting ambiguously.

## 3. Implement and commit

- Make implementation, focused test coverage, and agent-facing documentation
  changes together.
- Do not run local lint, test, check, build, or documentation-sync commands that
  duplicate CI. Run only implementation-time interactive checks, explicitly
  requested checks, and artifact validators mandated by another selected skill.
- Before committing, inspect `git status`, the complete diff, and
  `git diff --check`.
- Stage explicit paths only. Create focused Conventional Commits using the
  repository's allowed types.

## 4. Push and open the PR

- Push the task branch with upstream tracking.
- Open a ready PR against `master`; do not use a draft because CI and merge are
  part of the requested delivery.
- Describe user-visible behavior, affected boundaries, documentation, and the
  fact that local test suites were intentionally deferred to PR CI.
- Never include unrelated commits or files. If the base moved and strict CI
  requires an update, update the branch without rewriting user-owned history.

## 5. Let CI verify

- Watch the PR checks until `Required` completes. Do not treat module jobs or a
  locally successful command as substitutes for the aggregate.
- On failure, use the GitHub Actions run and job logs to identify the root cause,
  fix it in the same worktree, commit, and push. Repeat until `Required` passes.
- If CI is unavailable or externally blocked, keep the PR and worktree intact
  and report the incomplete delivery. Never bypass a pending or failed check.

## 6. Apply the review policy and merge

- For a PR authored under the repository-owner account, wait for `Required`,
  then merge with the review-only admin bypass using
  `gh pr merge <PR> --admin --squash --delete-branch`.
- For a third-party PR, approve it as the owner, do not select bypass, wait for
  `Required`, and merge normally with `gh pr review <PR> --approve` followed by
  `gh pr merge <PR> --squash --delete-branch`.
- Do not attempt to approve an owner-authored PR; GitHub does not count self
  approval.
- Confirm the PR reports `MERGED` before cleanup. A closed or queued PR is not a
  completed delivery.

## 7. Clean up safely

- Resolve the exact absolute task-worktree path and verify it is registered,
  clean, not the default worktree, and dedicated to the merged branch.
- Remove that worktree without force, then delete the merged local task branch
  with `git branch -d`. Let the PR merge delete its remote branch.
- Fetch and fast-forward the default worktree when it is clean. Never overwrite
  user changes to synchronize it.
- Report the PR URL, merge commit, CI result, and cleanup result.
