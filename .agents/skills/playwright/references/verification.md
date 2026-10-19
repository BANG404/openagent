# Browser verification in OpenAgent

Use the repository wrapper even when a global CLI/skill is installed: it supplies
`.playwright/cli.config.json`, the persistent browser path and temporary artifacts.
First-time setup and the pinned CLI/browser pair live in [installation](install.md).
Use `--help` for command syntax instead of maintaining a copied CLI catalog.

## One task, one session

Choose a collision-resistant session and keep it for the entire flow. The implicit
`default` session is shared process state. Close only the current task's session.

```powershell
$PWCLI = Join-Path (Get-Location) ".agents/skills/playwright/scripts/playwright_cli.ps1"
$env:PLAYWRIGHT_CLI_SESSION = "ui-review-$PID"
& $PWCLI open http://localhost:5173 --headed
& $PWCLI snapshot
# Use an element reference from this snapshot:
& $PWCLI click e3
& $PWCLI snapshot
& $PWCLI console error
& $PWCLI screenshot
& $PWCLI close
```

Use the actual URL reported by Vite, which can choose a different available port.
In Bash set `PWCLI="$PWD/.agents/skills/playwright/scripts/playwright_cli.sh"`
and `PLAYWRIGHT_CLI_SESSION="ui-review-$$"`, then invoke `"$PWCLI"`.
The wrappers prefer an installed CLI, then pinned Bunx, then pinned Npx.
Use the wrapper native to the current shell; Windows verification does not go through WSL.

Snapshot before referring to element IDs and after navigation or state changes.
Refresh stale references; prefer explicit interaction/assertion commands over
`eval`/`run-code`. Verify the composed UI, affected loading/error states, themes
and locales. Capture console/network failures when reproducing a bug.

Automatic screenshots and traces stay in the wrapper's temporary directory.
Set `PLAYWRIGHT_MCP_OUTPUT_DIR` only for deliberate retained evidence; do not
create an incidental repository-root output directory. Record the actual URL,
fixture, observed assertions and artifact paths in the handoff.

Browser rendering does not establish native window startup, IPC or material
correctness. Use the desktop-host native scenario for those behaviors.
