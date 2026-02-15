# cleanup-terminals.ps1
# Kills stale/orphaned PowerShell terminal sessions spawned by VS Code agents.
# Usage: .\scripts\cleanup-terminals.ps1 [-MaxAge 120] [-DryRun]
# TODO: DOC - document as part of agent session workflow

param(
    [int]$MaxAge = 120,   # minutes - kill processes older than this
    [switch]$DryRun       # preview only, don't actually kill
)

$threshold = (Get-Date).AddMinutes(-$MaxAge)
$stale = Get-Process -Name powershell, pwsh -ErrorAction SilentlyContinue |
    Where-Object {
        $_.StartTime -and $_.StartTime -lt $threshold -and
        $_.MainWindowTitle -eq ''  # headless/no-window = likely agent-spawned
    }

if (-not $stale) {
    Write-Host "No stale terminal sessions found (older than $MaxAge min)."
    return
}

Write-Host "Found $($stale.Count) stale terminal session(s):"
$stale | Format-Table Id, StartTime, CPU, @{N='CmdLine';E={$_.Path}} -AutoSize

if ($DryRun) {
    Write-Host "[DRY RUN] Would kill $($stale.Count) process(es)."
} else {
    $stale | Stop-Process -Force
    Write-Host "Killed $($stale.Count) stale terminal session(s)."
}
