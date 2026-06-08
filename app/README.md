# 플레이볼 — Ruta++ 실시간 야구 앱

**YASDAQ(`web/`)과 별개.** 주식·베팅 UI 없음.

## Ruta(KBO STATS) 대비 — 상위호환 목표

| Ruta 핵심 | 플레이볼 |
|-----------|----------|
| 경기 **프리뷰 / 라이브 / 리뷰** 탭 | ✅ 홈·중계 탭 공통 phase 전환 |
| 점수판 · 이닝 · 타자 vs 투수 | ✅ KBO GameCenter 연동 |
| B/S/O · 주자 다이아몬드 | ✅ 라이브 탭 |
| 승부 예측 | ✅ 경기 전 원정/홈 픽 + 팬 집계 |
| 승리 기여(WPA) | ✅ 실시간 승률 바 + 그래프 |
| 마이팀 · 일정 | ✅ 내 구단 일정 + 홈 우선 노출 |
| 순위 (참고) | ✅ 앱에 쌓인 종료 경기 기준 W-L |
| 팬 커뮤 | ✅ 가가존 채팅 + 민심 투표 |
| 경기 후 평점 | ✅ 종료 후 선수별 팬 평점 |

**의도적으로 넣지 않음:** 주식/베팅, Ruta식 무거운 세이버메트릭 메뉴, YASDAQ cross-sell 이상의 금융 UI.

## 탭

| 탭 | 내용 |
|----|------|
| **홈** | 지금 보는 경기 · phase(프리뷰/라이브/리뷰) · WPA · 라이브 NOW |
| **경기** | 전체 일정 · LIVE/예정/종료 필터 |
| **중계** | WPA 차트 · 민심 · 타임라인 · 채팅 |
| **내 구단** | 10구단 선택 · 일정 · 순위(참고) |

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

YASDAQ(야스닥)은 **http://localhost:5173** (`cd web && npm run dev`)
