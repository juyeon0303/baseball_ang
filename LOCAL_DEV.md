# 로컬 개발 (Windows)

## ERR_CONNECTION_REFUSED 가 났을 때

브라우저가 `localhost:3000`에 연결하지 못했다는 뜻입니다. **거의 항상 서버가 안 떠 있는 상태**입니다.

### 1) 가장 흔한 원인 — 폴더가 다름

`C:\Users\user` 에서 `npm run start:dev` 를 실행하면 **Missing script: "start:dev"** 가 납니다.  
반드시 **프로젝트 폴더**에서 실행하세요.

```bat
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend
npm run start:dev
```

또는 탐색기에서 `start-dev.bat` 더블클릭.

### 2) 빠른 확인

| 확인 | 명령 |
|------|------|
| 서버 살아 있음? | 브라우저 `http://localhost:3000` 또는 `http://127.0.0.1:3000/amm/hub` |
| 포트 사용 중? | PowerShell: `Get-NetTCPConnection -LocalPort 3000` |
| 이미 다른 프로세스? | `EADDRINUSE` → 이미 3000 사용 중. 브라우저만 열면 됨 |

### 3) 포트가 꽉 찼을 때 (EADDRINUSE)

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend
npm run start:dev
```

## Cursor / 에이전트

채팅에서 서버를 띄울 때는 프로젝트 경로에서 백그라운드로 `npm run start:dev` 를 실행합니다.  
터미널을 닫으면 서버도 내려갈 수 있으니, 오래 쓸 때는 `start-dev.bat` 으로 별도 cmd 창을 켜 두는 편이 안전합니다.
