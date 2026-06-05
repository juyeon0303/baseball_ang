# GitHub → Render 자동 배포

## 1. GitHub에 코드 올리기

PowerShell:

```powershell
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend

git init
git add .
git commit -m "야구주식 MVP"

# GitHub에서 New repository (README 없이 빈 레포)
git remote add origin https://github.com/juyeon0303/baseball_ang.git
git branch -M main
git push -u origin main
```

## 2. Render에 Web Service 만들기

1. https://dashboard.render.com
2. **New +** → **Web Service**
3. **Connect a repository** → 새 GitHub 계정 **Authorize** → 레포 선택
4. 설정:

| 항목 | 값 |
|------|-----|
| Name | `kbo-stock-mvp` (원하는 이름) |
| Region | Singapore 등 가까운 곳 |
| Branch | `main` |
| Runtime | **Node** |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start:prod` |
| Instance | Free |

5. **Advanced** → Health Check Path: `/amm/status`
6. **Create Web Service**

첫 배포 끝나면 URL: `https://kbo-stock-mvp.onrender.com` 형태

## 3. (선택) Supabase

**Environment** 탭에서 Add:

- `STORAGE_MODE` = `postgres`
- `DATABASE_URL` = Supabase URI
- `DB_SYNCHRONIZE` = `true`

저장하면 자동 재배포됨.

## 4. 이후 업데이트

코드 수정 후:

```powershell
git add .
git commit -m "설명"
git push
```

→ Render가 **자동으로** 다시 빌드·배포 (Auto-Deploy 켜져 있으면)

## 5. Docker Hub 방식과 차이

| | GitHub + Render | Docker Hub |
|--|-----------------|------------|
| 코드 push | `git push` | `docker push` |
| 배포 | 자동 | Manual Deploy |
| 편함 | ✅ 개발에 유리 | 이미지 직접 관리 |

기존 **Existing Image** 서비스는 끄거나 삭제하고, GitHub Web Service 하나만 쓰는 걸 권장.
