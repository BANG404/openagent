---
name: deliver-via-pr
description: "Implement and deliver OpenAgent repository changes using prefix-selected Git modes. Use for every repository-changing task: default to verified local commits, use an OPR prefix to publish a ready PR while keeping the default worktree aligned with its remote, and use an ORPR prefix for authoritative CI, merge, and cleanup."
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
| `OPR [task]` | PR sync | Ready PR on a dedicated task branch/worktree; default worktree aligned with its remote; no CI wait or merge |
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

OPR owns publication but stops before CI, merge, and cleanup. Keep task history
off the default branch so a later squash merge cannot leave that branch both
ahead of and behind its remote.

### Select the OPR source

- For a new `OPR <task>` with a clean, synchronized default worktree, create a
  unique sibling worktree and `agent/<task-slug>` branch from
  `origin/<default>`. Implement, verify, and commit there by following local
  mode steps 2-5. Do not switch or change the upstream of the default branch.
- If the matching ready PR already exists, resume its dedicated task worktree
  or recreate one from its local or remote task branch. Never merge the PR
  branch back into the default worktree merely to update it.
- When the message is only `OPR`, or the intended commits already exist on the
  default branch, use the parking procedure below. Do not create another
  implementation change or empty commit.
- If the default branch and its remote have already diverged because an earlier
  OPR was squash-merged, use the deterministic reconciler below. Never run pull,
  merge, or an ad hoc rebase, and never resolve a content conflict by silently
  preferring the remote version.

### Park committed default-branch work

1. Run the read-only plan and inspect its boundary, unpublished commits, and
   changed paths:

   ```bash
   bun .agents/skills/deliver-via-pr/scripts/reconcile-opr.mjs plan --repo .
   ```

   The reconciler finds the newest local first-parent commit whose complete tree
   already exists in the remote-default history. It discards only the history
   through that content-equivalent boundary and requires every later commit to
   be linear.
2. Prepare a recovery branch and dedicated task worktree from the current remote
   default, then replay only the unpublished semantic tail:

   ```bash
   bun .agents/skills/deliver-via-pr/scripts/reconcile-opr.mjs prepare \
     --repo . \
     --task agent/<task-slug> \
     --worktree ../openagent-wt-<task-slug>
   ```

   The script verifies stable patch IDs after replay. On a cherry-pick conflict,
   stop and inspect only the task worktree; the default worktree and recovery
   branch remain untouched. Run preflight again in the prepared worktree because
   its base or commit SHAs may have changed.
3. Push the prepared task branch without force and create or update its ready
   PR. Do not delete or overwrite an unrelated remote branch.
4. After confirming the intended paths and preflight, finalize with the exact PR
   number:

   ```bash
   bun .agents/skills/deliver-via-pr/scripts/reconcile-opr.mjs finalize \
     --repo . \
     --task agent/<task-slug> \
     --pr <number>
   ```

   Finalization fetches again and requires a clean default worktree, unchanged
   original head, intact recovery branch, exact local and remote task heads, and
   an open ready PR to the expected base. Only then does it align the default
   branch to the latest remote SHA. Explicit OPR mode authorizes this verified,
   recoverable reset; no other reset is allowed.
5. Verify the default branch equals `origin/<default>` and retain both the task
   worktree and recovery branch until the PR is merged or deliberately closed.

### Publish and stop

1. Push the dedicated task branch without force and create or update a ready PR
   to the remote default. Describe behavior, boundaries, documentation, local
   preflight, and checks deferred to CI.
2. Leave the task worktree and local branch available for review follow-up.
   Stop without waiting for CI, merging, or cleanup.
3. Report the PR URL, local and remote task branch, pushed head SHA, included
   commits, default-worktree synchronization, and current check state. Never
   present pending CI as successful delivery.
4. After the PR is later confirmed merged, a separate cleanup may remove its
   clean dedicated worktree and local task branch. Fetch and fast-forward the
   already-clean default worktree; never merge the squash result into preserved
   pre-squash commits.

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
