---
name: "playwright"
description: "Use when the task requires rendering or automating a real browser from the terminal, including frontend change verification, visual and interaction checks, screenshots, navigation, form filling, data extraction, and UI-flow debugging, via an installed `playwright-cli` or a Bun-preferred, Node-compatible package runner."
metadata:
  category: browser-automation
---

# Playwright CLI

Drive a real browser from the terminal using `playwright-cli`. Use the
bundled wrapper so workflows prefer an installed CLI, fall back to a
pinned Bunx or npx package, and remain compatible with both Bun and
Node/npm. Treat this skill as CLI-first automation. Do not pivot to
`@playwright/test` unless the user explicitly asks for test files.

## Read the right reference

Open only the references that own the affected step:

- Persistent browser install and skill path:
  [references/install.md](references/install.md)
- Session isolation and quick start:
  [references/session.md](references/session.md)
- CLI command reference: [references/cli.md](references/cli.md)
- Practical workflows and troubleshooting:
  [references/workflows.md](references/workflows.md)
- Guardrails: [references/guardrails.md](references/guardrails.md)

## Core workflow

1. Create a unique named session and open the page in it.
2. Snapshot to get stable element refs.
3. Interact using refs from the latest snapshot.
4. Re-snapshot after navigation or significant DOM changes.
5. Capture artifacts (screenshot, pdf, traces) when useful.

Re-snapshot after navigation, clicks that change the UI substantially,
opening/closing modals or menus, or tab switches. Refs can go stale;
when a command fails due to a missing ref, snapshot again.

## Frontend verification

Use this skill whenever a task requires a browser-rendered frontend
surface: validating frontend modifications, reproducing browser-visible
bugs, checking responsive layouts and interactive states, verifying light
and dark themes or localized copy, and capturing screenshots, PDFs,
videos, or traces.

Prefer repository-provided browser preview routes over imitating
unavailable native state. Capture the states needed to support the
result, not just the initial page. The wrapper keeps automatic CLI
output in the system temporary directory by default. Override
`PLAYWRIGHT_MCP_OUTPUT_DIR` only when a task needs a deliberate
destination.
