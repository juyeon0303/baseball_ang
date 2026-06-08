# YASDAQ(야스닥) — 뿌리기(Launch) 가이드

## 지금 바로 뿌릴 수 있나?

**예.** `npm run build` 한 번이면 **API + 웹 UI** 가 한 서버에 묶입니다.  
배포 URL 하나만 열면 사이트가 나옵니다.

```bat
cd baseball-backend
npm run build
npm run start:prod
```

브라우저: **http://localhost:3000** (5173 아님)

---

## Render에 올리기 (권장)

1. GitHub `baseball_ang` 에 push
2. [Render](https://dashboard.render.com) → New → Web Service → 레포 연결
3. 설정:

| 항목 | 값 |
|------|-----|
| Build | `npm ci && npm run build` |
| Start | `npm run start:prod` |
| Health | `/amm/hub` |

4. 배포 URL 예: `https://yagu-jusik.onrender.com` → **이 주소를 그대로 공유**

`render.yaml` Blueprint로도 동일 설정 가능.

---

## 로컬 개발 vs 배포

| | 개발 | 배포(프로덕션) |
|--|------|----------------|
| API | `npm run start:dev` (:3000) | `start:prod` |
| 웹 UI | `cd web && npm run dev` (:5173) | **같은 :3000** 에 포함 |
| 빌드 | 필요 없음 | `npm run build` 필수 |

---

## ✅ 뿌리기에 포함된 것

- [x] 웹 UI (가이드, 베팅, 밈, 점수판, 10구단)
- [x] API + WebSocket (실시간 시세·경기)
- [x] KBO/MLB 일일 크롤링, 밈 오라클, 점수판 폴링
- [x] 프로덕션 빌드 (web → `web/dist` → 서버가 `/` 에 서빙)
- [x] Docker / Render 설정
- [x] OG·메타·파비콘 기본
- [x] 서버 다운 시 에러 안내

---

## ⚠️ 뿌린 뒤에도 남는 것 (알아두면 좋음)

### 반드시 알릴 것 (MVP 한계)

| 항목 | 상태 | 설명 |
|------|------|------|
| **데이터 영속화** | `STORAGE_MODE=postgres` 권장 | [POSTGRES.md](./POSTGRES.md) — 로컬 Docker 또는 Supabase. memory는 개발용 |
| **Free tier 슬립** | Render 무료 | 15분 미접속 시 sleep → 첫 접속 30~60초 느림 |
| **가상 게임** | — | 실제 돈·증권 아님 (가이드에 명시) |

### 있으면 더 좋음 (다음 스프린트)

| 항목 | 우선순위 | 설명 |
|------|----------|------|
| **커스텀 도메인** | 중 | `yagu.jusik.kr` 등 + SSL |
| **Postgres 영속화** | 높음 | 유저·체결·랭킹 유지 |
| **문자중계 풀텍스트** | 중 | 지금은 스코어·타자 변화 v0 |
| **마이팀 홈** | 중 | 내 구단 고정 피드 |
| **모바일 앱** | 별도 | `app/` Expo — 웹과 분리 |
| **로그인/계정** | 중 | 지금은 닉네임만 |
| **약관·개인정보 페이지** | 배포 전 권장 | 서비스 공개 시 |
| **에러 모니터링** | 낮음 | Sentry 등 |
| **부하/캐시** | 낮음 | 트래픽 늘면 |

### 루타 대비 차별점 (이미 있는 것)

- 경기 LIVE → 종목·시세 연동
- 커뮤 밈 베팅 (김서현 제구 등)
- 가벼운 UX + 「된다/안 된다」 톤

---

## 체크리스트 (배포 직전)

- [ ] `npm run build` 로컬 성공
- [ ] `npm run start:prod` 후 http://localhost:3000 에서 베팅·경기·밈 동작
- [ ] Render Health `/amm/hub` 200
- [ ] (선택) `PUBLIC_URL` 환경변수에 Render URL 설정
- [ ] (선택) Supabase `DATABASE_URL` + `STORAGE_MODE=postgres`

---

## 한 줄 요약

**지금도 URL 하나로 뿌릴 수 있음.**  
다만 **무료 호스팅 sleep·메모리 초기화·법적 문구·앱** 은 다음 단계입니다.
