# 로컬 개발 (Windows)

## 프로젝트 3갈래 (헷갈리지 말 것)

| 폴더 | 역할 | 포트 |
|------|------|------|
| **루트** `baseball-backend` | API만 (NestJS) | **3000** |
| **`web/`** | 웹사이트 UI | **5173** |
| **`app/`** | 모바일 앱 (아직 없음) | — |

자세히: [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)

## 중간체크 — 이렇게 하세요

```bat
REM 1) API
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend
npm run start:dev

REM 2) 웹 (새 터미널)
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend\web
npm install
npm run dev
```

**개발 UI:** http://localhost:5173 (`web` Vite)

**배포 미리보기:** `npm run preview:prod` → http://localhost:3000 (API+웹 통합)

## ERR_CONNECTION_REFUSED

- **5173** 거부 → `web` 폴더에서 `npm run dev` 안 켠 상태
- **3000** 거부 → 루트에서 `npm run start:dev` 안 켠 상태
- 웹만 켜고 API 안 켜면 상단에 **「API 미연결」** 빨간 표시

## 루트에서 서버만

```bat
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend
npm run start:dev
```

또는 `start-dev.bat` (API 전용)

## 포트 충돌 (EADDRINUSE)

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

5173도 동일하게 `LocalPort 5173` 확인.
