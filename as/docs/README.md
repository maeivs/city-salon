# 커스터마이징 가이드

Entity App Server는 `app/` 폴더의 TypeScript 소스를 직접 수정해 동작을 확장할 수 있습니다.

프로젝트 전체 품질과 구조적 장단점을 먼저 보고 싶다면 [evaluation.md](evaluation.md)를 참고하세요.

---

## 폴더 구조

```
app/
  plugins/          — 비즈니스 플러그인 (결제·LLM·알림 등)
    alimtalk/       — 카카오 알림톡
    friendtalk/     — 카카오 친구톡
    holidays/       — 공휴일 자동 동기화
    identity/       — 본인인증 (NICE, KMC, Danal)
    llm/            — LLM 연동 (OpenAI, Gemini, Claude 등)
    ocr/            — OCR 문서 인식
    pg/             — 결제 (토스, KCP, 이니시스, 페이레터 등)
    taxinvoice/     — 전자세금계산서
  routes/           — 커스텀 API 엔드포인트
    health/         — 헬스체크 (기본 제공)
  schedules/        — 백그라운드 크론 스케줄
    dormancy/       — 장기 미접속 계정 휴면 전환
    data-retention/ — 개인정보 보유 기간 만료 삭제
  hooks/
    registry.ts     — 엔티티 이벤트 훅 등록
```

---

## 플러그인 수정

각 플러그인은 `app/plugins/{name}/index.ts`의 Fastify 플러그인으로 구성됩니다.  
서버 시작 시 `plugins/` 하위 폴더를 알파벳 순으로 자동 탐색해 등록합니다.

**기존 모듈 핸들러 수정 예시:**

```ts
// app/plugins/llm/handlers.ts
import { ok, fail } from "@system/api";

export async function chatHandler(req, reply) {
    // 원하는 로직으로 수정
}
```

**새 플러그인 추가:**

```
app/plugins/my-module/
  index.ts     — Fastify 플러그인 (default export 필수)
  handlers.ts
  routes.ts
```

```ts
// app/plugins/my-module/index.ts
import type { FastifyInstance } from "fastify";

export default async function myModulePlugin(app: FastifyInstance) {
    app.get("/my-module/hello", async (req, reply) => {
        return { message: "hello" };
    });
}
```

서버를 재시작하면 자동으로 로드됩니다.

---

## 커스텀 라우트 추가

`app/routes/{name}/index.ts`에 Fastify 플러그인을 작성합니다.

사용자 프로필이나 지문인증 같은 계정 확장은 별도 `user` 라우트가 아니라 `app/routes/account/**` 아래에서 관리하는 것을 권장합니다. 예를 들어 생체인증은 `app/routes/account/biometric/*`처럼 계정 하위 기능으로 두는 편이 구조가 명확합니다.

```ts
// app/routes/orders/index.ts
import type { FastifyInstance } from "fastify";
import { ok } from "@system/api";

export default async function ordersRoutes(app: FastifyInstance) {
    app.get("/orders", async (req, reply) => {
        return reply.send(ok([{ id: 1 }]));
    });
}
```

---

## 스케줄 추가

`app/schedules/{name}/index.ts`에 `start()` / `stop()`을 구현합니다.

```ts
// app/schedules/subscription-reminder/index.ts
import { createCron, logger, type CronHandle } from "@system/api";

let cronHandle: CronHandle | null = null;

export function start(): void {
    cronHandle = createCron({
        expression: "0 9 * * 1", // 매주 월요일 09:00
        onTick: async () => {
            // 배치 로직
        },
    });
    logger.info("subscription-reminder scheduler started");
}

export function stop(): void {
    cronHandle?.stop();
    cronHandle = null;
}
```

서버를 재시작하면 자동으로 로드됩니다.  
자세한 내용은 [스케줄 추가 가이드](schedules/how-to-create.md)를 참고하세요.

---

## 엔티티 훅

엔티티 CRUD 이벤트(before/after) 전후에 커스텀 로직을 실행합니다.  
Get 훅은 조회 접근 제어/응답 가공(find 조회에도 afterGet 자동 적용), Submit 훅은 `SubmitContext`를 받아 **수정 전(old) / 요청(new)** 데이터에 모두 접근할 수 있습니다.

```ts
// app/hooks/entities/order.ts
import type {
    EntityHook,
    SubmitContext,
    DeleteContext,
    UserInfo,
} from "@system/api";
import { logger, ValidationError, ForbiddenError } from "@system/api";

export const orderHook: EntityHook = {
    async afterGet(entity, data: any, user: UserInfo) {
        // 관리자가 아니면 전화번호 마스킹
        if (user.role !== "admin" && data.phone) {
            data.phone = data.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
        }
        return data;
    },
    async beforeSubmit(entity, ctx: SubmitContext, user: UserInfo) {
        // ctx.old — 수정 전 데이터 (신규 INSERT 시 null)
        // ctx.new — 클라이언트 요청 데이터
        if (!ctx.old && (!ctx.new.items || ctx.new.items.length === 0)) {
            throw new ValidationError("주문 항목이 비어있습니다");
        }
        return { ...ctx.new, ordered_by: user.sub };
    },
    async afterSubmit(entity, ctx: SubmitContext, user: UserInfo) {
        // ctx.old / ctx.new 로 변경 전후 비교 가능
        if (ctx.old && ctx.old.status !== ctx.new.status) {
            logger.info(
                { from: ctx.old.status, to: ctx.new.status },
                "상태 변경",
            );
        }
        return ctx.new;
    },
    async beforeDelete(entity, ctx: DeleteContext, user: UserInfo) {
        // ctx.data — 삭제 대상 데이터 (조회 실패 시 null)
        if (ctx.data?.status === "completed") {
            throw new ForbiddenError("완료된 주문은 삭제할 수 없습니다");
        }
        logger.info(
            { seq: ctx.seq, orderNo: ctx.data?.order_no },
            "주문 삭제 요청",
        );
        return true;
    },
    async afterDelete(entity, ctx: DeleteContext, user: UserInfo) {
        logger.info(
            { seq: ctx.seq, orderNo: ctx.data?.order_no },
            "주문 삭제 완료",
        );
    },
};
```

```ts
// app/hooks/registry.ts
import type { EntityHook } from "@system/api";
import { orderHook } from "./entities/order.ts";

export const hookRegistry: Record<string, EntityHook> = {
    order: orderHook,
};
```

---

## 공개 API (`@system/api`)

app 코드에서 사용할 수 있는 헬퍼:

```ts
import { ok, fail, logger, entityServer } from "@system/api";
import { cache, dbConn } from "@system/api";
import { NotFoundError, BadRequestError } from "@system/api";
import type {
    EntityHook,
    SubmitContext,
    DeleteContext,
    UserInfo,
    CacheStore,
    CacheDriver,
} from "@system/api";
```

### 경로 별칭 규칙

다른 개발자가 보더라도 의미가 바로 드러나도록 별칭은 아래처럼 구분합니다.

| 별칭          | 의미                       | 사용 원칙                            |
| ------------- | -------------------------- | ------------------------------------ |
| `@system/api` | app 코드용 공개 시스템 API | `src/app/**`에서는 이 경로만 사용    |
| `@system/*`   | system 코어 내부 구현 경로 | `src/system/**` 내부 구현에서만 사용 |
| `@app/*`      | app 코드 경로              | app 모듈 공통 참조 시 사용           |

즉, 라우트·플러그인·훅·스케줄 같은 app 코드에서 시스템 기능이 필요하면 `@system/api`를 import하고, `@system/config/...` 같은 내부 경로는 직접 import하지 않습니다.

| export                    | 설명                                            |
| ------------------------- | ----------------------------------------------- |
| `ok(data, requestId?)`    | 성공 응답 객체 생성                             |
| `fail(error, requestId?)` | 실패 응답 객체 생성                             |
| `logger`                  | pino 로거 인스턴스                              |
| `entityServer`            | Entity Server REST 클라이언트                   |
| `cache()`                 | 캐시 스토어 반환 — [캐시 가이드](cache.md) 참고 |
| `dbConn(group?)`          | Kysely DB 인스턴스 반환                         |
| `AppError`                | 커스텀 에러 베이스 클래스                       |
| `BadRequestError`         | 400 에러                                        |
| `UnauthorizedError`       | 401 에러                                        |
| `ForbiddenError`          | 403 에러                                        |
| `NotFoundError`           | 404 에러                                        |
| `ConflictError`           | 409 에러                                        |
| `ValidationError`         | 422 에러                                        |
| `CacheStore`              | 캐시 스토어 인터페이스 (type)                   |
| `CacheDriver`             | `"memory" \| "redis" \| "memcached"` (type)     |
| `EntityHook`              | 훅 인터페이스 (type)                            |
| `SubmitContext`           | submit 훅 old/new 컨텍스트 (type)               |
| `DeleteContext`           | delete 훅 seq/data 컨텍스트 (type)              |
| `UserInfo`                | JWT에서 디코딩된 사용자 정보 (type)             |

---

## 설정 파일

`configs/` 폴더의 JSON 파일로 서버 동작을 설정합니다.  
전체 항목은 [설정 파일 가이드](configs.md)를 참고하세요.

```
configs/
  server.json       — 포트, 호스트, 로깅
  database.json     — DB 연결
  cors.json         — CORS 설정
    csrf.json         — CSRF 설정
    security.json     — 패킷 암호화, 비밀번호 정책
  cache.json        — 캐시 드라이버 (memory / redis / memcached)

app/plugins/              — 각 플러그인 디렉토리에 설정 파일 포함
  alimtalk/config.json    — 카카오 알림톡
  friendtalk/config.json  — 카카오 친구톡
  holidays/config.json    — 공휴일 동기화
  identity/config.json    — 본인인증
  llm/config.json         — LLM API 키
  ocr/config.json         — OCR 설정
  pg/config.json          — 결제 PG 설정
  push/config.json        — FCM/APNs 푸시 알림
  sms/config.json         — SMS 발송 설정
  taxinvoice/config.json  — 전자세금계산서
```

---

## 관련 문서

- [아키텍처](architecture.md) — 전체 구조, 서버 4가지 역할, 인증 흐름
- [system/ 내부 구조](system.md) — 서버 코어 디렉터리 구조와 각 모듈 역할
- [내부 구조](internals.md) — 부트스트랩 순서, 요청 처리 흐름
- [설정 파일](configs.md) — .env, server.json, database.json 등
- [보안 설정](security.md) — CORS, CSRF, 패킷 암호화, 비밀번호 정책
- [캐시](cache.md) — memory/Redis/Memcached 캐시 사용법
- [훅](hooks.md) — 엔티티 CRUD 훅 상세 가이드
- [플러그인 추가](plugins/how-to-create.md) — 새 플러그인 작성 가이드
- [라우트 추가](routes/how-to-create.md) — 새 라우트 작성 가이드
- [스크립트 가이드](scripts-guide.md) — run/build/push/release 스크립트 사용법
