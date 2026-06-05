@echo off
cd /d "%~dp0"
echo [플레이볼/야구주식] Postgres 컨테이너 시작...
docker compose up -d
if errorlevel 1 (
    echo.
    echo 실패: Docker Desktop이 켜져 있는지 확인하세요.
    pause
    exit /b 1
)
echo.
echo 완료. .env 예시:
echo   STORAGE_MODE=postgres
echo   DATABASE_URL=postgresql://yagu:yagu@localhost:5432/yagu_jusik
echo   DATABASE_SSL=false
echo.
pause
