---
name: deliver-via-pr
description: Implement and deliver OpenAgent repository changes using prefix-selected Git modes. Use for every repository-changing task: direct delivery is for one agent owning the local default branch under the delivery lock, while concurrent work uses OWT or a sealed OWT batch with isolated worktrees and a verified fast-forward integration.
metadata:
  category: pr-and-ci
---

# Repository delivery

Read [references/modes.md](references/modes.md) for delivery. Use
[living-documentation.md](references/living-documentation.md) for ownership.
Preserve unrelated work. Run bun run preflight.
