@echo off
REM Serves Fleet Maintenance (backend + built frontend) on port 8001 for the
REM whole network, same setup as NPD Tracker on 8000. Started at login by the
REM "Fleet Maintenance Server" shortcut in the Windows Startup folder.
REM After frontend changes, run "npm run build" in frontend\ and restart this.
cd /d "%~dp0backend"
call .venv\Scripts\activate.bat
python manage.py collectstatic --noinput >nul
waitress-serve --listen=0.0.0.0:8001 fleet_maintenance.wsgi:application
