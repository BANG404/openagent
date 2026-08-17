# Parallel Codex exec OWT tasks

Use the launcher only when a user request separates into at least two tasks
whose implementation scopes, files, and acceptance criteria are independent.
Keep dependent work, shared-file edits, private SDK changes, and ambiguous
ownership in one agent. The parent agent remains responsible for the complete
user request and must inspect the combined result after every child exits.

## Launch independent tasks

Pass one complete, bounded prompt per repeated `--task`. Each prompt must start
with the uppercase standalone `OWT` prefix so the child creates an isolated
worktree, runs preflight, commits, integrates into the local default branch,
and cleans up according to the normal OWT workflow:

```bash
rtk bun .agents/skills/deliver-via-pr/scripts/run-codex-exec-batch.mjs \
  --repo . \
  --max-concurrency 3 \
  --task "OWT implement the first independent scope and its documentation" \
  --task "OWT implement the second independent scope and its documentation"
```

The launcher invokes `codex exec` without a shell, grants `workspace-write`
access to the repository and its parent so OWT sibling worktrees can be created,
prefixes each process's output, waits for all processes, and exits nonzero if
any child fails. It defaults to at most four simultaneous processes. Use
`--dry-run` to inspect resolved commands and paths without launching Codex, and
`--codex-bin` only when the executable cannot be resolved normally.

Do not pass secrets in prompts or command-line arguments. The children inherit
the parent process environment and Codex authentication. Do not weaken the
sandbox arguments in the script; OWT needs repository and sibling-worktree
writes, not unrestricted machine access.

## Supervise and finish

Run the command in a terminal cell that can be resumed instead of detaching it.
Continue reporting progress while it runs. If a child fails, inspect its
reported branch and worktree before retrying; never launch a duplicate task or
delete uncertain state automatically.

Successful process exit means only that each child reported completing its own
OWT workflow. After all children finish, the parent must inspect local `master`,
the complete combined diff from the recorded starting HEAD, repository status,
and remaining worktrees. Confirm that every requested acceptance criterion is
present and that unrelated state was preserved. Run combined verification only
when the child results or merged interaction require it; do not duplicate
preflight merely because tasks ran concurrently.

This launcher is an alternative to the sealed batch coordinator. Use the
coordinator when all task heads must be integrated atomically by one elected
agent; do not register launcher-created ordinary OWT tasks into a sealed batch.
