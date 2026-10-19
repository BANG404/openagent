---
name: openagent-windows-development
description: Use for Windows development performance, WSL synchronization, linker selection, filesystem boundaries, or Windows-specific local setup.
metadata:
  category: development-environment
---

# Windows development

Read [setup and synchronization](references/setup-and-sync.md) for linker, filesystem, build-memory and WSL workflows.
Apply performance settings only to the intended local verification process or explicitly chosen setup operation.

Native verification runs in the signed-in user's interactive desktop session. Keep the same isolated fixture and worktree when launching from Session 0; do not change product sandbox policy to compensate for a service-session failure.
