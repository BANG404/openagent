# Session isolation and quick start

## Session isolation

Every repository task must use its own named browser session. Never use
the implicit `default` session: parallel agents share the same
Playwright daemon, so one task can otherwise navigate, close, or
invalidate another task's page and element references. Choose a
task-specific name with a collision-resistant suffix such as the shell
PID, set `PLAYWRIGHT_CLI_SESSION` once, and use that session for every
command in the workflow.

```bash
export PLAYWRIGHT_CLI_SESSION="attachment-preview-$$"
```

```powershell
$env:PLAYWRIGHT_CLI_SESSION = "attachment-preview-$PID"
```

Close only the session created by the current task. Never close, reuse,
or terminate a session or browser process whose ownership is unclear.

## Quick start

```bash
"$PWCLI" open https://playwright.dev --headed
"$PWCLI" snapshot
"$PWCLI" click e15
"$PWCLI" type "Playwright"
"$PWCLI" press Enter
"$PWCLI" screenshot
```

In PowerShell, invoke the same commands with the call operator, for
example `& $PWCLI open https://playwright.dev --headed`.

## Wrapper script

Both platform wrappers resolve the CLI in this order:

1. `playwright-cli` already available on `PATH`.
2. `bunx --package @playwright/cli@0.1.19 playwright-cli`.
3. `npx --yes --package @playwright/cli@0.1.19 playwright-cli`.

Both wrappers inject the repository config and persistent browser path.
Do not add `--browser` to routine commands. An explicit `--config`
remains available for a task that genuinely needs a different browser
contract.
