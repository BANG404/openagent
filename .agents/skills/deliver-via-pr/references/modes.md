# Delivery modes: Direct and OWT

Read the procedure that matches the selected mode. Each procedure owns its
steps, commit rules, preflight expectations, and cleanup rules.

## Direct local mode: edit and commit on the local default branch

1. Work in the existing default worktree on its local default branch (`master`
   in OpenAgent). Do not create or switch branches, create a task worktree,
   reset, rebase, merge, pull, or push unless the automatic conflict-isolation
   procedure below applies. Unpublished local commits are a valid base.
2. Inspect tracked, staged, and untracked changes before editing. Preserve
   every unrelated change in place. When ownership is clear at both the hunk
   and semantic level, edit around the other work and stage only the owned
   hunks. If existing state blocks safe editing or authoritative verification,
   use automatic conflict isolation below. Stop for direction only when
   ownership cannot be separated reliably.
3. Implement code, focused coverage, and agent-facing documentation together
   in the default worktree. Keep public behavior in `docs/`, repeatable
   procedures in the triggering skill, and private SDK internals in the SDK
   repository.
4. Do not manually run lint, test, check, build, or documentation commands
   that duplicate repository CI. Run implementation-time interactive checks,
   explicitly requested checks, and validators required by another skill.
5. Inspect the complete diff, stage only explicit intended paths or hunks,
   then run `bun run preflight`. Stage intended new files first so the
   whitespace guard can inspect them. Use `--base <ref>` only for a
   non-default target branch.
6. Inspect the exact commit diff and create focused Conventional Commits
   directly on the local default branch. If unrelated changes are already
   staged or share an intended file, build the commit from a temporary index
   based on the current `HEAD` containing only the owned hunks, then refresh
   the original index from the unchanged working files so all pre-existing
   staged work remains staged. Do not use a path-limited commit when it
   would capture unrelated working-tree content from a shared file. Never
   amend, squash, or rewrite user-owned commits unless explicitly requested.
7. Confirm the intended commit and paths are on the local default branch and
   that all pre-existing unrelated changes remain unchanged. Report the
   branch, commit hashes, verification, preserved changes, whether automatic
   isolation was used and cleaned up, and that no push or PR was created.

### Automatic conflict isolation for direct local delivery

This is a recovery mechanism inside unprefixed direct local delivery, not OWT
mode. Use it proactively when pre-existing changes in the default worktree
overlap the task, prevent reliable staging, or cause required verification
to exercise unrelated unfinished work. Do not wait for the user to request a
worktree when ownership is already clear.

1. Record the default branch and exact starting `HEAD`. Create a uniquely
   named temporary branch and sibling worktree from that local commit. Do not
   fetch a different implementation base, switch the default worktree, or
   transfer any user-owned changes into the isolation worktree.
2. Run `bun run prepare:worktree:dev` in the isolation worktree. Reproduce
   the task there, or move already-created agent-owned changes only after
   comparing the complete source and destination patch IDs. Remove only those
   verified agent-owned copies from the default worktree; preserve its index
   and every unrelated file exactly.
3. Inspect, stage, preflight, and commit in isolation using the same quality
   gates as direct local delivery. If the default branch advances
   concurrently, merge it into the temporary branch without rewriting either
   side, rerun preflight, and retry the fast-forward integration.
4. Fast-forward the unchanged default branch to the verified temporary branch
   without stashing unrelated working changes. If those changes would be
   overwritten, keep both sides intact and stop for direction.
5. Treat cleanup as part of delivery: after confirming integration, remove
   the clean registered isolation worktree without force and delete its fully
   merged temporary branch. Do not leave the directory or branch behind. If
   delivery cannot complete, preserve the task as a commit or patch, then
   remove the temporary worktree as soon as recovery is confirmed; report any
   cleanup that remains blocked rather than silently consuming disk.

## OWT mode: isolated task worktree, then fast-forward

1. Keep the public host's default worktree on its local default branch
   (`master` in OpenAgent); do not switch it. Record that branch and its
   exact starting `HEAD`, which is the authoritative OWT base even when it
   differs from the remote default. Fetch the upstream for awareness, but
   never merge, rebase, reset, or otherwise reconcile remote history as part
   of OWT. SDK changes follow the separate direct-push rule.
2. Choose a unique `agent/<task-slug>` branch and non-existing sibling
   worktree path. Create both from the recorded local default `HEAD`, not
   from the remote default and not from the default worktree's index or
   working tree. Never relocate, reset, clean, or reuse an unrelated
   worktree. From the task worktree, run `bun run prepare:worktree:dev`
   before validation. This initializes pinned submodules, installs frozen
   Bun dependencies, and builds the current-platform development sandbox
   and Runtime sidecars; it creates ignored build inputs instead of relying
   on artifacts from another worktree. Use the release variant only for
   release qualification, and do not change manifests or lockfiles as
   incidental setup.
3. Implement code, focused coverage, and agent-facing documentation together
   in the task worktree. Keep public behavior in `docs/`, repeatable
   procedures in the triggering skill, and private SDK internals in the SDK
   repository.
4. Do not manually run lint, test, check, build, or documentation commands
   that duplicate repository CI. Run implementation-time interactive checks,
   explicitly requested checks, and validators required by another skill.
5. Inspect status and the complete diff, stage only explicit intended paths,
   then run `bun run preflight`. Stage new files first so the whitespace
   guard can inspect them. Use `--base <ref>` only for a non-default target
   branch.
6. Inspect the staged diff and create focused Conventional Commits. Never
   amend, squash, or rewrite user-owned commits unless explicitly requested.
7. Require a clean task worktree, then return to the default worktree and
   verify it is still on the recorded default branch. If that branch gained
   committed descendants of the recorded starting `HEAD` while the task was
   in progress, treat them as concurrent local delivery: merge the current
   default branch into the task branch with `git merge --no-edit <default>`,
   never rebase, cherry-pick, or rewrite either side. A clean merge is the
   default and may automatically combine overlapping files; a real merge
   conflict, non-linear ancestry from the recorded starting `HEAD`, or an
   overwrite of an unrelated working change still requires preserving both
   sides and stopping for direction. After every concurrent merge, rerun
   `bun run preflight` in the task worktree. Then retry
   `git merge --ff-only <task>` in the default worktree. If another
   committed advance makes that fast-forward fail, repeat this merge,
   preflight, and fast-forward loop until the handoff succeeds. Do not
   stash or include unrelated default-worktree changes.
8. Confirm the intended commits and paths are now on the local default
   branch. Remove only the clean registered task worktree and its fully
   merged local task branch. Report the default branch, commit and
   integration hashes, verification, cleanup, preserved pre-existing
   changes, and that nothing was pushed.

### Coordinate a sealed batch of OWT tasks

When the caller intentionally launches several OWT tasks as one local
delivery, use [references/batch-owt.md](references/batch-owt.md) and its
deterministic coordinator. Register the complete expected task set and seal
it before any task may trigger integration. Each task still owns a clean,
committed, individually preflighted branch. The final ready agent
atomically acquires the integration lease, merges the recorded task SHAs in
a dedicated integration worktree, runs preflight on the combined tree, and
fast-forwards the clean local default branch through the coordinator. Do
not infer batch membership from the repository's worktree count.

For independent tasks that do not need a sealed all-or-nothing integration,
the parent agent may instead use
[scripts/run-codex-exec-batch.mjs](../../scripts/run-codex-exec-batch.mjs)
to launch multiple ordinary OWT deliveries concurrently. Read
[references/parallel-codex-exec.md](references/parallel-codex-exec.md)
before using it. Do not combine that launcher with the sealed-batch
coordinator: every launched child follows the complete ordinary OWT
workflow and integrates its own result.
