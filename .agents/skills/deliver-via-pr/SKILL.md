---
name: deliver-via-pr
description: "Implement and deliver OpenAgent repository changes using prefix-selected Git modes. Use for every repository-changing task: default to commits on the current remote-tracking default branch without switching branches, use an OPR message prefix to push all unpublished local commits to a remote PR branch without changing the local branch or its upstream, and use an ORPR prefix for the isolated worktree, authoritative CI, merge, and cleanup workflow."
---

# Repository delivery

## Select the mode first

Inspect the first token of the user's task before changing repository state.
Match `ORPR` before `OPR`; a prefix is an uppercase standalone token at the
start of the message, optionally followed by whitespace or a colon. Remove the
token from the task description after selecting the mode.

| Input | Mode | Terminal state |
| --- | --- | --- |
| No delivery prefix | Local | Current worktree and remote-tracking default branch, verified local commits; no push or PR |
| `OPR [task]` | PR sync | Local mode plus push every unpublished local commit to a remote PR branch and create or update a ready PR; do not switch the local branch |
| `ORPR ...` | Full PR | Fresh isolated worktree and branch, ready PR, authoritative CI, merge, and safe cleanup |

An explicit user instruction such as uncommitted changes, no push, draft PR,
no merge, or a named target branch overrides the corresponding default. A
prefix selects delivery mechanics only; it does not broaden task scope or
authorize unrelated changes.

## Establish scope

- Read the nearest `AGENTS.md` and the mapped source-of-truth documentation.
- Before changing product or automation logic, agent instructions, or
  documentation, read
  [references/living-documentation.md](references/living-documentation.md) and
  select one primary documentation owner for each changed behavior.
- Run `git status --short --branch`, inspect existing worktrees, and resolve the
  remote default branch. Check GitHub authentication only for `OPR` or `ORPR`.
- For diagnosis or review only, do not create a branch or make changes.
- Preserve unrelated branches, worktrees, staged files, and working changes.
  If the current worktree or branch has ambiguous ownership, stop for direction
  instead of absorbing those changes into the task.
- Follow `sdk/AGENTS.md` for SDK work. Apply the selected mode independently to
  the SDK repository first; update the parent gitlink only after the SDK commit
  intended for integration is final for that mode.

## Local mode: commit on the current default branch

1. Stay in the current worktree and on its remote-tracking default branch
   (`master` in OpenAgent and `main` in the SDK). Do not create or switch a
   local branch and do not create another worktree. Fetch the upstream first;
   fast-forward only when there are no unpublished local commits. If local and
   remote history diverge, preserve both and stop for direction instead of
   rebasing, resetting, or merging automatically.
2. Implement code, focused coverage, and agent-facing documentation together.
   Keep public behavior in `docs/`, repeatable procedures in the triggering
   skill, and private SDK internals in the SDK repository.
3. Do not manually run lint, test, check, build, or documentation commands that
   duplicate repository CI. Run implementation-time interactive checks,
   explicitly requested checks, and validators required by another skill.
4. Inspect status and the complete diff, stage only explicit intended paths,
   then run `bun run preflight`. Stage new files first so the whitespace guard
   can inspect them. Use `--base <ref>` only for a non-default target branch.
5. Inspect the staged diff and create focused Conventional Commits. Never amend,
   squash, or rewrite user-owned commits unless explicitly requested.
6. Stop after the local commits. Report the default branch, commit hashes,
   verification, and that nothing was pushed.

## OPR mode: synchronize local commits through a PR

When task text follows the prefix, complete local mode first and then publish
it. When the message is only `OPR`, publish the current unpublished local
commits as-is after verifying them; do not invent another implementation change
or empty commit.

1. Fetch the remote default, then inspect every unpublished commit and changed
   path in `origin/<default>..HEAD`. Confirm they are intended and the worktree
   has no task changes left uncommitted. Include every unpublished local commit;
   do not silently squash it.
2. Resolve the existing open PR branch for this same local commit series, or
   choose a unique remote-only `agent/<task-slug>` branch. Push with an explicit
   refspec such as `git push origin HEAD:refs/heads/agent/<task-slug>` so the
   local default branch and its upstream remain unchanged. Never push directly
   to the remote default, force-push, or rewrite published history unless the
   user explicitly requests it.
3. Create a ready PR from that remote branch to the remote default, or update
   its existing open PR. Describe behavior, boundaries, documentation, local
   preflight, and checks deferred to CI.
4. Stop after the remote branch and PR reflect the local commits. Do not wait
   for CI, merge the PR, delete branches, remove worktrees, or fast-forward the
   default branch unless separately requested.
5. Report the PR URL, remote PR branch, pushed head SHA, included commits, and
   current check state without presenting pending CI as successful delivery.

## ORPR mode: isolated PR through merge

### Create the isolated task worktree

- Fetch the remote default branch.
- Choose a unique `agent/<task-slug>` branch and a non-existing sibling path
  named `openagent-wt-<task-slug>`.
- Create the worktree from the remote default branch, never a stale local base.
- Never relocate, reset, clean, or reuse unrelated worktrees. If intended task
  changes already exist elsewhere, preserve them and stop rather than copying
  or deleting them ambiguously.

### Implement, commit, and open the PR

- Follow local mode steps 2-5 for implementation, documentation, staging,
  preflight, diff inspection, and commits inside the isolated worktree; its
  default-branch placement rule does not apply to `ORPR`.
- Push with upstream tracking and open a ready PR. Include user-visible
  behavior, affected boundaries, documentation, preflight, and deferred checks.
- Never add unrelated commits or update the branch solely because the target
  branch moved after CI started.

### Wait for authoritative CI

- Use the `wait-for-pr-ci` skill to wait for `Required PR Head` on the immutable
  PR head. Pass `--wait-for-merge` when trusted auto-merge is configured.
- If it returns `merge-pending`, re-read the PR and apply the review fallback
  below without rerunning successful CI.
- On failure, inspect the failing Actions job, fix the same task branch, commit,
  push, and wait again. Never bypass pending or failed checks.
- If CI is externally blocked, retain the PR and worktree and report incomplete
  delivery.

### Merge under repository policy

- For an owner-authored PR, let the trusted reporter squash-merge after
  `Required PR Head` succeeds. If the configured merge credential is
  unavailable, use `gh pr merge <PR> --admin --squash --delete-branch` only as
  the documented review-only fallback for the exact validated head.
- For a third-party PR, approve as the owner, do not bypass protection, wait for
  both required statuses, and merge normally.
- Never self-approve an owner-authored PR. Confirm `MERGED`; closed or queued is
  not complete.

### Clean up safely

- Resolve the exact task-worktree path and verify it is registered, clean, not
  the default worktree, and dedicated to the merged branch.
- Confirm the PR is merged and its remote branch is gone before removing that
  worktree without force.
- Record the exact local branch. Because squash merge breaks ancestry, delete
  only that verified merged task branch with `git branch -D`; never force-delete
  an open, dirty, unmerged, or ambiguously owned branch.
- Fetch and fast-forward the default worktree only when it is clean. Report the
  PR URL, merge commit, CI result, and cleanup result.
