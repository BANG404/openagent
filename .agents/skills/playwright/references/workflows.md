# Playwright CLI Workflows

Use the wrapper script and snapshot often.
Assume `PWCLI` is set and `pwcli` is an alias for `"$PWCLI"`.
The wrapper sends automatic artifacts to the system temporary directory. Set `PLAYWRIGHT_MCP_OUTPUT_DIR` explicitly only when the task needs a retained destination outside the repository root.

## Standard interaction loop

```bash
pwcli open https://example.com
pwcli snapshot
pwcli click e3
pwcli snapshot
```

## Form submission

```bash
pwcli open https://example.com/form --headed
pwcli snapshot
pwcli fill e1 "user@example.com"
pwcli fill e2 "password123"
pwcli click e3
pwcli snapshot
pwcli screenshot
```

## Data extraction

```bash
pwcli open https://example.com
pwcli snapshot
pwcli eval "document.title"
pwcli eval "el => el.textContent" e12
```

## Debugging and inspection

Capture console messages and network activity after reproducing an issue:

```bash
pwcli console warning
pwcli requests
```

Record a trace around a suspicious flow:

```bash
pwcli tracing-start
# reproduce the issue
pwcli tracing-stop
pwcli screenshot
```

## Sessions

Use a collision-resistant named session for every task, including work in the
same repository. The implicit `default` session is shared process state and is
not safe when agents or terminal workflows run in parallel.

```bash
export PLAYWRIGHT_CLI_SESSION="checkout-$$"
pwcli open https://example.com/checkout
pwcli snapshot
pwcli close
```

In PowerShell, include the process ID for the same isolation:

```powershell
$env:PLAYWRIGHT_CLI_SESSION = "checkout-$PID"
pwcli open https://example.com/checkout
pwcli snapshot
pwcli close
```

Keep the same session name for the complete workflow so its page and element
references stay coherent. Close only the current task's session; never reuse or
terminate another task's session or browser process.

## Configuration file

By default, the CLI reads `.playwright/cli.config.json`. Use `--config` to point at a specific file.

Minimal example:

```json
{
  "browser": {
    "launchOptions": {
      "headless": false
    },
    "contextOptions": {
      "viewport": { "width": 1280, "height": 720 }
    }
  }
}
```

## Troubleshooting

- If an element ref fails, run `pwcli snapshot` again and retry.
- If the page looks wrong, re-open with `--headed` and resize the window.
- If a flow depends on prior state, use a named `--session`.
