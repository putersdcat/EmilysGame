$port = 5173
Write-Output "Polling for game dev server on port $port (preferred for game + __gameDebug)..."
for($i=0; $i -lt 60; $i++){
  if (Test-NetConnection -ComputerName localhost -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue) {
    Write-Output ("DEV_GAME_READY_PORT:" + $port)
    Write-Output ("URL: http://localhost:" + $port)
    exit 0
  }
  if ($i -gt 0 -and ($i % 5 -eq 0)) { Write-Output ("still waiting for 5173... " + $i + "s") }
  Start-Sleep -Milliseconds 800
}
Write-Output "DEV_GAME_5173_NOT_READY_TIMEOUT"
exit 1