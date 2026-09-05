# Install and skill path

## Prerequisite check

Before proposing commands, confirm at least one supported launcher is
available:

```bash
command -v playwright-cli >/dev/null 2>&1 || command -v bunx >/dev/null 2>&1 || command -v npx >/dev/null 2>&1
```

Prefer the pinned Bun-managed global installation for repeated
workflows:

```bash
bun add --global @playwright/cli@0.1.19
playwright-cli --help
```

Node/npm is a supported alternative:

```bash
npm install --global @playwright/cli@0.1.19
playwright-cli --help
```

If neither runtime is installed, pause and ask the user to install Bun
or Node.js before proceeding.

## Persistent browser installation

The wrappers load `.playwright/cli.config.json`, use Chromium
consistently, and store its managed binaries outside the disposable
Playwright cache. The default is
`${XDG_DATA_HOME:-$HOME/.local/share}/openagent/playwright` on Bash and
`%LOCALAPPDATA%\OpenAgent\playwright` on Windows. Respect an existing
`PLAYWRIGHT_BROWSERS_PATH` override when a machine deliberately
centralizes Playwright browsers elsewhere.

Prepare the pinned browser once after cloning or after intentionally
removing that data directory:

```bash
export PWCLI="$PWD/.agents/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" install-browser
```

```powershell
$PWCLI = Join-Path (Get-Location) ".agents\skills\playwright\scripts\playwright_cli.ps1"
& $PWCLI install-browser
```

Do not run `playwright install` during ordinary verification and do not
point the wrapper back at `~/.cache/ms-playwright`. The wrapper's
installer pins the browser package to the CLI-compatible Playwright
release, so updating either pin requires updating both wrappers and
reinstalling the persistent browser.

## Skill path

Set once per shell. From the repository root in Bash:

```bash
export PWCLI="$PWD/.agents/skills/playwright/scripts/playwright_cli.sh"
```

From the repository root in Windows PowerShell:

```powershell
$PWCLI = Join-Path (Get-Location) ".agents\skills\playwright\scripts\playwright_cli.ps1"
```

Use the wrapper native to the current shell; do not invoke the Bash
wrapper through WSL from Windows.
