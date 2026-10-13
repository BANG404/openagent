param(
    [Parameter(Mandatory = $true)][string]$Artifacts,
    [Parameter(Mandatory = $true)][string]$Version
)
$ErrorActionPreference = 'Stop'
$candidate = Get-Content -LiteralPath (Join-Path $Artifacts 'alpha-candidate.json') -Raw | ConvertFrom-Json
if ($candidate.version -ne $Version -or $candidate.channel -ne 'alpha') { throw 'Wrong Alpha installer identity' }
$full = @($candidate.assets | Where-Object { $_.file.EndsWith('-full-setup.exe') })
if ($full.Count -ne 1) { throw 'Expected one complete Alpha installer' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('openagent-alpha-install-' + [guid]::NewGuid())
$installation = Join-Path $fixture 'installed'
$data = Join-Path $fixture 'data'
New-Item -ItemType Directory -Path $fixture | Out-Null
$oldRoot = $env:OPENAGENT_HOME
$app = $null
$installer = $null
try {
    $installer = Start-Process -FilePath (Join-Path $Artifacts $full[0].file) -ArgumentList @('/S', "/D=$installation") -WindowStyle Hidden -PassThru
    if (-not $installer.WaitForExit(180000) -or $installer.ExitCode -ne 0) { throw 'Alpha installer failed' }
    $executable = Join-Path $installation 'openagent.exe'
    if ((Get-Item -LiteralPath $executable).VersionInfo.ProductVersion -ne $Version) { throw 'Installed shell version mismatch' }
    foreach ($resource in @('bootstrap-release/openagent-distribution.json', 'node-runtime/node.exe', 'terminal-tools/rg.exe', 'terminal-tools/fd.exe', 'terminal-tools/bat.exe', 'terminal-tools/sd.exe')) {
        if (-not (Test-Path -LiteralPath (Join-Path $installation $resource))) { throw "Missing installed resource: $resource" }
    }
    $env:OPENAGENT_HOME = $data
    for ($startup = 0; $startup -lt 2; $startup++) {
        $previousLogs = @(Get-ChildItem -LiteralPath (Join-Path $data 'logs') -Filter 'openagent-host*' -ErrorAction SilentlyContinue)
        $previousConfirmations = @($previousLogs | Select-String -Pattern 'frontend activation confirmed').Count
        $app = Start-Process -FilePath $executable -WindowStyle Hidden -PassThru
        $deadline = [DateTime]::UtcNow.AddSeconds(90)
        $confirmed = $false
        while ([DateTime]::UtcNow -lt $deadline) {
            if ($app.HasExited) { throw 'Installed Alpha exited before frontend confirmation' }
            $selectionFile = Join-Path $data 'resources/frontend/active.json'
            if (Test-Path -LiteralPath $selectionFile) {
                $selection = Get-Content -LiteralPath $selectionFile -Raw | ConvertFrom-Json
                if ($selection.version -eq $Version -and -not $selection.pending_confirmation) {
                    $logs = @(Get-ChildItem -LiteralPath (Join-Path $data 'logs') -Filter 'openagent-host*' -ErrorAction SilentlyContinue)
                    $confirmed = @($logs | Select-String -Pattern 'frontend activation confirmed').Count -gt $previousConfirmations
                    if ($confirmed) { break }
                }
            }
            Start-Sleep -Milliseconds 250
        }
        if (-not $confirmed) { throw 'Installed Alpha frontend did not confirm startup' }
        # Closing the main window intentionally hides to tray. Kill only this fixture's
        # process tree, then prove the confirmed resource selection survives restart.
        & taskkill /PID $app.Id /T /F | Out-Null
        if (-not $app.WaitForExit(30000)) { throw 'Installed Alpha fixture did not stop' }
        $app = $null
    }
    Write-Output 'Complete installed Alpha startup and restart passed.'
} finally {
    if ($installer -and -not $installer.HasExited) {
        & taskkill /PID $installer.Id /T /F | Out-Null
    }
    if ($app -and -not $app.HasExited) {
        & taskkill /PID $app.Id /T /F | Out-Null
    }
    $env:OPENAGENT_HOME = $oldRoot
    # Retain this task-owned fixture for local diagnostics. CI never uploads its data/logs.
}
