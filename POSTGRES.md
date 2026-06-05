# Postgres 영속화 가이드

체결·포인트·랭킹·가가존 메시지가 **재시작 후에도 유지**됩니다.

## 로컬 (Docker, 권장)

```powershell
cd baseball-backend

# 1) Postgres 컨테이너
docker compose up -d

# 2) .env (또는 .env.example 복사)
# STORAGE_MODE=postgres
# DATABASE_URL=postgresql://yagu:yagu@localhost:5432/yagu_jusik
# DATABASE_SSL=false
# DB_SYNCHRONIZE=true

# 3) API
npm run start:dev
```

확인:

```
GET http://localhost:3000/amm/health
```

`storageMode: "postgres"`, `database.connected: true` 이면 성공.

베팅 테스트:

1. `POST /amm/buy` 로 매수
2. API 재시작
3. `GET /amm/portfolio/닉네임` → 포지션·포인트 유지

## Supabase (배포)

[SUPABASE.md](./SUPABASE.md) 참고.

Render Environment:

| Key | Value |
|-----|--------|
| `STORAGE_MODE` | `postgres` |
| `DATABASE_URL` | Supabase URI |
| `DB_SYNCHRONIZE` | `true` (MVP) |

## DB에 저장되는 것

| 테이블 | 내용 |
|--------|------|
| `instruments` | 종목·시세·오라클 |
| `users` / `positions` | 닉네임·포인트·보유 |
| `trades` | 체결 내역 (최대 300건 유지) |
| `user_week_stats` | 주간 랭킹 |
| `price_snapshots` | 시세 차트 |
| `community_messages` | 가가존 피드 (최대 120건) |

**아직 메모리만:** 점수판 스냅샷, 접속자 수 (재시작 시 KBO API에서 다시 가져옴)

## npm 스크립트

```bat
npm run db:up      REM docker compose up -d
npm run db:down    REM docker compose down
npm run db:logs    REM postgres 로그
```

## 운영 전 권장

- `DB_SYNCHRONIZE=false` + TypeORM migration 도입
- Render Postgres 또는 Supabase 백업 설정
