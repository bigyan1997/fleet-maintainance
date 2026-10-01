@echo off
rem Fleet Maintenance server (port 8002 - NPD Tracker v2 has 8001 on the same
rem PC). Started at login by the Startup-folder shortcut and, if it ever stops
rem responding, by keep-alive.ps1. If the server stops for any reason it is
rem started again after 5 seconds.
cd /d "%~dp0backend"
call .venv\Scripts\activate.bat
:loop
rem Another copy already serving? Then this one isn't needed.
netstat -ano -p tcp | findstr "LISTENING" | findstr /c:"0.0.0.0:8002 " >nul && (
    echo Fleet Maintenance is already running on port 8002 - nothing to do.
    exit /b 0
)
echo %date% %time% Starting Fleet Maintenance on port 8002...
waitress-serve --listen=0.0.0.0:8002 fleet_maintenance.wsgi:application
echo %date% %time% Server stopped - restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
