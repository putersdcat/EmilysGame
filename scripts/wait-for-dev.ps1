$ports = @(5173, 4173, 3000, 8080, 5000, 4174)
for($i = 0; $i -lt 45; $i++){
  foreach($p in $ports){
    if (Test-NetConnection -ComputerName localhost -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue) {
      Write-Output ("DEV_READY_PORT:" + $p)
      exit 0
    }
  }
  if ($i % 5 -eq 0 -and $i -gt 0) { Write-Output ("waiting... " + $i + "s") }
  Start-Sleep -Seconds 1
}
Write-Output "DEV_NOT_READY_TIMEOUT"
exit 1