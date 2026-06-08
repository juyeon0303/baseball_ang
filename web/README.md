# YASDAQ · 야스닥 (web/)

**KBO 팬 가상 거래소** 웹 프론트입니다. Ruta식 커뮤 앱(`app/`)과 별개 제품이며, 여기에는 종목·베팅만 둡니다.

## 실행 (2터미널)

**터미널 1 — API**

```bat
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend
npm run start:dev
```

**터미널 2 — 웹**

```bat
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend\web
npm install
npm run dev
```

또는 `web\start-dev.bat` 더블클릭.

## 소개·매뉴얼

- 왼쪽 **「필수만」** 패널 — 30초 안내
- 상세 문서: [GUIDE.md](./GUIDE.md)

## 중간체크

브라우저: **http://localhost:5173**

1. 상단 **「개발 진행 (중간체크)」** — 완료/예정 기능 목록 + API 연결 상태
2. **지금 베팅** — 선수·밈 화제에 베팅하는 UI
3. **밈·화제** — 김서현 제구, 강백호 50홈런 등
4. 경기 카드 · 체결 · 10구단 목록

`localhost:3000` 은 API만 (JSON). UI는 **5173** 만 보세요.

## 배포

YASDAQ 웹은 **:5173 전용** (또는 `web/dist` 를 `/stock/` 정적 호스팅).

```bat
cd web
npm run build
npm run preview
```

`:3000` 은 **실시간 야구 앱** (`app/`) — YASDAQ과 섞이지 않음.

Render: [DEPLOY_GITHUB.md](../DEPLOY_GITHUB.md) · 남은 일: [LAUNCH.md](../LAUNCH.md)
