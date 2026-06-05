@echo off
cd /d "%~dp0"
echo [API + 앱UI] http://localhost:3000
echo.
call npm run start:dev
