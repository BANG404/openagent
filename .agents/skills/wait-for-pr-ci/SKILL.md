---
name: wait-for-pr-ci
description: Block on any GitHub Actions pull-request workflow until required or selected checks reach a final result, optionally continuing until merge. Use after opening or updating a PR when Codex must wait for branch-protection or ruleset checks, a named status/check, every Actions check on the current head, or an authoritative cross-repository status such as Public SDK CI, while keeping continuation attached to the same background cell instead of polling GitHub separately.
---

# Wait for PR CI

Run the bundled script from the task worktree. By default it discovers required
status/check names from both branch protection and active repository rulesets.
If the branch has no required checks, it waits for every GitHub Actions check or
Actions-backed commit status observed on the current PR head.

## Start the blocking wait

Resolve the script relative to this skill and invoke it through `rtk`:

```powershell
rtk python .agents/skills/wait-for-pr-ci/scripts/wait_for_pr_ci.py <PR>
```

Omit `<PR>` to resolve the PR for the current branch. Use `--repo OWNER/REPO`
outside its checkout. The default discovery supports both OpenAgent's
`Required PR Head` ruleset and the SDK's branch-protected `Public SDK CI`
without repository-specific hardcoding.

Use explicit names when the desired flow is not required by the base branch:

```powershell
rtk python .agents/skills/wait-for-pr-ci/scripts/wait_for_pr_ci.py <PR> --check "Build" --check "E2E"
```

Use `--all-actions` to ignore required-check discovery and wait for all Actions
checks/statuses on the immutable head. The script requires a quiet settle period
before generic all-actions success so a dispatcher cannot finish just before a
downstream status appears.

Use `--wait-for-merge` when a trusted workflow is expected to merge the PR.
After selected CI succeeds, the script allows trusted auto-merge 120 seconds by
default. If the PR remains open, it returns `merge-pending` so the caller can
inspect review or token blockers and apply the repository's documented merge
fallback. Set `--merge-wait-seconds 0` only when indefinite merge waiting is
intentional.
Use `--timeout-seconds` only for an explicit caller time budget; `0` waits
indefinitely.

## Keep the background wait attached

After invoking the script, do not use `gh`, start a second waiter, or call an
unrelated tool until it finishes. If the command returns a background cell ID,
call the execution tool's wait operation on that same cell. Use waits no longer
than 50 seconds so progress commentary remains possible, and repeat on the same
cell while it reports that the script is still running.

Do not end the agent turn while the cell is active. This execution environment
does not guarantee an automatic model continuation when a detached cell exits,
and the completed cell may be reclaimed before the next user turn. The wait
operation is the continuation hook that returns the script's final output to the
model.

If the user interrupts an active wait, try the same cell once on the resumed
turn. If it no longer exists, rerun this read-only script for the PR instead of
guessing the result. When the script finishes synchronously or a wait returns
its completion, interpret the existing `WAIT_FOR_PR_CI` result normally.

## Interpret the result

- Exit `0`: selected CI succeeded; with `--wait-for-merge`, the PR is merged.
- Exit `1`: at least one selected check failed or errored.
- Exit `2`: the PR closed without merging.
- Exit `3`: the requested timeout expired.
- Exit `4`: arguments, authentication, repository lookup, or API access failed.
- Exit `5`: selected CI succeeded, but the PR did not merge within the allowed
  auto-merge window. Re-read the PR state and use the repository's approved
  review or admin-merge fallback; do not rerun CI merely because merging is
  blocked.

Do not bypass failed, pending, or timed-out checks. Inspect the linked run, fix
the same task branch, push, and invoke the script again. A changed PR head
automatically resets the observed check set.
