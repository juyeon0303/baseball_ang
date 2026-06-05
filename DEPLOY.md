# 친구/동업자와 공유하는 방법

## Google로 가입한 GitHub → Render가 안 붙을 때

Render는 **GitHub 계정 연동**이 필요한데, Google 로그인만 쓰는 GitHub는 권한/앱 연결이 막히는 경우가 많습니다.

### 해결 1 — GitHub에 비밀번호 붙이기 (가장 먼저 시도)

1. https://github.com/settings/security  
2. **Password** → 비밀번호 설정 (Google 가입 계정도 가능)  
3. 이메일 인증 완료  
4. Render → Account Settings → GitHub **Reconnect**

### 해결 2 — Render + Docker Hub (GitHub 연동 없음)

GitHub 없이 배포합니다.

```powershell
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend
docker build -t YOUR_DOCKERHUB_ID/kbo-stock-mvp:latest .
docker login
docker push YOUR_DOCKERHUB_ID/kbo-stock-mvp:latest
```

Render 대시보드 → **New → Web Service → Existing Image**  
→ `docker.io/YOUR_DOCKERHUB_ID/kbo-stock-mvp:latest`  
→ Port `3000`, Start Command 비워두기 (Dockerfile CMD 사용)

### 해결 3 — GitLab 연결

1. GitLab에 프로젝트 push (Google 로그인 GitLab 가능)  
2. Render → New Web Service → **GitLab** 연결 → Dockerfile 자동 빌드

### 해결 4 — Railway / Fly.io (Render 대신)

- **Railway:** https://railway.app → GitHub 연결이 Render보다 잘 되는 편  
- **Fly.io:** CLI만으로 배포 (`fly launch`, GitHub 연동 불필요)

```powershell
# Fly.io 예시 (flyctl 설치 후)
fly launch
fly deploy
```

### 해결 5 — 당장만 공유 (이미 했던 방식)

PC 켜 두고 Cloudflare 터널 — `npm run tunnel:cloudflare`  
→ 나온 `https://xxxx.trycloudflare.com` 주소 공유 (고정 URL 아님)

---

## 방법 A — 지금 당장 (PC 켜 둔 채, 약 1분)

터미널 1:

```powershell
cd C:\Users\user\OneDrive\Desktop\zipcode\baseball-backend
npm run build
npm run start:prod
```

터미널 2:

```powershell
npx cloudflared tunnel --url http://localhost:3000
```

또는:

```powershell
npx localtunnel --port 3000
```

출력된 `https://....` 주소를 카톡/디스코드로내면 됩니다.

- PC를 끄거나 서버를 멈추면 주소가 사라집니다.
- localtunnel은 첫 접속 시 IP 확인 페이지가 나올 수 있습니다.

---

## 방법 B — 고정 주소 (Render 무료, 추천)

1. GitHub에 레포 만들고 이 프로젝트 push
2. https://render.com 가입 → **New → Blueprint** → `render.yaml` 있는 레포 선택
3. 배포 완료 후 `https://kbo-stock-mvp.onrender.com` 형태 URL 발급
4. Render 대시보드 → Environment → `PUBLIC_URL` = 발급된 URL (선택)

무료 플랜은 15분 미사용 시 슬립 → 첫 접속 30초~1분 걸릴 수 있음.

---

## 방법 C — 앱 연동 준비

웹·앱 모두 같은 API 베이스 URL 사용:

- `https://YOUR-DOMAIN/amm/lineup`
- WebSocket: 같은 도메인 (`io()` 기본)

앱(Expo)에서는 `EXPO_PUBLIC_API_URL` 환경변수로 동일 주소 지정.
