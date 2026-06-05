# 플레이볼 — Ruta++ 실시간 야구 앱

**야구주식(`web/`)과 별개.** 주식·베팅 UI 없음.

## 기능 (웹 MVP)

| 탭 | 내용 |
|----|------|
| **홈** | 지금 보는 경기, 라이브 NOW, 내 구단 경기 |
| **경기** | 전체 일정 · LIVE/예정/종료 필터 · 경기 선택 |
| **중계** | 타석·득점 타임라인 + 가가존 채팅 |
| **내 구단** | 10구단 응원팀 설정 (localStorage) |

## 포트

| | URL |
|--|-----|
| 프로덕션 / API 통합 | http://localhost:3000 (`npm run build:app` 후) |
| 개발 (핫리로드) | http://localhost:5174 |

## 실행

```bat
REM API 먼저
cd ..
npm run start:dev

REM 앱
cd app
npm install
npm run dev
```

야구주식은 **http://localhost:5173** (`cd web && npm run dev`)
