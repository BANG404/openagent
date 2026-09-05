---
name: deliver-via-pr
description: "Implement and deliver OpenAgent repository changes using prefix-selected Git modes. Use for every repository-changing task: default to verified commits directly on the local host default branch, use OWT for an isolated local worktree, push private SDK commits directly, use OPR for a ready public-host PR, and use ORPR for administrator-bypassed merge and cleanup."
metadata:
  category: pr-and-ci
---

# Repository delivery

## Select the mode

Read the first token of the user's task. Match `ORPR` before `OPR`; `OWT` is a
separate prefix. A prefix is an uppercase standalone token at the start of the
message, optionally followed by whitespace or a colon. Remove the token from
the task description after selecting the mode.

| Input | Mode | Terminal state |
| --- | --- | --- |
| No prefix | Direct local | Verified commits on the local default branch; no branch, worktree, push, or PR |
| `OWT` | Worktree local | Isolated task worktree; commits fast-forwarded into the local default branch; no push or PR |
| `OPR` | PR sync | Ready PR on a dedicated task branch/worktree; no CI wait or merge |
| `ORPR` | Full PR | Isolated worktree and branch, ready PR, administrator merge, and safe cleanup |

An explicit user instruction (uncommitted changes, no push, draft PR, no merge,
named target branch) overrides the corresponding default. A prefix selects
delivery mechanics only; it does not broaden task scope.

## Establish scope

- Read the nearest `AGENTS.md` and the mapped source-of-truth documentation.
- For behavior or documentation changes, read
  [references/living-documentation.md](references/living-documentation.md) and
  pick one primary documentation owner.
- Inspect `git status --short --branch`, worktrees, and the remote default
  branch. Check GitHub authentication only for `OPR` or `ORPR`.
- For diagnosis or review only, do not change branches or files.
- Preserve unrelated branches, worktrees, staged files, and working changes.
  Direct local mode stages only the owned paths or hunks. Use the automatic
  conflict-isolation procedure in
  [references/modes.md](references/modes.md#automatic-conflict-isolation) when
  unrelated local state blocks safe editing or authoritative verification.
  `OWT` leaves unrelated changes in the default worktree; never copy them into
  the task worktree.
- Follow `sdk/AGENTS.md` for SDK work. The private SDK does not use pull
  requests: push focused commits to `main` first, then update the parent
  gitlink.

## Read the right reference

Open only the references that own the affected step:

- Direct, OWT, and OPR publish procedures: [references/modes.md](references/modes.md)
- `OPR` park and reconciliation: [references/opr-reconcile.md](references/opr-reconcile.md)
- `ORPR` isolated worktree, merge, and cleanup: [references/orpr-mode.md](references/orpr-mode.md)
- Living documentation ownership: [references/living-documentation.md](references/living-documentation.md)
- Sealed batch OWT coordination: [references/batch-owt.md](references/batch-owt.md)
- Parallel Codex execution: [references/parallel-codex-exec.md](references/parallel-codex-exec.md)

## Verification

Run `bun run preflight` before commit. Use `--dry-run` to inspect and
`--base <ref>` only for non-`master` targets. Do not duplicate CI lint, test,
check, or build commands locally. Hand off to `wait-for-pr-ci` when CI
monitoring is required after `OPR` or `ORPR`.
