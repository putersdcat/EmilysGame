# iso2-lock-check-burst.ps1
# Exact lock check logic per AUTONOMOUS_LOOP.md for non-interject speed
# At VERY START of each scheduler fire / autonomous burst
if (Test-Path /tmp/iso2_cycle.lock) {
  $age = (Get-Item /tmp/iso2_cycle.lock).LastWriteTime
  if (((Get-Date) - $age).TotalMinutes -lt 10) {
    Write-Output 'EXISTING SESSION RUNNING (recent lock), TERMINATING this fire to avoid interject. Scheduler timer will reset naturally on next interval.'
    exit 0
  } else {
    Remove-Item /tmp/iso2_cycle.lock -Force
    Write-Output 'Stale lock cleaned'
  }
} else {
  Write-Output 'No lock, proceeding'
}