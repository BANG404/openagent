---
name: project-orientation
description: Read-only guide for understanding OpenAgent's architecture, ownership boundaries, repository layout, and the correct skill to use before editing.
metadata:
  category: project-understanding
---

# Project orientation

Use this skill when the request is to understand the repository, locate an
owner, explain how the desktop app is composed, or decide which skill applies.
It is a read-only orientation layer; do not make implementation changes from
this skill alone.

## Architecture at a glance

- `src/` is the SvelteKit presentation layer. `src/routes/+page.svelte` is the
  composition root; reusable views belong in `src/lib/components/`.
- `src-tauri/` is the thin Tauri desktop host: windows, capabilities, IPC
  adapters, startup, and native lifecycle.
- `sdk/` is the pinned private runtime and typed transport submodule. Read
  `sdk/AGENTS.md` and its matching SDK skill before changing SDK-owned code.
- `.agents/skills/` is the durable agent-facing map for product behavior,
  invariants, and repeatable procedures.

## Route by intent

- Chat UI and streamed transcript: `openagent-chat-frontend`
- Native host or Tauri boundary: `openagent-desktop-host`
- Configuration and durable data: `openagent-configuration`,
  `openagent-persistence`
- Visual language and layout: `openagent-design-system`
- Debugging the native app: `native-app-debugging`
- Browser-only verification: `playwright`
- SDK conversation/runtime debugging: see `sdk/.agents/skills/`
- Commits, worktrees, and handoff: `deliver-via-pr`

For a change that crosses boundaries, select the smallest set of owners and
read each owner before editing. Keep detailed rules in the primary owner
instead of copying them into this orientation guide.
