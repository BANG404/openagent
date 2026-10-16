param(
    [Parameter(Mandatory = $true)][ValidateSet('Check', 'Install', 'BlockNetwork', 'UnblockNetwork', 'Stop', 'Uninstall')][string]$Action
)
$ErrorActionPreference = 'Stop'
switch ($Action) {
    'Check' {
        if (-not [Environment]::UserInteractive -or (Get-Process -Id $PID).SessionId -eq 0) { throw 'A real interactive Windows desktop is required; Session 0 cannot qualify this test.' }
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        if (-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator rights are required for task-scoped offline Firewall rules.' }
    }
    'Install' {
        $installer = Start-Process -FilePath $env:ACCEPTANCE_INSTALLER -ArgumentList @('/S', ('/D=' + $env:ACCEPTANCE_INSTALLATION)) -WindowStyle Hidden -PassThru
        if (-not $installer.WaitForExit(240000)) { Stop-Process -Id $installer.Id -Force; throw 'Installer timed out' }
        if ($installer.ExitCode -ne 0) { throw "Installer failed ($($installer.ExitCode))" }
    }
    'BlockNetwork' {
        # Leave loopback reachable for the deterministic model service.
        $addresses = @('0.0.0.0-126.255.255.255', '128.0.0.0-255.255.255.255', '::/0')
        foreach ($program in ($env:ACCEPTANCE_PROGRAMS | ConvertFrom-Json)) {
            New-NetFirewallRule -DisplayName $env:ACCEPTANCE_FIREWALL_GROUP -Group $env:ACCEPTANCE_FIREWALL_GROUP -Direction Outbound -Action Block -Program $program -RemoteAddress $addresses -Profile Any | Out-Null
        }
    }
    'UnblockNetwork' {
        Get-NetFirewallRule -Group $env:ACCEPTANCE_FIREWALL_GROUP -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    }
    'Stop' {
        $process = Get-Process -Id ([int]$env:ACCEPTANCE_PID) -ErrorAction SilentlyContinue
        if ($process) { & taskkill /PID $process.Id /T /F | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Failed to stop acceptance process tree' } }
    }
    'Uninstall' {
        $uninstaller = Join-Path $env:ACCEPTANCE_INSTALLATION 'uninstall.exe'
        if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'Installed uninstaller is missing' }
        $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru
        if (-not $process.WaitForExit(120000) -or $process.ExitCode -ne 0) { throw 'Uninstaller failed' }
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        while (Test-Path -LiteralPath (Join-Path $env:ACCEPTANCE_INSTALLATION 'openagent.exe')) {
            if ([DateTime]::UtcNow -ge $deadline) { throw 'Uninstaller retained the application executable' }
            Start-Sleep -Milliseconds 200
        }
    }
}
