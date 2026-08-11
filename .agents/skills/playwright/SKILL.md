---
name: "playwright"
description: "Use when the task requires rendering or automating a real browser from the terminal, including frontend change verification, visual and interaction checks, screenshots, navigation, form filling, data extraction, and UI-flow debugging, via an installed `playwright-cli` or a Bun-preferred, Node-compatible package runner."
---


# Playwright CLI Skill

Drive a real browser from the terminal using `playwright-cli`. Use the bundled wrapper so workflows prefer an installed CLI, fall back to Bunx, and remain compatible with npx when only Node/npm is available.
Treat this skill as CLI-first automation. Do not pivot to `@playwright/test` unless the user explicitly asks for test files.

## Prerequisite check (required)

Before proposing commands, check that at least one supported launcher is available:

```bash
command -v playwright-cli >/dev/null 2>&1 || command -v bunx >/dev/null 2>&1 || command -v npx >/dev/null 2>&1
```

Prefer a Bun-managed global installation for repeated workflows:

```bash
bun add --global @playwright/cli@latest
playwright-cli --help
```

Node/npm is a supported alternative:

```bash
npm install --global @playwright/cli@latest
playwright-cli --help
```

If neither runtime is installed, pause and ask the user to install Bun or Node.js. Once any supported launcher is present, proceed through the wrapper.

## Skill path (set once)

From the repository root in Bash:

```bash
export PWCLI="$PWD/.agents/skills/playwright/scripts/playwright_cli.sh"
```

From the repository root in Windows PowerShell:

```powershell
$PWCLI = Join-Path (Get-Location) ".agents\skills\playwright\scripts\playwright_cli.ps1"
```

Use the wrapper native to the current shell; do not invoke the Bash wrapper through WSL from Windows.

## Session isolation (required)

Every repository task must use its own named browser session. Never use the
implicit `default` session: parallel agents share the same Playwright daemon,
so one task can otherwise navigate, close, or invalidate another task's page
and element references. Choose a task-specific name with a collision-resistant
suffix such as the shell PID, set `PLAYWRIGHT_CLI_SESSION` once, and use that
session for every command in the workflow.

```bash
export PLAYWRIGHT_CLI_SESSION="attachment-preview-$$"
```

```powershell
$env:PLAYWRIGHT_CLI_SESSION = "attachment-preview-$PID"
```

Close only the session created by the current task. Never close, reuse, or
terminate a session or browser process whose ownership is unclear.

## Quick start

Use the wrapper script:

```bash
"$PWCLI" open https://playwright.dev --headed
"$PWCLI" snapshot
"$PWCLI" click e15
"$PWCLI" type "Playwright"
"$PWCLI" press Enter
"$PWCLI" screenshot
```

In PowerShell, invoke the same commands with the call operator, for example `& $PWCLI open https://playwright.dev --headed`.

## Core workflow

1. Create a unique named session and open the page in it.
2. Snapshot to get stable element refs.
3. Interact using refs from the latest snapshot.
4. Re-snapshot after navigation or significant DOM changes.
5. Capture artifacts (screenshot, pdf, traces) when useful.

Minimal loop:

```bash
"$PWCLI" open https://example.com
"$PWCLI" snapshot
"$PWCLI" click e3
"$PWCLI" snapshot
```

## When to snapshot again

Snapshot again after:

- navigation
- clicking elements that change the UI substantially
- opening/closing modals or menus
- tab switches

Refs can go stale. When a command fails due to a missing ref, snapshot again.

## Recommended patterns

### Form fill and submit

```bash
"$PWCLI" open https://example.com/form
"$PWCLI" snapshot
"$PWCLI" fill e1 "user@example.com"
"$PWCLI" fill e2 "password123"
"$PWCLI" click e3
"$PWCLI" snapshot
```

### Debug a UI flow with traces

```bash
"$PWCLI" open https://example.com --headed
"$PWCLI" tracing-start
# ...interactions...
"$PWCLI" tracing-stop
```

### Multi-tab work

```bash
"$PWCLI" tab-new https://example.com
"$PWCLI" tab-list
"$PWCLI" tab-select 0
"$PWCLI" snapshot
```

## Frontend verification

Use this skill whenever a task requires a browser-rendered frontend surface. This includes validating frontend modifications, reproducing browser-visible bugs, checking responsive layouts and interactive states, verifying light/dark themes or localized copy, and capturing software screenshots, PDFs, videos, or traces.

Prefer repository-provided browser preview routes over imitating unavailable native state. Capture the states needed to support the result, not just the initial page. The wrapper keeps automatic CLI output in the system temporary directory by default. Override `PLAYWRIGHT_MCP_OUTPUT_DIR` only when a task needs a deliberate destination.

## Wrapper script

Both platform wrappers resolve the CLI in this order:

1. `playwright-cli` already available on `PATH`.
2. `bunx --package @playwright/cli playwright-cli`.
3. `npx --yes --package @playwright/cli playwright-cli`.

Use the same interface regardless of the selected launcher:

```bash
"$PWCLI" --help
```

Use the wrapper for all skill workflows so session handling and launcher selection remain consistent.

## References

Open only what you need:

- CLI command reference: `references/cli.md`
- Practical workflows and troubleshooting: `references/workflows.md`

## Guardrails

- Never run repository browser work in the implicit `default` session. Keep one
  collision-resistant named session for the complete task and close only that
  session during cleanup.
- Always snapshot before referencing element ids like `e12`.
- Re-snapshot when refs seem stale.
- Prefer explicit commands over `eval` and `run-code` unless needed.
- When you do not have a fresh snapshot, use placeholder refs like `eX` and say why; do not bypass refs with `run-code`.
- Use `--headed` when a visual check will help.
- Do not create `output/` or another repository-root artifact directory. Leave automatic artifacts in the wrapper's temporary directory, and copy only explicitly requested deliverables to a deliberate destination.
- Default to CLI commands and workflows, not Playwright test specs.
