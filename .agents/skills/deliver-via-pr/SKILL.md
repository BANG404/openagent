---
name: deliver-via-pr
description: "Implement and deliver OpenAgent repository changes using prefix-selected Git modes. Use for every repository-changing task: default to verified commits directly on the local host default branch, use OWT for an isolated local worktree, push private SDK commits directly, use OPR for a ready public-host PR, and use ORPR for administrator-bypassed merge and cleanup."
metadata:
  category: pr-and-ci
---

# Repository delivery

## Select the mode first

Inspect the first token of the user's task before changing repository state.
Match `ORPR` before `OPR`; `OWT` is a separate prefix. A prefix is an uppercase
standalone token at the start of the message, optionally followed by whitespace
or a colon. Remove the token from the task description after selecting the mode.

| Input | Mode | Terminal state |
| --- | --- | --- |
| No delivery prefix | Direct local | Verified commits created directly on the local default branch; no task branch, worktree, push, or PR |
| `OWT [task]` | Worktree local | Isolated local task worktree, then verified commits fast-forwarded into the local default branch; no push or PR |
| `OPR [task]` | PR sync | Ready PR on a dedicated task branch/worktree; default worktree aligned with its remote; no CI wait or merge |
| `ORPR ...` | Full PR | Fresh isolated worktree and branch, ready PR, administrator merge without PR CI/review, and safe cleanup |

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
  Direct local mode leaves unrelated changes untouched and commits only
  explicit intended paths or hunks. Independent changes may share a file when
  their lines and semantics remain clearly separable; preserve the other work
  and stage only the owned hunks. `OWT` leaves unrelated changes in the default
  worktree while it works from that branch's committed `HEAD`; never copy those
  changes into the task worktree. Stop for direction when line overlap or
  semantic coupling prevents reliable ownership separation.
- Follow `sdk/AGENTS.md` for SDK work. The private SDK does not use pull
  requests: verify and push focused commits directly to `main` first, regardless
  of the public host's delivery prefix. Update the parent gitlink only after the
  SDK push is confirmed.

## Direct local mode: edit and commit on the local default branch

1. Work in the existing default worktree on its local default branch (`master`
   in OpenAgent). Do not create or switch branches, create a task worktree,
   reset, rebase, merge, pull, or push. Unpublished local commits are a valid
   base.
2. Inspect tracked, staged, and untracked changes before editing. Preserve every
   unrelated change in place. An intended file may already contain independent
   work: when ownership is clear at both the hunk and semantic level, edit around
   it and later stage only the owned hunks. Stop for direction instead of
   absorbing or overwriting changes that overlap or cannot be separated
   reliably.
3. Implement code, focused coverage, and agent-facing documentation together in
   the default worktree. Keep public behavior in `docs/`, repeatable procedures
   in the triggering skill, and private SDK internals in the SDK repository.
4. Do not manually run lint, test, check, build, or documentation commands that
   duplicate repository CI. Run implementation-time interactive checks,
   explicitly requested checks, and validators required by another skill.
5. Inspect the complete diff, stage only explicit intended paths or hunks, then
   run `bun run preflight`. Stage intended new files first so the whitespace
   guard can inspect them. Use `--base <ref>` only for a non-default target
   branch.
6. Inspect the exact commit diff and create focused Conventional Commits directly
   on the local default branch. If unrelated changes are already staged or share
   an intended file, build the commit from a temporary index based on the current
   `HEAD` containing only the owned hunks, then refresh the original index from
   the unchanged working files so all pre-existing staged work remains staged.
   Do not use a path-limited commit when it would capture unrelated working-tree
   content from a shared file. Never amend, squash, or rewrite user-owned commits
   unless explicitly requested.
7. Confirm the intended commit and paths are on the local default branch and
   that all pre-existing unrelated changes remain unchanged. Report the branch,
   commit hashes, verification, preserved changes, and that no branch,
   worktree, push, or PR was created.

## OWT mode: isolate work, then fast-forward the local default branch

1. Keep the public host's default worktree on its local default branch (`master`
   in OpenAgent); do not switch it. Record that branch and its exact starting
   `HEAD`, which is the authoritative OWT base even when it differs from the
   remote default. Fetch the upstream for awareness, but never merge, rebase,
   reset, or otherwise reconcile remote history as part of OWT. SDK changes
   follow the separate direct-push rule above.
2. Choose a unique `agent/<task-slug>` branch and non-existing sibling
   worktree path. Create both from the recorded local default `HEAD`, not from
   the remote default and not from the default worktree's index or working
   tree. Never relocate, reset, clean, or reuse an unrelated worktree. Initialize
   required pinned submodules and task-worktree dependencies before validation;
   use frozen dependency metadata and do not change manifests or lockfiles as
   incidental setup.
3. Implement code, focused coverage, and agent-facing documentation together
   in the task worktree.
   Keep public behavior in `docs/`, repeatable procedures in the triggering
   skill, and private SDK internals in the SDK repository.
4. Do not manually run lint, test, check, build, or documentation commands that
   duplicate repository CI. Run implementation-time interactive checks,
   explicitly requested checks, and validators required by another skill.
5. Inspect status and the complete diff, stage only explicit intended paths,
   then run `bun run preflight`. Stage new files first so the whitespace guard
   can inspect them. Use `--base <ref>` only for a non-default target branch.
6. Inspect the staged diff and create focused Conventional Commits. Never amend,
   squash, or rewrite user-owned commits unless explicitly requested.
7. Require a clean task worktree, then return to the default worktree and verify
   it is still on the recorded default branch. If that branch gained committed
   descendants of the recorded starting `HEAD` while the task was in progress,
   treat them as concurrent local delivery: merge the current default branch
   into the task branch with `git merge --no-edit <default>`, never rebase,
   cherry-pick, or rewrite either side. A clean merge is the default and may
   automatically combine overlapping files; a real merge conflict, non-linear
   ancestry from the recorded starting `HEAD`, or an overwrite of an unrelated
   working change still requires preserving both sides and stopping for
   direction. After every concurrent merge, rerun `bun run preflight` in the
   task worktree. Then retry `git merge --ff-only <task>` in the default
   worktree. If another committed advance makes that fast-forward fail, repeat
   this merge, preflight, and fast-forward loop until the handoff succeeds. Do
   not stash or include unrelated default-worktree changes.
8. Confirm the intended commits and paths are now on the local default branch.
   Remove only the clean registered task worktree and its fully merged local
   task branch. Report the default branch, commit and integration hashes,
   verification, cleanup, preserved pre-existing changes, and that nothing was
   pushed.

### Coordinate a sealed batch of OWT tasks

When the caller intentionally launches several OWT tasks as one local delivery,
use [references/batch-owt.md](references/batch-owt.md) and its deterministic
coordinator. Register the complete expected task set and seal it before any task
may trigger integration. Each task still owns a clean, committed, individually
preflighted branch. The final ready agent atomically acquires the integration
lease, merges the recorded task SHAs in a dedicated integration worktree, runs
preflight on the combined tree, and fast-forwards the clean local default branch
through the coordinator. Do not infer batch membership from the repository's
worktree count or launch a replacement `codex exec` process.

## OPR mode: synchronize local commits through a PR

OPR owns publication but stops before CI, merge, and cleanup. Keep task history
off the default branch so a later squash merge cannot leave that branch both
ahead of and behind its remote.

### Select the OPR source

- For a new `OPR <task>` with a clean, synchronized default worktree, create a
  unique sibling worktree and `agent/<task-slug>` branch from
  `origin/<default>`. Implement, verify, and commit there by following `OWT`
  mode's task-worktree steps, but do not fast-forward it into the local default
  branch. Do not switch or change the upstream of the default branch.
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

- Follow `OWT` mode's task-worktree steps for implementation, documentation,
  staging, preflight, diff inspection, and commits inside the isolated
  worktree; its local-default fast-forward and cleanup rules do not apply to
  `ORPR`.
- Push with upstream tracking and open a ready PR. Include user-visible
  behavior, affected boundaries, documentation, preflight, and deferred checks.
- Never add unrelated commits or update the branch solely because the target
  branch moved after CI started.

### Merge under repository policy

- Re-read the ready PR and require the exact pushed head, expected base, open
  non-draft state, and administrator-authored source.
- Merge that exact head with `gh pr merge <PR> --admin --squash
  --delete-branch`. Administrator delivery intentionally bypasses PR CI and
  review; local `bun run preflight` is the implementation gate.
- Third-party PRs are outside the administrator bypass. Leave them to their
  fast PR CI and review policy unless the user explicitly asks to handle one.
- Confirm `MERGED`; closed or queued is not complete.

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
