# OWT delivery

OWT supports Codex-managed and ordinary Git worktrees. For a conversation in an
eligible isolated checkout, prefer [the short Codex path](codex-worktree.md):
validate, commit, and return automatically to local `main` without a task branch
or batch. Use the ordinary steps below when Codex-managed worktrees are
unavailable. No prompt prefix selects a mode. Keep the default worktree on local `main`
for developer debugging; implement and validate in an isolated task worktree.
Reuse the conversation's worktree when it meets the selection rules below.
Never switch the default worktree to a task or integration branch.

The delivery skill is `deliver-via-owt`: its directory, discovery metadata,
invocation prompts, and helper commands use that name. Completion means verified
local integration and ownership-aware cleanup. Publishing and PR checks are
separate from local OWT completion; use `wait-for-pr-ci` when the user's task
explicitly includes waiting for actual GitHub PR checks.

## Select the worktree before creating one

Resolve the current checkout with `git rev-parse --show-toplevel`, then inspect
`git worktree list --porcelain` to locate the default directory on local `main`.
The current checkout is not necessarily the default directory. Record both
absolute paths, the committed local `main` SHA, task branch, and cleanup owner.
Do not infer ownership from the directory name or location. If the default
directory cannot be identified on `main`, preserve the checkouts and resolve
that ownership before delivery; never switch an unrelated checkout to `main`.

- In an existing isolated conversation worktree (including Codex-managed or
  permanent worktrees), reuse it for this task when it belongs to this repository
  and has no unrelated commits, staged edits, working edits, or untracked files.
  Inspect status and the complete diff from local `main`; imported local changes
  are not automatically task-owned. Preserve another task's worktree.
- For a new task, require `HEAD` to equal the recorded local `main` SHA. A clean
  worktree on an older ancestor may fast-forward to that SHA before editing.
  Never reset or rebase a checkout to make it eligible. A resumed task may keep
  its identified task changes and original recorded base; inspect them first.
- Keep an existing dedicated task branch, including a `codex/` branch. The
  short Codex path also accepts detached HEAD without creating a branch. Only
  the ordinary branch workflow or an explicitly coordinated batch needs a
  unique `agent/<task-slug>` branch at that `HEAD`; do not create a second
  worktree. Never use `main` as a task branch.
- When starting in the default directory, or when the current checkout is
  ineligible, prefer Codex's managed creation when available, using the recorded
  local `main` SHA. Otherwise create a unique `agent/<task-slug>` branch and new sibling worktree
  from the recorded committed local `main` SHA. Leave the original checkout and
  its changes intact, and report the selected task path.

Only temporary worktrees and branches created by this task are eligible for
OWT removal. Reused directories and existing branches remain with their manager
or developer, even after integration. Leave Codex-managed directories to Codex;
do not remove them with Git or switch them to another task during cleanup.

Choose new sibling paths relative to the resolved default directory, or use an
explicitly supplied location; never hard-code a drive or username. Worktree
placement does not select the final artifact's location. Keep relative artifact
layout through implementation and handoff; plugin destinations are owned by
[local plugin development](../../openagent-plugin-development/references/local-development.md#resolve-source-locations-from-the-project).

## Isolated task worktree, then fast-forward

1. Keep the public host's default worktree on its local default branch
   (`main` in OpenAgent); do not switch it. Select the task worktree above.
   Its recorded local default SHA is the authoritative OWT base even when it
   differs from the remote default. Fetch the upstream for awareness, but
   never merge, rebase, reset, or otherwise reconcile remote history as part
   of OWT. SDK changes follow their repository-owned commit and push rules.
2. Prepare the selected task worktree with `bun run prepare:worktree:dev`
   before validation unless that checkout has already completed the same
   preparation for its current pinned inputs. A Codex local environment setup
   script may run this command; do not repeat completed preparation just because
   another conversation starts. This initializes pinned submodules, installs
   frozen Bun dependencies, and uses the checked-in public client. This light
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
   then run `bun run preflight --base <recorded-base-sha>`. Stage new files first
   so the whitespace guard can inspect them. Always pass the recorded base
   (or set `PREFLIGHT_BASE`), including on reused `codex/` branches, so branch
   naming and unpublished local commits cannot expand or shrink verification.
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
   branch. Remove only clean, registered, task-created temporary worktrees
   and fully merged task-created branches. Retain reused worktrees and their
   checked-out branches; a task-created branch in a retained worktree stays
   attached. Report the default branch, commit and integration hashes,
   verification, removed and retained resources with their cleanup owner,
   preserved pre-existing changes, and actual push status. Publishing follows
   the user's authorization separately from local OWT completion.

Codex Handoff may move a task branch into the default checkout. It does not
replace the verified fast-forward above: keep the default directory on `main`
and integrate from the task checkout instead.

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

The preparation command can fail before the private `runtime` submodule is
initialized. A common cause is a pinned SDK revision that is not available from
the configured remote (`upload-pack: not our ref`). Do not change the parent
gitlink, fetch a different revision into the task, or claim that the pinned
SDK was verified. Record the exact failure and continue only with checks that
do not require that revision. A temporary link to an already initialized SDK
or `node_modules` may be used for narrow implementation checks only when its
scope is explicit; remove every link before staging and re-check status.

Before removing a task-created temporary OWT worktree, verify its recorded
cleanup ownership, branch, integration, and cleanliness. Never run this removal
procedure on a reused or Codex-managed worktree:

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
git -C <task-worktree> submodule deinit --force runtime
```

Confirm that the task submodule directory is now empty, remove only that
directory, and use the explicit task-worktree fallback:

```bash
rmdir <task-worktree>/runtime
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
