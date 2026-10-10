# OWT delivery

OWT is the only repository delivery workflow, including single-agent tasks.
No prompt prefix selects a mode. Keep the default worktree on local `main`
for developer debugging; implement and validate in isolated sibling worktrees.
Never switch the default worktree to a task or integration branch.

The delivery skill is `deliver-via-owt`: its directory, discovery metadata,
invocation prompts, and helper commands use that name. Completion means verified
local integration and cleanup. Publishing and PR checks are separate from local
OWT completion; use `wait-for-pr-ci` when the user's task explicitly includes
waiting for actual GitHub PR checks.

Resolve the repository root from the current checkout, for example with
`git rev-parse --show-toplevel`. Choose temporary sibling worktrees relative to
that root or use an explicitly supplied worktree location; never hard-code a
drive, username, or projects directory. Worktree placement is temporary and does
not select the final artifact's location. Keep the project's relative artifact
layout through implementation and handoff; plugin destinations are owned by
[local plugin development](../../openagent-plugin-development/references/local-development.md#resolve-source-locations-from-the-project).

## Isolated task worktree, then fast-forward

1. Keep the public host's default worktree on its local default branch
   (`main` in OpenAgent); do not switch it. Record that branch and its
   exact starting `HEAD`, which is the authoritative OWT base even when it
   differs from the remote default. Fetch the upstream for awareness, but
   never merge, rebase, reset, or otherwise reconcile remote history as part
   of OWT. SDK changes follow their repository-owned commit and push rules.
2. Choose a unique `agent/<task-slug>` branch and non-existing sibling
   worktree path. Create both from the recorded local default `HEAD`, not
   from the remote default and not from the default worktree's index or
   working tree. Never relocate, reset, clean, or reuse an unrelated
   worktree. From the task worktree, run `bun run prepare:worktree:dev`
   before validation. This initializes pinned submodules, installs frozen
   Bun dependencies, and materializes the pinned source client. This light
   preparation does not compile Rust. Add `--native` only when a desktop run
   or native scenario actually needs development sandbox and Runtime sidecars.
   Private development Cargo builds share dependency output across associated
   worktrees; Cargo must build the current checkout before staging its bytes.
   Never copy another worktree's executable as evidence of this source.
   Use the release variant only for release qualification, and do not change
   manifests or lockfiles as incidental setup.
3. Implement code, focused coverage, and agent-facing documentation together
   in the task worktree. Keep behavior, architecture, and repeatable procedures
   in the triggering workspace skill; keep private SDK internals in the SDK
   repository. Use README files only for the public project overview.
4. Do not manually run lint, test, check, build, or documentation commands
   that duplicate repository CI. Run implementation-time interactive checks,
   explicitly requested checks, and validators required by another skill.
   Stabilize the smallest affected cases first, then the affected suite, and
   only then run final qualification/preflight. Do not launch broad Cargo tests
   while focused failures are unresolved or focused tests are still running.
   Any source correction invalidates earlier qualification for that source.
   The Runtime verification command and cache ownership live in
   [local development commands](../../openagent-release-engineering/references/local-commands.md).
5. Inspect status and the complete diff, stage only explicit intended paths,
   then run `bun run preflight`. Stage new files first so the whitespace
   guard can inspect them. OWT branches automatically compare against the
   local default branch; pass `--base <recorded-base-sha>` when a coordinator
   records an immutable batch baseline.
6. Inspect the staged diff and create focused Conventional Commits. Never
   amend, squash, or rewrite user-owned commits unless explicitly requested.
7. Require a clean task worktree, then return to the default worktree and
   verify it is still on the recorded default branch. If that branch gained
   committed descendants of the recorded starting `HEAD` while the task was
   in progress, treat them as concurrent local delivery: merge the current
   default branch into the task branch with `git merge --no-edit <default>`,
   never rebase, cherry-pick, or rewrite either side. A clean merge may
   automatically combine overlapping files. Resolve
   unambiguous task-owned conflicts in isolation; preserve both sides and
   request direction only when ownership or intended behavior is ambiguous,
   ancestry is non-linear, or integration would overwrite developer changes.
   After every concurrent merge, rerun
   `bun run preflight --base <recorded-base-sha>` in the task worktree. Then retry
   `git merge --ff-only <task>` in the default worktree. If another
   committed advance makes that fast-forward fail, repeat this merge,
   preflight, and fast-forward loop until the handoff succeeds. Do not
   stash or include unrelated default-worktree changes. A blocked handoff keeps
   the default worktree on `main` and preserves the committed task for recovery;
   report it as pending integration, not delivered.
8. Confirm the intended commits and paths are now on the local default
   branch. Remove only the clean registered task worktree and its fully
   merged local task branch. Report the default branch, commit and
   integration hashes, verification, cleanup, preserved pre-existing
   changes, and that nothing was pushed.

### Recovery and cleanup

When a fast-forward touches a file with clearly separable developer edits,
preserve its exact working bytes, index state, and base-to-working patch in a
durable backup outside the task worktree. Check that the patch applies cleanly
to the verified result before touching the default directory. Recheck the base
and file bytes, temporarily restore only that file's committed content, perform
the fast-forward, then reapply and verify the preserved edits and staging state.
Restore the backup immediately if integration fails. Never use this procedure
for ambiguous ownership or a patch conflict; keep both sides pending instead.
Do not delete recovery data until preservation has been verified.

The preparation command can fail before the private `sdk` submodule is
initialized. A common cause is a pinned SDK revision that is not available from
the configured remote (`upload-pack: not our ref`). Do not change the parent
gitlink, fetch a different revision into the task, or claim that the pinned
SDK was verified. Record the exact failure and continue only with checks that
do not require that revision. A temporary link to an already initialized SDK
or `node_modules` may be used for narrow implementation checks only when its
scope is explicit; remove every link before staging and re-check status.

If the default branch advances after the task commit, merge the current default
branch into the task branch, rerun `bun run preflight` (or pass the recorded
batch base explicitly), and retry the
fast-forward. Do not rebase or cherry-pick the task commit to hide the
concurrent advance.

Before removing an OWT worktree, verify both its branch and cleanliness:

```bash
git -C <task-worktree> status --short --branch
git -C <task-worktree> diff --check
```

If status is clean but `git worktree remove <task-worktree>` reports
`working trees containing submodules cannot be moved or removed`, inspect the
submodule path and confirm that it was initialized by this task worktree. A
task-owned SDK checkout may contain prepared source and build files; after
confirming it has no user changes, unregister it from the task worktree first:

```bash
git -C <task-worktree> submodule deinit --force sdk
```

Confirm that the task submodule directory is now empty, remove only that
directory, and use the explicit task-worktree fallback:

```bash
rmdir <task-worktree>/sdk
git worktree remove --force <task-worktree>
git worktree prune
```

The `--force` exception is allowed only after the clean-status check, with an
explicit task-worktree path, and when no user-owned submodule files remain.
Never apply it to the repository root or an unreviewed dirty worktree. Do not
deinitialize a submodule from the default worktree or a worktree that contains
user changes; preserve that worktree and stop for direction instead.

Preflight failures must be classified rather than worked around silently. A
missing native artifact such as
`src-tauri/binaries/bwrap-x86_64-unknown-linux-gnu` is an environment or
preparation blocker, not evidence that frontend tests passed; report the
passed checks and the exact failing gate. Browser smoke failures must likewise
retain their assertion and include the Vite/Playwright error; do not weaken the
fixture assertion merely to turn an unavailable preview into a pass.

### Coordinate a sealed batch of OWT tasks

When the caller intentionally launches several OWT tasks as one local
delivery, coordinate that same OWT workflow with [batch-owt.md](batch-owt.md) and its
deterministic coordinator. Register the complete expected task set and seal
it before any task may trigger integration. Each task still owns a clean,
committed, individually preflighted branch. The final ready agent
atomically acquires the integration lease, merges the recorded task SHAs in
a dedicated integration worktree, runs preflight on the combined tree, and
fast-forwards the local default branch through the coordinator after its
clean-worktree gate passes. Do not infer batch membership from the repository's
worktree count.

For independent tasks that do not need a sealed all-or-nothing integration,
the parent agent may instead use
[scripts/run-codex-exec-batch.mjs](../scripts/run-codex-exec-batch.mjs)
to launch multiple ordinary OWT deliveries concurrently. Read
[parallel-codex-exec.md](parallel-codex-exec.md)
before using it. Do not combine that launcher with the sealed-batch
coordinator: every launched child follows the complete ordinary OWT
workflow and integrates its own result.
