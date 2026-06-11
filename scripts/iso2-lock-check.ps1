$lockPath = '/tmp/iso2_cycle.lock'
$lockDir = Split-Path $lockPath -Parent
if (-not (Test-Path $lockDir)) {
  New-Item -ItemType Directory -Path $lockDir -Force | Out-Null
}
if (Test-Path $lockPath) {
  $age = (Get-Date) - (Get-Item $lockPath).LastWriteTime
  if ($age.TotalMinutes -lt 5) {
    Write-Output 'RECENT_LOCK_FOUND_TERMINATING_THIS_FIRE'
    exit 0
  } else {
    Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
  }
}
New-Item -ItemType File -Path $lockPath -Force | Out-Null
Write-Output 'LOCK_ACQUIRED_PROCEEDING'