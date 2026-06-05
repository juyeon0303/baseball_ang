# 프로젝트 구조 — 포트 분리

| 포트 | 제품 | 폴더 | 내용 |
|------|------|------|------|
| **3000** | **실시간 야구 앱** (Ruta++) | `app/` | 점수·타석·가가존. **주식 없음** |
| **5173** | **야구주식 웹** | `web/` | 베팅·시세·밈. **커뮤 풀기능 없음** |
| **5174** | 앱 개발용 (핫리로드) | `app/` | API는 3000에 프록시 |

## 로컬 실행 (3터미널)

```bat
REM 1) API + (빌드 시) 앱 UI at :3000
cd baseball-backend
npm run start:dev

REM 2) 앱 UI 핫리로드 (개발 시 권장)
cd app
npm install
npm run dev
→ http://localhost:5174

REM 3) 야구주식 웹
cd web
npm run dev
→ http://localhost:5173
```

`:3000` 루트에 앱이 보이려면 `npm run build:app` 후 API 재시작.  
개발 중에는 **5174(앱)** 와 **5173(주식)** 만 쓰면 됩니다.

## 프로덕션 (`npm run build`)

- API + **app/dist** → `:3000/` (플레이볼 앱)
- **web/dist** → 별도 호스팅 또는 `cd web && npm run preview`

## API (공통)

- `/amm/games/*` — 앱
- `/amm/community/*` — 앱
- `/amm/hub`, buy/sell — 야구주식 웹만
