param(
    [Parameter(Mandatory = $true)][int]$RootProcessId,
    [Parameter(Mandatory = $true)][int]$DurationMs,
    [Parameter(Mandatory = $true)][int]$IntervalMs
)
$ErrorActionPreference = 'Stop'
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$rootCreation = $null
do {
    # One process owns sampling. Never start a new PowerShell or CIM query per PID.
    $all = @(Get-CimInstance Win32_Process)
    $root = $all | Where-Object { $_.ProcessId -eq $RootProcessId } | Select-Object -First 1
    if ($null -eq $root) { throw 'Selected root process exited or is unavailable' }
    $creation = $root.CreationDate.ToUniversalTime().ToString('o')
    if ($null -eq $rootCreation) { $rootCreation = $creation }
    if ($creation -ne $rootCreation) { throw 'Selected root PID was reused' }
    $selected = @{}
    $selected[$RootProcessId] = $root
    do {
        $added = $false
        foreach ($entry in $all) {
            if (-not $selected.ContainsKey([int]$entry.ProcessId) -and
                $selected.ContainsKey([int]$entry.ParentProcessId) -and
                $entry.CreationDate -ge $selected[[int]$entry.ParentProcessId].CreationDate) {
                $selected[[int]$entry.ProcessId] = $entry
                $added = $true
            }
        }
    } while ($added)
    $rows = @($selected.Values | ForEach-Object {
        foreach ($counter in @('CreationDate', 'KernelModeTime', 'UserModeTime', 'WorkingSetSize',
                'PrivatePageCount', 'ReadTransferCount', 'WriteTransferCount', 'HandleCount', 'ThreadCount')) {
            if ($null -eq $_.$counter) { throw "Unavailable counter $counter for selected process" }
        }
        @{
            pid = [int]$_.ProcessId
            name = $_.Name
            identity = "$($_.ProcessId):$($_.CreationDate.ToUniversalTime().ToString('o'))"
            cpu_ms = ([double]$_.KernelModeTime + [double]$_.UserModeTime) / 10000
            working_set_bytes = [double]$_.WorkingSetSize
            private_bytes = [double]$_.PrivatePageCount
            read_bytes = [double]$_.ReadTransferCount
            write_bytes = [double]$_.WriteTransferCount
            handles = [int]$_.HandleCount
            threads = [int]$_.ThreadCount
        }
    })
    @{ elapsed_ms = $clock.Elapsed.TotalMilliseconds; processes = $rows } |
        ConvertTo-Json -Depth 4 -Compress
    if ($clock.ElapsedMilliseconds -ge $DurationMs) { break }
    Start-Sleep -Milliseconds $IntervalMs
} while ($true)
