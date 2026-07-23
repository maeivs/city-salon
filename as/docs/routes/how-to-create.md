# 라우트 추가 가이드

`health`는 `app/routes`에 비즈니스 라우트를 추가할 때의 기준 샘플이다.

기준 파일: `src/app/routes/health/route.ts`

## 라우트 추가 방법

새 도메인도 `health`와 같은 패턴으로 구성한다.

### 1) 폴더 구조

`{domain}`은 새 비즈니스 도메인 이름(예: `orders`, `customers`)이다.

```text
src/app/routes/{domain}/
├── config.json    — 라우트 활성화 여부 (enabled: true/false)
├── route.ts
├── handlers.ts
├── service.ts
├── schema.ts
└── types/
    ├── index.ts       — 타입 re-export 배럴
    ├── {model}.ts     — 엔티티/모델별 타입
    ├── params.ts      — 요청 파라미터 타입
    ├── query.ts       — 쿼리스트링 타입
    └── defaults.ts    — 타입별 기본값 객체
```

### 2) 파일 역할

- `config.json`: 라우트 활성화 여부를 제어한다. `enabled: false`이면 로그 없이 스킵된다.
- `route.ts`: URL과 핸들러를 연결하는 라우트 테이블만 작성한다.
- `handlers.ts`: 요청/응답 처리, 입력 파싱, 서비스 호출, 에러 응답을 담당한다.
- `service.ts`: 실제 비즈니스 로직(entityServer 호출, DB 쿼리, 계산, 상태 처리)을 담당한다.
- `schema.ts`: zod 스키마로 요청/응답을 런타임 검증한다.
- `types/`: TypeScript 타입 정의. `index.ts`에서 일괄 re-export한다.

### 3) `config.json` 규칙

`config.json`이 없으면 항상 등록된다. `enabled: false`로 설정하면 관련 로그를 내지 않고 스킵된다.

```json
{ "enabled": true }
```

샘플 라우트(`routes/example-db`, `routes/example-es`):

```json
{ "enabled": false }
```

### 4) `route.ts` 작성 원칙 (health와 동일)

- `import * as h from "./handlers.ts"` 형태로 핸들러를 가져온다.
- `app.get`, `app.post`, `app.patch`, `app.delete`로 메서드와 경로만 매핑한다.
- `route.ts`에 비즈니스 로직을 넣지 않는다.

예시:

```ts
import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

export default async function domainRoutes(app: FastifyInstance) {
    app.get("/", h.list);
    app.post("/", h.create);
    app.get("/:id", h.getById);
}
```

### 5) 등록 경로 규칙

- `src/app/routes/{domain}/route.ts`로 두면 게이트웨이 경로는 기본적으로 `/v1/{domain}/*`로 등록된다.
- 예: `src/app/routes/orders/route.ts` → `/v1/orders/*`

### 6) Entity Server 패스스루 오버라이드

**`plugins/` 또는 `routes/`에 정의한 라우트는 Entity Server 패스스루보다 항상 먼저 처리된다.**

앱 서버 라우트 로딩 순서 (`system/app.ts`):

```
1. loadExtensionPlugins()        — plugins/*/index.ts (Fastify 플러그인 + 라우트 등록)
2. registerEntityInterceptor()   — 엔티티 CRUD 훅 인터셉터
3. registerRoutes()              — routes/*/route.ts (비즈니스 라우트)
4. registerProxyRoutes()         — /v1/{prefix}/* → Entity Server 패스스루 (위에서 처리되지 않은 경로만)
```

따라서 Entity Server가 원래 처리하던 경로(예: `/v1/smtp/send`)라도
`plugins/smtp/routes.ts`나 `routes/smtp/route.ts`에 동일 경로를 등록하면
앱 서버가 직접 처리하고 Entity Server로는 전달되지 않는다.

이를 활용하면:

- 로컬 템플릿 렌더링 후 Go 서버로 결과를 전달하거나
- Entity Server API를 호출하기 전에 앱 서버 로직(인증, 가공, 캐시 등)을 삽입할 수 있다.

### 6) 문서 업데이트 규칙

새 도메인 라우트를 만들면 `docs/routes/`에 라우트 문서를 추가하고, 모든 라우트 문서의 `관련 문서`에도 링크를 추가한다.

## 라우트 목록

| Method | Path                                          | 설명             |
| ------ | --------------------------------------------- | ---------------- |
| GET    | [/v1/health/](#get-v1apihealth)           | 서비스 상태 확인 |
| GET    | [/v1/health/ready](#get-v1apihealthready) | 준비 상태 확인   |

## 라우트 상세

### GET /v1/health/

<a id="get-v1apihealth"></a>

- 설명: 게이트웨이 프로세스의 기본 상태를 점검한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/health/"
```

### GET /v1/health/ready

<a id="get-v1apihealthready"></a>

- 설명: 외부 의존성 포함 서비스 준비 상태(ready)를 점검한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/health/ready"
```

## 관련 문서

- [Account Routes](./account-routes.md)
- [Alimtalk Routes](./alimtalk-routes.md)
- [Email Verification](./email-verification.md)
- [Friendtalk Routes](./friendtalk-routes.md)
- [Holidays Routes](./holidays-routes.md)
- [Identity Routes](./identity-routes.md)
- [LLM Routes](./llm-routes.md)
- [OCR Routes](./ocr-routes.md)
- [Password Reset](./password-reset.md)
- [PG Routes](./pg-routes.md)
- [SMS Routes](./sms-routes.md)
- [SMTP Routes](./smtp-routes.md)
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
