@echo off
REM Starts Fleet Maintenance (backend + frontend) completely in the background -
REM no console windows stay open. To stop the servers, run stop-dev.bat.

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start-dev-hidden.ps1"
