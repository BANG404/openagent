# ORPR mode: isolated PR through merge

`ORPR` ships a fresh isolated worktree, opens a ready PR, performs an
administrator merge that bypasses PR CI and review, and cleans up safely.
Local `bun run preflight` is the implementation gate; no other CI or review
is required before merge.

## Create the isolated task worktree

- Fetch the remote default branch.
- Choose a unique `agent/<task-slug>` branch and a non-existing sibling
  path named `openagent-wt-<task-slug>`.
- Create the worktree from the remote default branch, never a stale local
  base.
- Never relocate, reset, clean, or reuse unrelated worktrees. If intended
  task changes already exist elsewhere, preserve them and stop rather than
  copying or deleting them ambiguously.

## Implement, commit, and open the PR

- Follow `OWT` mode's task-worktree steps for implementation, documentation,
  staging, preflight, diff inspection, and commits inside the isolated
  worktree. Its local-default fast-forward and cleanup rules do not apply
  to `ORPR`.
- Push with upstream tracking and open a ready PR. Include user-visible
  behavior, affected boundaries, documentation, preflight, and deferred
  checks.
- Never add unrelated commits or update the branch solely because the
  target branch moved after CI started.

## Merge under repository policy

- Re-read the ready PR and require the exact pushed head, expected base,
  open non-draft state, and administrator-authored source.
- Merge that exact head with `gh pr merge <PR> --admin --squash
  --delete-branch`. Administrator delivery intentionally bypasses PR CI
  and review.
- Third-party PRs are outside the administrator bypass. Leave them to their
  fast PR CI and review policy unless the user explicitly asks to handle
  one.
- Confirm `MERGED`; closed or queued is not complete.

## Clean up safely

- Resolve the exact task-worktree path and verify it is registered, clean,
  not the default worktree, and dedicated to the merged branch.
- Confirm the PR is merged and its remote branch is gone before removing
  that worktree without force.
- Record the exact local branch. Because squash merge breaks ancestry,
  delete only that verified merged task branch with `git branch -D`; never
  force-delete an open, dirty, unmerged, or ambiguously owned branch.
- Fetch and fast-forward the default worktree only when it is clean.
  Report the PR URL, merge commit, CI result, and cleanup result.
