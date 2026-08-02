$ErrorActionPreference = "Stop"

if (-not $env:PLAYWRIGHT_MCP_OUTPUT_DIR) {
    $env:PLAYWRIGHT_MCP_OUTPUT_DIR = Join-Path ([System.IO.Path]::GetTempPath()) "codex-playwright"
}
New-Item -ItemType Directory -Path $env:PLAYWRIGHT_MCP_OUTPUT_DIR -Force | Out-Null

$hasSessionFlag = $false
foreach ($argument in $args) {
    if ($argument -eq "--session" -or $argument.StartsWith("--session=")) {
        $hasSessionFlag = $true
        break
    }
}

$playwrightCommand = Get-Command playwright-cli -ErrorAction SilentlyContinue
if ($playwrightCommand) {
    $executable = $playwrightCommand.Source
    $commandArgs = @()
} elseif (Get-Command bunx -ErrorAction SilentlyContinue) {
    $executable = "bunx"
    $commandArgs = @("--package", "@playwright/cli", "playwright-cli")
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    $executable = "npx"
    $commandArgs = @("--yes", "--package", "@playwright/cli", "playwright-cli")
} else {
    Write-Error "playwright-cli, Bun/Bunx, or Node/npx is required."
    exit 1
}
if (-not $hasSessionFlag -and $env:PLAYWRIGHT_CLI_SESSION) {
    $commandArgs += @("--session", $env:PLAYWRIGHT_CLI_SESSION)
}
$commandArgs += $args

& $executable @commandArgs
exit $LASTEXITCODE
