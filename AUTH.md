# 계정·로그인 매뉴얼 (1번: 디바이스 계정)

> **PIN·비밀번호 없음.** 브라우저(기기)마다 서버가 계정 + 토큰을 자동 발급합니다.  
> **2번(PIN/JWT 로그인)** 은 아직 구현하지 않았습니다.

---

## 한 줄 요약

| 예전 (닉 = 지갑) | 지금 (1번) |
|------------------|------------|
| 아무 닉네임 입력 → 그 문자열이 지갑 ID | 서버가 **UUID 계정** + **토큰** 발급 |
| 같은 닉 쓰면 같은 지갑 (가로채기 가능) | 토큰 없으면 베팅·내 지갑 조회 **불가** |
| 닉만 바꾸면 “다른 사람”처럼 보임 | **표시 이름**만 바꿈 → 지갑·랭킹은 동일 |

---

## 사용자 입장 — 뭘 하면 되나?

1. **YASDAQ(야스닥)** (`/stock/` 또는 로컬 `:5173`) 또는 **플레이볼** (`/` 또는 `:5174`) 접속
2. 로딩이 끝나면 **자동으로 계정 생성** (버튼 없음)
3. 지갑 패널 **「표시 이름」** 입력 → 입력칸 **밖을 클릭**하면 저장  
   - 랭킹·체결 피드·채팅에 보이는 이름만 바뀜  
   - `guest` 는 사용 불가
4. **된다 / 안 된다** 베팅 → 본인 계정으로만 체결됨

표시 이름을 안 바꿔도 `팬xxxx` 같은 **임시 이름**으로 시작합니다.

---

## 헷갈리기 쉬운 것

### 로컬 개발 (:5173 vs :5174)

| 주소 | 제품 | localStorage |
|------|------|--------------|
| `localhost:5173` | YASDAQ(야스닥) | **포트별로 분리** |
| `localhost:5174` | 플레이볼 | **포트별로 분리** |

→ 같은 PC라도 **지갑·계정이 둘로 나뉩니다.** (정상 동작)

### 프로덕션 (같은 도메인)

| 경로 | 제품 |
|------|------|
| `https://example.com/` | 플레이볼 |
| `https://example.com/stock/` | YASDAQ(야스닥) |

→ **origin이 같으면** `localStorage` 공유 → **계정·지갑 공유**

### 브라우저·시크릿 모드

- Chrome / Edge / Safari **각각** 별도 계정
- **시크릿 창** = 매번 새 계정 (새 10만 P)

### 서버 재시작 (개발 `STORAGE_MODE=memory`)

- 세션·지갑이 **RAM에만** 있으면 API 재시작 시 **초기화**될 수 있음
- 브라우저에 `deviceId`·`token`은 남아 있어도, 서버가 기억을 잃으면 **새 계정**처럼 보일 수 있음
- **Postgres 영속화** 후에는 계정·지갑 유지 (별도 작업)

---

## 브라우저에 저장되는 값 (localStorage)

| 키 | 내용 |
|----|------|
| `yamgu-device-id` | 이 브라우저 고유 ID (최초 1회 생성) |
| `yamgu-session-token` | API 인증 토큰 (**비밀번호처럼 취급**) |
| `yamgu-session-account` | 내부 계정 UUID (지갑·랭킹 키) |
| `yamgu-display-name` | 마지막 표시 이름 (캐시) |

예전 `yamgu-stock-nick` 이 있으면, **첫 자동 가입 시** 표시 이름으로 한 번 옮겨 줍니다.

---

## API (개발·연동용)

Base: `/amm/auth`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/bootstrap` | body: `{ "deviceId": "..." }` → `{ accountId, token, displayName }` + 지갑 생성 |
| `GET` | `/me` | Header: `Authorization: Bearer <token>` |
| `PATCH` | `/profile` | body: `{ "displayName": "..." }` + Bearer |

### Bearer가 필요한 API (YASDAQ)

- `POST /amm/buy`, `POST /amm/sell`
- `GET /amm/hub` (내 순위·지갑)
- `GET /amm/portfolio/:accountId` (본인 ID만)

### 토큰이 필요한 WebSocket (플레이볼 채팅)

- `sendChat`, `sendReaction` → body에 `token` 필드

---

## 구현 파일

| 역할 | 경로 |
|------|------|
| 세션 저장·검증 | `src/auth/session-auth.service.ts` |
| HTTP 라우트 | `src/auth/auth.controller.ts` |
| 베팅 보호 | `src/amm.controller.ts` |
| YASDAQ UI | `web/index.html` → `ensureSession()` |
| 플레이볼 UI | `app/index.html` → `ensureSession()` |

---

## 아직 없는 것 (2번 후보)

- PIN 설정 / PIN 로그인
- 다른 기기에서 같은 계정 찾기
- 이메일·OAuth
- 토큰 만료·갱신 정책 (지금은 서버 재시작 전까지 유효)
