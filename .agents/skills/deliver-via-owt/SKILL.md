---
name: deliver-via-owt
description: "Use for OpenAgent repository changes. Prefer the simple Codex worktree path: validate and return automatically to local main, leaving cleanup to Codex. Use ordinary OWT when managed worktrees are unavailable, and batches only for joint delivery."
metadata:
  category: repository-delivery
---

# Repository delivery

Preserve unrelated work and record the committed local `main` base before editing.

| Task | Read |
| --- | --- |
| Existing eligible Codex conversation worktree | [Codex delivery](references/codex-worktree.md) |
| Worktree selection, fallback or integration recovery | [Ordinary OWT](references/owt.md) |
| Choosing the documentation owner | [Living documentation](references/living-documentation.md) |
| Explicitly coordinated joint delivery | [Sealed batches](references/batch-owt.md) |
| Explicitly launching independent Codex tasks | [Parallel execution](references/parallel-codex-exec.md) |

Use the simple Codex path when eligible. Batch procedures apply only to joint work.
