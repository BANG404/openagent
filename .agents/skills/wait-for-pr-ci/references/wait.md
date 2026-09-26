# Waiting for PR CI

Run the bundled waiter from the task worktree through `rtk`:

```powershell
rtk python .agents/skills/wait-for-pr-ci/scripts/wait_for_pr_ci.py <PR>
```

Omit the PR to resolve the current branch, or pass `--repo OWNER/REPO` outside
the checkout. It discovers required checks from branch protection and active
rulesets. If no checks are required, it waits for every GitHub Actions check or
Actions-backed commit status on the current immutable head. Use repeated
`--check NAME` values for an explicit set, `--all-actions` to skip required
check discovery, and `--wait-for-merge` when a trusted workflow should merge.

Keep the waiter attached to the same execution cell. Do not run `gh`, start a
second waiter, or issue unrelated commands while it is active. Wait in chunks
of at most 50 seconds and continue until the process exits. Empty intermediate
output means only that the waiter is still running. If an interrupted cell no
longer exists, rerun this read-only waiter instead of guessing.

Interpret the final `WAIT_FOR_PR_CI result=...` line as authoritative. Exit 0
means selected CI passed (and merge completed when requested); 1 means a
selected check failed or errored; 2 means the PR closed without merging; 3 is
the timeout; 4 is an argument, authentication, repository, or API error; and 5
means CI passed but trusted auto-merge did not finish in its grace period.
Never bypass a failed, pending, or timed-out check. Inspect the linked run, fix
the same branch, push the new head, and invoke the waiter again. A changed head
resets the observed check set.
