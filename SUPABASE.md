# Supabase 연결 가이드 (야구주식 백엔드)

Supabase = **Postgres DB 호스팅**. Auth/Storage는 안 써도 됨. NestJS는 `DATABASE_URL`만 연결.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 가입 (Google 가능)
2. **New project**
3. 이름·비밀번호(DB password) 설정 → **비밀번호 꼭 메모**

## 2. 연결 문자열 복사

1. 프로젝트 → **Project Settings** (톱니바퀴)
2. **Database**
3. **Connection string** → **URI** 탭
4. `[YOUR-PASSWORD]`를 1번에서 정한 비밀번호로 바꿔서 복사

예시 형태:

```
postgresql://postgres.xxxxx:비밀번호@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
```

Render에서 연결 안 되면 **Session mode** URI 또는 **Direct connection** (`db.xxx.supabase.co:5432`) 도 시도.

## 3. 로컬에서 테스트

프로젝트 루트에 `.env` 파일 생성:

```env
STORAGE_MODE=postgres
DATABASE_URL=여기에_붙여넣기
DB_SYNCHRONIZE=true
```

```powershell
cd baseball-backend
npm run start:dev
```

Postman: `GET http://localhost:3000/amm/status`  
→ `"storageMode": "postgres"` 확인

## 4. Render(배포 사이트)에 연결

Render 대시보드 → **kbo-stock-mvp** 서비스 → **Environment**

| Key | Value |
|-----|--------|
| `STORAGE_MODE` | `postgres` |
| `DATABASE_URL` | Supabase URI 전체 |
| `DB_SYNCHRONIZE` | `true` |

저장 후 **Manual Deploy** (Docker 이미지는 기존과 동일, env만 추가)

## 5. 동작 확인

- Postman `GET https://본인.onrender.com/amm/status` → `storageMode: postgres`
- `POST /amm/buy` 로 매수 후 서버 재배포해도 `GET /amm/portfolio/닉네임` 에 포지션 남아 있으면 성공

## 주의

- `.env` / 비밀번호는 GitHub에 올리지 말 것
- Supabase 무료: 프로젝트 7일 미사용 시 일시정지 → 대시보드에서 Resume
