---
name: wait-for-pr-ci
description: Block on any GitHub Actions pull-request workflow until required or selected checks reach a final result, optionally continuing until merge. Use after opening or updating a PR when Codex must wait for branch-protection or ruleset checks, a named status/check, every Actions check on the current head, or an authoritative cross-repository status such as Public SDK CI, and resume through the background-terminal completion hook instead of polling.
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
Use `--timeout-seconds` only for an explicit caller time budget; `0` waits
indefinitely.

## Yield to the completion hook

Make the blocking script invocation the final tool call of the current turn.
If it reports that the command is still running or returns a background cell ID:

- do not call a wait tool;
- do not poll with `gh` or invoke any other tool;
- end the turn immediately with a concise waiting status.

The background-terminal completion hook requests the next model turn when the
script exits and supplies its final output. On that resumed turn, interpret the
existing `WAIT_FOR_PR_CI` result; do not launch a second waiter. If the command
finishes synchronously, interpret it normally in the same turn.

## Interpret the result

- Exit `0`: selected CI succeeded; with `--wait-for-merge`, the PR is merged.
- Exit `1`: at least one selected check failed or errored.
- Exit `2`: the PR closed without merging.
- Exit `3`: the requested timeout expired.
- Exit `4`: arguments, authentication, repository lookup, or API access failed.

Do not bypass failed, pending, or timed-out checks. Inspect the linked run, fix
the same task branch, push, and invoke the script again. A changed PR head
automatically resets the observed check set.
