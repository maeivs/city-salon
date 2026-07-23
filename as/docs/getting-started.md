# 시작하기

## 1. 설치

```bash
npm create entity-app-server@latest my-app
cd my-app
```

설치 후 폴더 구조:

```
my-app/
  system.js       — 서버 코어 번들 (수정 불가)
  system-api.js   — 공개 API 번들
  app/            — 비즈니스 로직 (TypeScript, 자유롭게 수정)
  configs/        — JSON 설정 파일
  scripts/        — 운영 스크립트
  .env            — 환경변수
```

---

## 2. 환경변수 설정

생성 직후 `.env` 파일도 함께 만들어집니다. 그 파일을 열어 필수 값을 입력합니다:

```env
ENTITY_SERVER_URL=https://your-entity-server.com
ENTITY_API_KEY=your-api-key
ENTITY_HMAC_SECRET=change-this-to-32-char-or-longer-hmac-secret
JWT_SECRET=change-this-to-same-32-char-or-longer-jwt-secret
NODE_ENV=production
```

`ENTITY_HMAC_SECRET`와 `JWT_SECRET`은 둘 다 32자 이상이어야 합니다.

포트·호스트·로그 설정은 `configs/server.json`에서 합니다. → [설정 파일 가이드](configs.md)

---

## 3. 의존성 설치

```bash
npm install
```

---

## 4. 실행

```bash
# 직접 실행
node system.js

# 또는 스크립트 사용
./scripts/run.sh
```

서버가 `http://0.0.0.0:3000`에서 시작됩니다.

헬스체크 확인:

```bash
curl http://localhost:3000/v1/health
```

---

## 5. 엔티티 스키마 동기화

```bash
./scripts/entity.sh
```

앱에서 별도 엔티티 스키마를 사용할 경우 `entities/` 폴더를 만든 뒤 JSON 스키마를 두고 등록합니다.

```text
my-app/
  entities/
    order.json
    payment.json
```

---

## 6. 다음 단계

- [커스터마이징 가이드](README.md) — 라우트·훅·플러그인 추가 방법
- [플러그인 설정](plugins/) — 결제·LLM·알림 설정 방법
- [API 라우트](routes/) — 제공되는 API 엔드포인트 목록
