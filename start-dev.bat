@echo off
cd /d "%~dp0"
echo [야구주식] 프로젝트 폴더: %CD%
echo [API] http://localhost:3000  ^(UI 없음^)
echo [웹]  cd web ^&^& npm run dev  →  http://localhost:5173
echo 종료: Ctrl+C
npm run start:dev
