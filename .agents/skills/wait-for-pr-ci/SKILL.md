---
name: wait-for-pr-ci
description: Block until a GitHub pull request's authoritative OpenAgent CI reaches a final result, and optionally continue until the PR is merged. Use when an agent has opened or updated an OpenAgent PR and must wait for Required PR Head instead of polling checks manually or returning while CI is pending.
---

# Wait for PR CI

Run the bundled script from the repository worktree. It follows the PR's current
head SHA and treats the stable `Required PR Head` commit status as the final
authoritative CI result.

## Wait for CI

Resolve the script relative to this skill and invoke it through `rtk`:

```powershell
rtk python .agents/skills/wait-for-pr-ci/scripts/wait_for_pr_ci.py <PR>
```

Omit `<PR>` to resolve the pull request for the current branch. Pass a PR
number or URL when the current worktree is not on its head branch. The command
blocks without a timeout by default.

Use `--wait-for-merge` when the owner auto-merge workflow is expected to merge
the PR after CI:

```powershell
rtk python .agents/skills/wait-for-pr-ci/scripts/wait_for_pr_ci.py <PR> --wait-for-merge
```

Use `--timeout-seconds <seconds>` only when the caller has an explicit time
budget. A value of `0` means no timeout. Use `--repo OWNER/REPO` outside a
checked-out repository.

## Interpret the result

- Exit `0`: authoritative CI succeeded; with `--wait-for-merge`, the PR also
  reports `MERGED`.
- Exit `1`: authoritative CI failed or errored.
- Exit `2`: the PR closed without merging.
- Exit `3`: the requested timeout expired.
- Exit `4`: arguments, authentication, repository lookup, or GitHub API access
  failed.

Do not replace a failed or timed-out result with an admin bypass. Inspect the
linked Actions run, fix the same task branch, push, and invoke the script again.
If the PR head changes while waiting, the script discards the old result and
waits for the new head.
