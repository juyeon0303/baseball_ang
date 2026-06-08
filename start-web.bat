@echo off
cd /d "%~dp0"
echo [YASDAQ · 야스닥] http://localhost:5173
echo [API 필요] 다른 창에서 npm run start:dev (^:3000^)
echo.
call npm run dev:web
