@echo off
cd /d "%~dp0"
echo [야구주식] 프로젝트 폴더: %CD%
echo [야구주식] 서버 시작 — http://localhost:3000
echo 종료: Ctrl+C
npm run start:dev
