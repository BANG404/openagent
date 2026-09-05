# OPR park and reconciliation

Use these scripts when an `OPR` message arrives but the intended commits
already live on the default branch, or the default branch and its remote
have diverged because an earlier OPR was squash-merged. Never run pull,
merge, or an ad hoc rebase to recover; only the bundled reconciler may
move the local default branch.

## Inspect the parking plan

Run the read-only plan and inspect its boundary, unpublished commits, and
changed paths:

```bash
bun .agents/skills/deliver-via-pr/scripts/reconcile-opr.mjs plan --repo .
```

The reconciler finds the newest local first-parent commit whose complete
tree already exists in the remote-default history. It discards only the
history through that content-equivalent boundary and requires every later
commit to be linear.

## Prepare the recovery branch and task worktree

Prepare a recovery branch and dedicated task worktree from the current
remote default, then replay only the unpublished semantic tail:

```bash
bun .agents/skills/deliver-via-pr/scripts/reconcile-opr.mjs prepare \
  --repo . \
  --task agent/<task-slug> \
  --worktree ../openagent-wt-<task-slug>
```

The script verifies stable patch IDs after replay. On a cherry-pick
conflict, stop and inspect only the task worktree; the default worktree and
recovery branch remain untouched. Run preflight again in the prepared
worktree because its base or commit SHAs may have changed.

## Push and align the PR

Push the prepared task branch without force and create or update its ready
PR. Do not delete or overwrite an unrelated remote branch.

After confirming the intended paths and preflight, finalize with the exact
PR number:

```bash
bun .agents/skills/deliver-via-pr/scripts/reconcile-opr.mjs finalize \
  --repo . \
  --task agent/<task-slug> \
  --pr <number>
```

Finalization fetches again and requires a clean default worktree, unchanged
original head, intact recovery branch, exact local and remote task heads,
and an open ready PR to the expected base. Only then does it align the
default branch to the latest remote SHA. Explicit OPR mode authorizes this
verified, recoverable reset; no other reset is allowed.

Verify the default branch equals `origin/<default>` and retain both the
task worktree and recovery branch until the PR is merged or deliberately
closed.
