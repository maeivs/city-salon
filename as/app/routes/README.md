# app/routes/

사용자 비즈니스 라우트 모음. 서버 시작 시 폴더명 알파벳 순으로 자동 로드됩니다.

## 구조

```
{domain}/
├── config.json   — 라우트 활성화 여부 (enabled: true/false)
├── routes.ts     — URL ↔ 핸들러 매핑 테이블
├── handlers.ts   — 요청/응답 처리 (FastifyRequest/Reply)
├── service.ts    — 비즈니스 로직 (entityServer 호출, DB 쿼리 등)
├── schema.ts     — zod 스키마 (요청/응답 런타임 검증)
├── entities/     — 엔티티 스키마 JSON (entity-server 자동 등록)
│   └── {table}.json
└── types/        — TypeScript 타입 정의
    ├── index.ts       — re-export 배럴
    ├── {model}.ts     — 엔티티/모델별 타입
    ├── params.ts      — 요청 파라미터 타입
    ├── query.ts       — 쿼리스트링 타입
    └── defaults.ts    — 타입별 기본값 객체
```

## 핵심 규칙

- `config.json`의 `enabled: false` 이면 라우트가 로드되지 않습니다 (로그 없음).
- `config.json`이 없으면 항상 로드됩니다.
- 등록 경로: `src/app/routes/{domain}/` → `/v1/{domain}/*`
- `routes.ts`에는 URL 매핑만, 비즈니스 로직은 `handlers.ts` / `service.ts`에 작성합니다.
- `entities/` 폴더에 JSON 스키마를 두면 서버 시작 시 entity-server에 자동 등록됩니다 (`ensurePluginEntities`).
- **`routes/`에 등록된 경로는 Go 서버 패스스루보다 항상 먼저 처리됩니다.** (`plugins/`도 동일)

> 앱 서버 로딩 순서: `plugins/*/routes.ts` → `routes/*/routes.ts` → 패스스루
> Go 서버가 제공하는 경로와 동일한 경로를 정의하면 앱 서버가 우선 처리합니다.

## routes.ts 패턴

```ts
import type { FastifyInstance } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger, ensurePluginEntities } from "@system/api";
import * as h from "./handlers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function domainRoutes(app: FastifyInstance) {
    await ensurePluginEntities(__dirname).catch((err) =>
        logger.warn({ err }, "domain: ensureEntities failed"),
    );

    app.get("/", h.list);
    app.post("/", h.create);
    app.get("/:id", h.getById);
}
```

> `entities/` 폴더가 없으면 `ensurePluginEntities`는 아무 동작도 하지 않으므로 미리 선언해 두는 것을 권장합니다.

## 라우트 목록

| 도메인     | 경로                   | 설명                     | 문서                                          |
| ---------- | ---------------------- | ------------------------ | --------------------------------------------- |
| health     | `/v1/health/*`     | 서비스 상태 확인         | [docs](../../../docs/routes/how-to-create.md) |
| example-db | `/v1/example-db/*` | Kysely DB 직접 쿼리 예제 | —                                             |
| example-es | `/v1/example-es/*` | Entity Server API 예제   | —                                             |

## 상세 문서

- [라우트 추가 가이드](../../../docs/routes/how-to-create.md)
- [플러그인 라우트 레퍼런스](../../../docs/routes/README.md)
