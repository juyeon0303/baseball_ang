# 동업자에게 보낼 주소 만들기 (Render)

**서버는 1개**, 보여주는 화면은 **2개**입니다.

| 제품 | 주소 | 뭐냐면 |
|------|------|--------|
| **플레이볼** (앱) | `https://OOO.onrender.com/` | 실시간 경기·중계·가가존 |
| **야구주식** (웹) | `https://OOO.onrender.com/stock/` | 베팅·시세·밈 |

`OOO` = Render가 만들어 주는 이름 (예: `playball-kbo`)

> 플레이볼은 **앱스토어 APK가 아니라 웹 앱**이에요.  
> 동업자는 링크만 열면 폰·PC 브라우저에서 바로 씁니다. (나중에 Expo 앱은 별도)

---

## 1단계 — GitHub에 올리기

```powershell
cd "C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend"
git add .
git commit -m "deploy: playball + stock"
git push origin main
```

---

## 2단계 — Render에서 서비스 만들기

1. https://dashboard.render.com 로그인
2. **New +** → **Web Service**
3. GitHub 레포 `baseball_ang` 연결
4. 아래처럼 입력:

| 항목 | 값 |
|------|-----|
| Name | `playball-kbo` (아무 이름) |
| Build Command | `npm ci && npm run build:render` |
| Start Command | `npm run start:prod` |
| Health Check | `/amm/health` |

5. **Environment Variables** 추가:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `STORAGE_MODE` | `postgres` |
| `DATABASE_URL` | Supabase에서 복사한 URI |
| `DB_SYNCHRONIZE` | `true` |
| `PUBLIC_URL` | 배포 후 나온 URL (예: `https://playball-kbo.onrender.com`) |

6. **Create Web Service** → 5~10분 대기

---

## 3단계 — 동업자에게 보낼 메시지 (복붙)

```
플레이볼 (실시간 야구 앱)
https://playball-kbo.onrender.com/

야구주식 (베팅 게임)
https://playball-kbo.onrender.com/stock/

※ 첫 접속 30초 정도 느릴 수 있음 (무료 서버 슬립)
※ 가상 포인트 게임, 실제 돈 아님
```

URL은 Render 대시보드 **실제 주소**로 바꿔서 보내세요.

---

## 4단계 — 잘 됐는지 확인

- `https://OOO.onrender.com/` → 플레이볼 (다크 화면, 하단 탭)
- `https://OOO.onrender.com/stock/` → 야구주식 (밝은 화면, 베팅)
- `https://OOO.onrender.com/amm/health` → `"connected": true`

---

## 자주 묻는 것

**Q. 플레이볼은 앱인데 왜 링크?**  
A. 지금은 **모바일 웹 앱(PWA 스타일)**. 링크 열면 앱처럼 씀. 스토어 앱은 `app/` 폴더에서 나중에.

**Q. .env는?**  
A. Render **Environment**에 넣는 것 = 클라우드용 .env. 로컬 `.env` 파일은 Render에 안 올라감.

**Q. 무료 한계?**  
A. 15분 안 쓰면 sleep → 첫 접속 느림. DB는 Supabase 무료 연동 권장.
