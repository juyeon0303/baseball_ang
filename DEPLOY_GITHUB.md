# GitHub → Render 배포 (API + 웹 한 번에)

이제 **웹사이트가 API 서버에 포함**됩니다. 배포 URL 하나만 공유하면 됩니다.

## 1. 로컬에서 배포 전 확인

```powershell
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend
npm run build
npm run start:prod
```

브라우저 **http://localhost:3000** — 가이드·베팅·경기가 보이면 OK.

## 2. GitHub push

```powershell
git add .
git commit -m "production build: api + web"
git push origin main
```

레포: https://github.com/juyeon0303/baseball_ang

## 3. Render Web Service

| 항목 | 값 |
|------|-----|
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start:prod` |
| Health Check Path | `/amm/hub` |

배포 완료 URL 예: `https://yagu-jusik.onrender.com`

## 4. (권장) 환경 변수

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PUBLIC_URL` | `https://your-app.onrender.com` |

### 데이터 유지하려면 (선택)

| Key | Value |
|-----|-------|
| `STORAGE_MODE` | `postgres` |
| `DATABASE_URL` | Supabase URI |
| `DB_SYNCHRONIZE` | `true` |

## 5. 로컬 개발은 그대로 2터미널

- API: `npm run start:dev` (:3000)
- 웹 핫리로드: `cd web && npm run dev` (:5173)

자세한 launch 한계·남은 일: [LAUNCH.md](./LAUNCH.md)
