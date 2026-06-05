@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing web dependencies...
  call npm install
)
echo.
echo [웹] http://localhost:5173
echo [API] http://localhost:3000  ^(별도 터미널에서 backend start:dev 필요^)
echo.
call npm run dev
