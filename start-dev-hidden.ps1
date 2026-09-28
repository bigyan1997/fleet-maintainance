# Launches the Fleet Maintenance backend and frontend dev servers with no
# visible console windows. Called by start-dev.bat - not meant to be run
# directly.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList @(
    "/c", "cd /d `"$root\backend`" && call .venv\Scripts\activate.bat && python manage.py runserver 127.0.0.1:8011"
)

Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList @(
    "/c", "cd /d `"$root\frontend`" && npm run dev"
)

Start-Sleep -Seconds 5
Start-Process "http://localhost:5174"
