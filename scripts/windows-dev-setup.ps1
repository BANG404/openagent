[CmdletBinding(SupportsShouldProcess)]
param(
    [switch] $ApplyDefenderExclusions
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$paths = @(
    (Join-Path $repoRoot "target"),
    (Join-Path $repoRoot "sdk\target"),
    (Join-Path $env:USERPROFILE ".cargo\registry"),
    (Join-Path $env:USERPROFILE ".cargo\git")
) | Select-Object -Unique

Write-Host "OpenAgent Windows development paths:"
$paths | ForEach-Object { Write-Host "  $_" }

$rustLld = Get-Command rust-lld -ErrorAction SilentlyContinue
if ($null -eq $rustLld) {
    Write-Warning "rust-lld is not on PATH. The repository config requires a Rust toolchain that provides rust-lld."
} else {
    Write-Host "rust-lld: $($rustLld.Source)"
}

if (-not $ApplyDefenderExclusions) {
    Write-Host "Preview only. Re-run with -ApplyDefenderExclusions from an elevated PowerShell to apply exclusions."
    exit 0
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$adminRole = [Security.Principal.WindowsBuiltInRole]::Administrator
if (-not $principal.IsInRole($adminRole)) {
    throw "Applying Defender exclusions requires an elevated PowerShell window."
}

foreach ($path in $paths) {
    if ($PSCmdlet.ShouldProcess($path, "Add Windows Defender exclusion")) {
        Add-MpPreference -ExclusionPath $path
    }
}

Write-Host "Defender exclusions applied. Remove them later with Remove-MpPreference -ExclusionPath <path>."
