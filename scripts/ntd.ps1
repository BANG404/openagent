param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Title
)

$todoDir = Join-Path $PSScriptRoot "..\Todo"

$nums = @(
    Get-ChildItem $todoDir -Filter "*.md" |
    Where-Object { $_.BaseName -match '^\d+' } |
    ForEach-Object { [int]($_.BaseName -replace '_.*', '') }
)

$next = if ($nums.Count -gt 0) { ($nums | Measure-Object -Maximum).Maximum + 1 } else { 1 }
$prefix = $Title.Substring(0, [Math]::Min(3, $Title.Length))
$filename = Join-Path $todoDir "${next}_${prefix}.md"

Set-Content -Path $filename -Value "# $Title" -Encoding UTF8
Write-Host "Created: Todo\${next}_${prefix}.md"
