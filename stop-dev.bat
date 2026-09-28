@echo off
REM Stops the Fleet Maintenance dev servers started by start-dev.bat (they run
REM hidden, so there's no window to close - this is how you stop them).

powershell -NoProfile -Command "$stopped = 0; Get-NetTCPConnection -LocalPort 8011,5174 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; $stopped++ }; if ($stopped -gt 0) { Write-Host 'Fleet Maintenance dev servers stopped.' } else { Write-Host 'No Fleet Maintenance dev servers were running.' }"

pause
