# Codex worktree delivery

Use this short path when the conversation already has an eligible isolated
worktree, including a Codex-managed detached checkout. Codex owns its creation,
conversation association, and cleanup; OWT supplies the project's validation and
automatic return to local `main`. No task branch or batch manifest is required.

## Start and work

1. Inspect `git status --short --branch` and `git worktree list --porcelain`.
   Locate the default checkout on local `main`, record its full committed SHA
   before editing, and confirm this conversation worktree has no unrelated work.
   Apply [the selection rules](owt.md#select-the-worktree-before-creating-one).
   A clean checkout behind local `main` may fast-forward before recording the
   base. Keep detached HEAD detached; keep an existing dedicated task branch.
2. Reuse completed environment preparation for the current pinned inputs;
   otherwise run `bun run prepare:worktree:dev` here. This command can be a Codex
   local environment setup script. Add `--native` only for native verification.
3. Implement the task, required coverage, and owner documentation. Complete
   applicable interactive or native verification. Inspect the complete diff and
   stage only intended paths with `git add -- <paths>`.

When no eligible conversation worktree exists, prefer Codex's worktree creation
tool if available. Specify the recorded local `main` SHA rather than accepting a
remote default, and use the returned workspace path after creation completes.
If Codex cannot manage worktrees in this environment, use the
[ordinary OWT path](owt.md#isolated-task-worktree-then-fast-forward). Never claim
that a checkout created manually by Git is managed by Codex.

## Automatic validation and return to main

The agent runs this from the task checkout once the reviewed files are staged;
the user does not need to move the conversation or merge by hand:

```bash
bun .agents/skills/deliver-via-owt/scripts/finish-worktree.mjs \
  --base <recorded-local-main-sha> --message "fix(scope): describe the task"
```

The helper discovers the registered local `main` checkout, runs
`bun run preflight --base <recorded-local-main-sha>`, commits the reviewed index,
and fast-forwards the verified commit into local `main`. Already committed task
work is also validated and delivered; omit `--message` when no staged changes
remain. It never stages files itself, switches the default checkout's branch,
pushes, creates a task branch, or removes a worktree. Keep `main` clean for this
automatic path; preserve developer changes when it is dirty.

Concurrent committed advances are merged into the task checkout with ordinary
Git merges, followed by preflight on the combined source. The helper shares the
batch coordinator's short main-update lock, without joining a batch or holding
that lock during validation. It retries at most five times per invocation;
continuous advances leave the task intact for another invocation. A conflict
stays in the task checkout for review and resolution. A failed preflight cannot
deliver the failing source. Changes to the index or source during validation
invalidate that attempt.

If validation, a conflict, or a dirty default directory blocks delivery, report
the exact gate and task checkout; preserve staged work and task commits. Resolve
task-owned issues and rerun the same command. Do not reset, stash, or force an
update to `main`. A missing local `main` checkout or rewritten base likewise
requires inspecting the preserved histories. Batch delivery is only for an
explicit joint task set; do not enroll independent Codex conversations.

After success, confirm `action: integrated`, the verified SHA on local `main`,
and the unchanged conversation directory. Leave Codex-managed cleanup to Codex.
Report verification, commit, retained worktree, and actual push status. Follow
the workspace's existing publishing authorization separately. Codex Handoff is
unnecessary for returning code to `main`: this path keeps the default checkout
on `main` throughout.
