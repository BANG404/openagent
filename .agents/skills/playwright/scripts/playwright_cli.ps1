$ErrorActionPreference = "Stop"

$playwrightCliPackage = "@playwright/cli@0.1.19"
$playwrightBrowserPackage = "playwright@1.63.0-alpha-2026-08-31"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path

if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
    if ($env:LOCALAPPDATA) {
        $playwrightDataRoot = $env:LOCALAPPDATA
    } elseif ($env:XDG_DATA_HOME) {
        $playwrightDataRoot = $env:XDG_DATA_HOME
    } else {
        $playwrightDataRoot = Join-Path $HOME ".local\share"
    }
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $playwrightDataRoot "OpenAgent\playwright"
}

if (-not $env:PLAYWRIGHT_MCP_OUTPUT_DIR) {
    $env:PLAYWRIGHT_MCP_OUTPUT_DIR = Join-Path ([System.IO.Path]::GetTempPath()) "codex-playwright"
}
New-Item -ItemType Directory -Path $env:PLAYWRIGHT_MCP_OUTPUT_DIR -Force | Out-Null

$hasSessionFlag = $false
$hasConfigFlag = $false
foreach ($argument in $args) {
    if ($argument -eq "--session" -or $argument.StartsWith("--session=")) {
        $hasSessionFlag = $true
    }
    if ($argument -eq "--config" -or $argument.StartsWith("--config=")) {
        $hasConfigFlag = $true
    }
}

if ($args.Count -gt 0 -and $args[0] -eq "install-browser") {
    New-Item -ItemType Directory -Path $env:PLAYWRIGHT_BROWSERS_PATH -Force | Out-Null
    if (Get-Command bunx -ErrorAction SilentlyContinue) {
        & bunx --package $playwrightBrowserPackage playwright install chromium
        exit $LASTEXITCODE
    }
    if (Get-Command npx -ErrorAction SilentlyContinue) {
        & npx --yes --package $playwrightBrowserPackage playwright install chromium
        exit $LASTEXITCODE
    }
    Write-Error "Bun/Bunx or Node/npx is required to install Chromium."
    exit 1
}

$playwrightCommand = Get-Command playwright-cli -ErrorAction SilentlyContinue
if ($playwrightCommand) {
    $executable = $playwrightCommand.Source
    $commandArgs = @()
} elseif (Get-Command bunx -ErrorAction SilentlyContinue) {
    $executable = "bunx"
    $commandArgs = @("--package", $playwrightCliPackage, "playwright-cli")
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    $executable = "npx"
    $commandArgs = @("--yes", "--package", $playwrightCliPackage, "playwright-cli")
} else {
    Write-Error "playwright-cli, Bun/Bunx, or Node/npx is required."
    exit 1
}
if (-not $hasSessionFlag -and $env:PLAYWRIGHT_CLI_SESSION) {
    $commandArgs += @("--session", $env:PLAYWRIGHT_CLI_SESSION)
}
$commandArgs += $args
if (-not $hasConfigFlag -and $args.Count -gt 0 -and ($args[0] -eq "open" -or $args[0] -eq "attach")) {
    $commandArgs += @("--config", (Join-Path $repoRoot ".playwright\cli.config.json"))
}

& $executable @commandArgs
exit $LASTEXITCODE
