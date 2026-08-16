# Batched OWT coordination

Use a batch when several agents must implement independent local OWT tasks in
parallel and the final ready agent should integrate the complete set. The batch
manifest under Git's common directory is the only completion source of truth;
unrelated, stale, or manually created worktrees never join a batch implicitly.

## Create and seal the batch

Create the manifest from the default worktree at its committed local default
HEAD before starting task agents:

```bash
rtk bun .agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs create \
  --repo . --batch <batch-id> --default master --base HEAD
```

Create every task branch and sibling worktree from that recorded HEAD by the
normal OWT rules, then register its exact identity:

```bash
rtk bun .agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs register \
  --repo . --batch <batch-id> --task <task-id> \
  --branch agent/<task-slug> --worktree <absolute-worktree-path>
```

Register the entire expected task set before sealing it. Sealing is the barrier
that prevents a temporarily empty pending set from triggering integration while
more tasks are still being created:

```bash
rtk bun .agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs seal \
  --repo . --batch <batch-id>
```

## Finish a task

Each task agent stages only its owned files, runs `rtk bun run preflight`, commits,
requires a clean task worktree, and calls `ready` with the exact preflighted
commit:

```bash
rtk bun .agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs ready \
  --repo . --batch <batch-id> --task <task-id> --verified-head HEAD
```

Interpret the JSON `action` before ending the agent turn:

- `finish`: another task is still running or another agent owns integration;
  the current agent may report its task complete and stop.
- `integrate`: this agent atomically acquired the batch lease and must continue
  in the returned integration worktree. Calling `ready` is not its terminal
  step.
- `blocked`: preserve every task and integration worktree and report the exact
  reason.

The script rejects dirty task worktrees, stale preflight assertions, moved task
branches, unregistered paths, and branches outside `agent/`. It persists state
under `<git-common-dir>/openagent-owt/batches/`; do not edit those records by
hand.

## Integrate and finalize

For `action: integrate`, use the returned branch list in its existing order and
merge each immutable `headSha`, not the mutable branch name, inside the returned
integration worktree:

```bash
rtk git merge --no-edit <task-head-sha>
```

Resolve only unambiguous integration conflicts there. Never rebase, cherry-pick,
rewrite a task branch, or silently choose one conflicting side. Stop and mark a
real conflict when preserving both changes requires user direction:

```bash
rtk bun .agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs block \
  --repo . --batch <batch-id> --lease <lease-id> --reason <reason>
```

After every task head is present, run `rtk bun run preflight` in the integration
worktree and finalize that exact clean HEAD:

```bash
rtk bun .agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs finalize \
  --repo . --batch <batch-id> --lease <lease-id> --verified-head HEAD
```

`finalize` serializes default-branch delivery across batches and returns one of
these actions:

- `integrated`: the verified integration HEAD reached the local default branch
  by `--ff-only`.
- `refresh`: the local default branch gained committed descendants while the
  batch was integrating. Merge the returned immutable `defaultHead` into the
  integration branch with `git merge --no-edit <defaultHead>`, rerun preflight,
  and call `finalize` again with the new HEAD.
- `blocked`: the default branch no longer has linear ancestry from the recorded
  batch base; preserve the worktrees and stop.

The default worktree must be on the recorded default branch and completely
clean for the final fast-forward. Do not stash, reset, or absorb unrelated
changes to make finalization pass.

After `integrated`, move to the default worktree and clean the exact registered,
clean, fully merged task and integration worktrees:

```bash
rtk bun .agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs cleanup \
  --repo . --batch <batch-id> --lease <lease-id>
```

Cleanup retains the completed JSON record, removes no dirty or unmerged
worktree, and deletes branches only after their fixed heads are ancestors of
the current default HEAD. Inspect a batch without mutation at any time:

```bash
rtk bun .agents/skills/deliver-via-pr/scripts/coordinate-owt-batch.mjs status \
  --repo . --batch <batch-id>
```
