@echo off
rem One-time Google sign-in so Fleet keeps issue and damage photos in Google
rem Drive. Needs backend\secrets\drive-oauth-client.json first (the same kind
rem of file NPD Tracker uses). A browser opens: sign in as
rem achievecafeprovisions@gmail.com and click Allow.
cd /d "%~dp0backend"
call .venv\Scripts\activate.bat
python manage.py drive_authorize
pause
