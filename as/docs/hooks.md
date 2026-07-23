# 엔티티 훅

엔티티 CRUD 요청 전/후에 커스텀 비즈니스 로직을 실행하는 메커니즘입니다.

---

## 개요

Entity App Server는 Entity Server로 프록시하기 **전에** 훅이 등록된 엔티티의 get/find/submit/delete/list 요청을 인터셉트합니다.
`find`는 `get`과 동일한 단건 조회이므로 `afterGet` 훅이 자동 적용됩니다.

```
클라이언트 → Entity App Server (인터셉터)
               │
               ├─ beforeHook 실행
               ├─ Entity Server CRUD
               ├─ afterHook 실행
               │
               └→ 응답
```

- **before 훅** — 예외 throw 시 요청 차단 (Entity Server에 미반영)
- **after 훅** — 예외 시 로그만 남기고 통과 (이미 반영됨, 롤백 불가)

---

## 빠른 시작

### 1. 훅 파일 생성

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
    async beforeSubmit(entity, ctx: SubmitContext, user: UserInfo) {
        if (!ctx.old && !ctx.new.items?.length) {
            throw new ValidationError("주문 항목이 비어있습니다");
        }
        return { ...ctx.new, ordered_by: user.sub };
    },

    async afterSubmit(entity, ctx: SubmitContext, user: UserInfo) {
        if (ctx.old && ctx.old.status !== ctx.new.status) {
            logger.info(
                { from: ctx.old.status, to: ctx.new.status },
                "상태 변경",
            );
        }
        return ctx.new;
    },

    async beforeDelete(entity, ctx: DeleteContext, user: UserInfo) {
        if (ctx.data?.status === "completed") {
            throw new ForbiddenError("완료된 주문은 삭제 불가");
        }
        return true;
    },

    async afterDelete(entity, ctx: DeleteContext, user: UserInfo) {
        logger.info(
            { seq: ctx.seq, orderNo: ctx.data?.order_no },
            "주문 삭제됨",
        );
    },
};
```

### 2. 레지스트리에 등록

```ts
// app/hooks/registry.ts
import type { EntityHook } from "@system/api";
import { orderHook } from "./entities/order.ts";

export const hookRegistry: Record<string, EntityHook> = {
    order: orderHook, // 키 = entities/ 폴더의 엔티티 이름
};
```

서버 시작 시 `app/hooks/registry.ts`를 자동 로드합니다. 파일이 없으면 훅 없이 동작합니다.

---

## EntityHook 인터페이스

```ts
interface EntityHook {
    // Get — 단건 조회 (seq)
    // find 조회에도 afterGet이 자동 적용됩니다.
    beforeGet?(entity: string, seq: number, user: UserInfo): Promise<boolean>;
    afterGet?(entity: string, data: any, user: UserInfo): Promise<any>;

    // Submit — 생성/수정
    beforeSubmit?(
        entity: string,
        ctx: SubmitContext,
        user: UserInfo,
    ): Promise<any>;
    afterSubmit?(
        entity: string,
        ctx: SubmitContext,
        user: UserInfo,
    ): Promise<any>;

    // Delete — 삭제
    beforeDelete?(
        entity: string,
        ctx: DeleteContext,
        user: UserInfo,
    ): Promise<boolean>;
    afterDelete?(
        entity: string,
        ctx: DeleteContext,
        user: UserInfo,
    ): Promise<void>;

    // List — 목록 조회
    beforeList?(entity: string, params: any, user: UserInfo): Promise<any>;
    afterList?(entity: string, result: any, user: UserInfo): Promise<any>;
}
```

모든 훅은 **선택적**입니다. 필요한 훅만 구현하면 됩니다.

---

## 컨텍스트 타입

### SubmitContext

Submit 훅(before/after)에 전달되는 old/new 컨텍스트입니다.

```ts
interface SubmitContext<T = any> {
    old: T | null; // 수정 전 데이터 (INSERT 시 null)
    new: T; // 요청 데이터(before) 또는 저장된 결과(after)
}
```

| 시점                      | `ctx.old`           | `ctx.new`                |
| ------------------------- | ------------------- | ------------------------ |
| **beforeSubmit** (INSERT) | `null`              | 클라이언트 요청 데이터   |
| **beforeSubmit** (UPDATE) | 수정 전 기존 데이터 | 클라이언트 요청 데이터   |
| **afterSubmit** (INSERT)  | `null`              | 엔티티서버에 저장된 결과 |
| **afterSubmit** (UPDATE)  | 수정 전 기존 데이터 | 엔티티서버에 저장된 결과 |

- `old`는 인터셉터가 `entityServer.get()`으로 자동 조회합니다 (훅에서 별도 조회 불필요)
- `beforeSubmit`의 **반환값**이 실제 Entity Server로 submit되는 데이터가 됩니다

### DeleteContext

Delete 훅(before/after)에 전달되는 컨텍스트입니다.

```ts
interface DeleteContext<T = any> {
    seq: number; // 삭제 대상 시퀀스
    data: T | null; // 삭제 대상 데이터 (조회 실패 시 null)
}
```

| 시점             | `ctx.seq`     | `ctx.data`       |
| ---------------- | ------------- | ---------------- |
| **beforeDelete** | 삭제할 시퀀스 | 삭제 대상 데이터 |
| **afterDelete**  | 삭제된 시퀀스 | 삭제된 데이터    |

- `data`도 인터셉터가 자동 조회합니다
- 조회 실패 시 `data = null`로 전달되므로 옵셔널 체이닝(`ctx.data?.field`) 사용을 권장합니다

### UserInfo

JWT에서 디코딩된 사용자 정보입니다.

```ts
interface UserInfo {
    sub: number; // 사용자 시퀀스
    email: string; // 이메일
    role: string; // 역할 (admin, user 등)
    [key: string]: unknown; // 추가 클레임
}
```

---

## 훅별 상세

### beforeGet

단건 조회 **전** 접근 제어를 수행합니다. `false` 반환 또는 예외 throw 시 조회가 차단됩니다.

```ts
async beforeGet(entity: string, seq: number, user: UserInfo) {
    // 예: 비공개 데이터 접근 차단 (실제 소유권 검사는 afterGet에서 데이터 기반으로)
    logger.debug({ entity, seq, userId: user.sub }, "단건 조회 요청");
    return true;  // 조회 허용
}
```

**에러 처리**: 예외 throw 시 요청이 차단되고 클라이언트에 에러가 반환됩니다.

### afterGet

단건 조회 **후** 응답 데이터를 가공합니다. 반환값이 클라이언트 응답이 됩니다.

```ts
async afterGet(entity: string, data: any, user: UserInfo) {
    // 민감 정보 마스킹
    if (user.role !== "admin" && data.phone) {
        data.phone = data.phone.replace(
            /(\d{3})\d{4}(\d{4})/,
            "$1****$2",
        );
    }

    // 계산 필드 추가
    if (data.content) {
        data.preview =
            data.content.slice(0, 100) +
            (data.content.length > 100 ? "…" : "");
    }

    return data;
}
```

**에러 처리**: 예외가 발생하면 로그만 남기고 원본 데이터를 반환합니다.

### beforeSubmit

데이터 **변환** 및 **검증**을 수행합니다. 반환값이 실제 submit 데이터가 됩니다.

```ts
async beforeSubmit(entity: string, ctx: SubmitContext, user: UserInfo) {
    const data = { ...ctx.new };

    if (!ctx.old) {
        // ── 신규 (INSERT) ──
        data.created_by = user.sub;
        data.created_time = new Date().toISOString();
    } else {
        // ── 수정 (UPDATE) ── ctx.old로 기존 데이터 확인
        delete data.created_by;  // 변경 불가 필드 보호

        if (ctx.old.status === "locked") {
            throw new ForbiddenError("잠긴 데이터는 수정할 수 없습니다");
        }
    }

    return data;  // ← 이 값이 Entity Server로 전송됨
}
```

**에러 처리**: 예외 throw 시 요청이 차단되고 클라이언트에 에러가 반환됩니다.

### afterSubmit

저장 완료 후 **사이드이펙트**를 실행합니다. 반환값은 응답에 포함되지 않습니다.

```ts
async afterSubmit(entity: string, ctx: SubmitContext, user: UserInfo) {
    // 신규 생성 시 알림
    if (!ctx.old) {
        // await sendEmail(user.email, `${ctx.new.seq}번 항목이 생성되었습니다`);
    }

    // 상태 변경 감지
    if (ctx.old && ctx.old.status !== ctx.new.status) {
        logger.info(
            { seq: ctx.new.seq, from: ctx.old.status, to: ctx.new.status },
            "상태 변경됨",
        );
    }

    return ctx.new;
}
```

**에러 처리**: 예외가 발생해도 데이터는 이미 저장됨. 로그만 남기고 무시됩니다.

### beforeDelete

삭제 **차단 여부**를 결정합니다. `false` 반환 또는 예외 throw 시 삭제가 차단됩니다.

```ts
async beforeDelete(entity: string, ctx: DeleteContext, user: UserInfo) {
    // 완료 상태는 삭제 차단
    if (ctx.data?.status === "completed") {
        throw new ForbiddenError("완료된 항목은 삭제할 수 없습니다");
    }

    // 본인 소유만 삭제 허용
    if (ctx.data && ctx.data.owner_id !== user.sub && user.role !== "admin") {
        throw new ForbiddenError("본인 데이터만 삭제할 수 있습니다");
    }

    return true;  // 삭제 허용
}
```

### afterDelete

삭제 후 **정리 작업**을 수행합니다.

```ts
async afterDelete(entity: string, ctx: DeleteContext, user: UserInfo) {
    logger.info(
        { seq: ctx.seq, name: ctx.data?.name, deletedBy: user.sub },
        "항목 삭제 완료",
    );

    // 연관 데이터 정리
    // await entityServer.delete("order_item", relatedSeq);
}
```

### beforeList

목록 조회 **파라미터를 변환**합니다. 기본 정렬, 권한 기반 필터 추가 등에 사용합니다.

```ts
async beforeList(entity: string, params: any, user: UserInfo) {
    // 기본 정렬
    if (!params.orderBy) {
        params.orderBy = "created_time";
        params.orderDir = "desc";
    }

    // 일반 사용자는 본인 데이터만 조회
    if (user.role !== "admin") {
        params.conditions = params.conditions || [];
        params.conditions.push({
            field: "owner_id",
            operator: "eq",
            value: user.sub,
        });
    }

    return params;
}
```

### afterList

목록 조회 **응답을 가공**합니다. 마스킹, 계산 필드 추가 등에 사용합니다.

```ts
async afterList(entity: string, result: any, user: UserInfo) {
    if (result.list) {
        result.list = result.list.map((item: any) => ({
            ...item,
            // 본문 미리보기 (100자)
            preview: item.content?.slice(0, 100) + (item.content?.length > 100 ? "…" : ""),
            // 민감 정보 마스킹
            phone: user.role !== "admin"
                ? item.phone?.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")
                : item.phone,
        }));
    }
    return result;
}
```

---

## 실행 흐름

### Get 흐름

```
GET /v1/entity/order/42
│
├─ hasHook("order")? → YES  (NO면 프록시로 패스스루)
│
├─ ① beforeGet("order", 42, user) → true/false
├─ ② entityServer.get("order", 42) → 조회 결과
├─ ③ afterGet("order", data, user) → 가공된 결과
│
└─ 응답: { ok: true, data: 가공결과 }
```

### Find 흐름

`find`는 `get`과 동일한 단건 조회이므로 별도의 훅 없이 `afterGet`을 재사용합니다.

```
POST /v1/entity/order/find
│
├─ hasHook("order")? → YES  (NO면 프록시로 패스스루)
│
├─ ① entityServer.find("order", conditions) → 조회 결과
├─ ② afterGet("order", data, user) → 가공된 결과 (마스킹 등)
│
└─ 응답: { ok: true, data: 가공결과 }
```

### Submit 흐름

```
POST /v1/entity/order/submit
│
├─ hasHook("order")? → YES  (NO면 프록시로 패스스루)
│
├─ ① data.seq 있으면 entityServer.get() → old 데이터 조회
├─ ② beforeSubmit({ old, new: reqData }) → 변환된 데이터 반환
├─ ③ entityServer.submit(변환데이터) → { ok, seq }
├─ ④ entityServer.get(seq) → 저장된 결과 조회
├─ ⑤ afterSubmit({ old, new: 저장결과 }) → 사이드이펙트
│
└─ 응답: { ok: true, seq }
```

### Delete 흐름

```
POST /v1/entity/order/delete/42
│
├─ hasHook("order")? → YES
│
├─ ① entityServer.get(42) → 삭제 대상 데이터 조회
├─ ② beforeDelete({ seq: 42, data }) → true/false
├─ ③ entityServer.delete(42) → { ok, deleted }
├─ ④ afterDelete({ seq: 42, data }) → 사이드이펙트
│
└─ 응답: { ok: true, deleted: 1 }
```

### List 흐름

```
POST /v1/entity/order/list?page=1&limit=20
│
├─ hasHook("order")? → YES
│
├─ ① beforeList(params) → 변환된 파라미터 반환
├─ ② entityServer.list(변환파라미터) → 목록 결과
├─ ③ afterList(result) → 가공된 결과 반환
│
└─ 응답: { ok: true, data: 가공결과 }
```

### 훅 미등록 엔티티

레지스트리에 등록되지 않은 엔티티는 인터셉터를 거치지 않고 **Entity Server로 직접 프록시**됩니다.

---

## 훅 우회 (skipHooks)

쿼리 파라미터로 훅을 우회할 수 있습니다:

```
POST /v1/entity/order/submit?skipHooks=true
```

주로 내부 시스템 호출이나 마이그레이션 시 사용합니다.

---

## 파일 구조

```
app/
  hooks/
    registry.ts                ← 훅 등록 (엔티티명 → EntityHook 매핑)
    entities/
      order.ts                 ← 주문 훅 구현
      post.ts                  ← 게시글 훅 구현
      {your-entity}.ts         ← 새 훅 추가 시 여기에 생성
```

| 파일            | 역할                                                           |
| --------------- | -------------------------------------------------------------- |
| `registry.ts`   | 엔티티명을 키로 EntityHook 객체를 매핑. 서버 시작 시 자동 로드 |
| `entities/*.ts` | 엔티티별 훅 구현. EntityHook 인터페이스의 메서드를 선택 구현   |

---

## 새 훅 추가하기

### 1. 훅 파일 작성

```ts
// app/hooks/entities/product.ts
import type { EntityHook, SubmitContext, UserInfo } from "@system/api";
import { logger } from "@system/api";

export const productHook: EntityHook = {
    async beforeSubmit(entity, ctx: SubmitContext, user: UserInfo) {
        const data = { ...ctx.new };
        // 가격 음수 방지
        if (data.price != null && Number(data.price) < 0) {
            data.price = 0;
        }
        return data;
    },
};
```

### 2. 레지스트리에 추가

```ts
// app/hooks/registry.ts
import type { EntityHook } from "@system/api";
import { orderHook } from "./entities/order.ts";
import { postHook } from "./entities/post.ts";
import { productHook } from "./entities/product.ts"; // 추가

export const hookRegistry: Record<string, EntityHook> = {
    order: orderHook,
    post: postHook,
    product: productHook, // 추가
};
```

### 3. 서버 재시작

훅은 서버 시작 시 로드되므로 재시작이 필요합니다.

---

## 에러 처리 정책

| 훅 종류        | 예외 발생 시     | 설명                                         |
| -------------- | ---------------- | -------------------------------------------- |
| `beforeGet`    | **조회 차단**    | 클라이언트에 에러 반환. Entity Server 미호출 |
| `afterGet`     | **로그 후 무시** | 원본 데이터 그대로 반환                      |
| `beforeSubmit` | **요청 차단**    | 클라이언트에 에러 반환. Entity Server 미반영 |
| `afterSubmit`  | **로그 후 무시** | 데이터는 이미 저장됨                         |
| `beforeDelete` | **삭제 차단**    | 클라이언트에 에러 반환. 삭제 미실행          |
| `afterDelete`  | **로그 후 무시** | 삭제는 이미 완료됨                           |
| `beforeList`   | **요청 차단**    | 클라이언트에 에러 반환                       |
| `afterList`    | **로그 후 무시** | 원본 결과 그대로 반환                        |

before 훅에서는 `ValidationError`, `ForbiddenError` 등의 에러 클래스를 throw하여 적절한 HTTP 상태 코드와 메시지를 반환할 수 있습니다:

```ts
import { ValidationError, ForbiddenError, BadRequestError } from "@system/api";

// 422 Unprocessable Entity
throw new ValidationError("필수 항목이 누락되었습니다");

// 403 Forbidden
throw new ForbiddenError("권한이 없습니다");

// 400 Bad Request
throw new BadRequestError("잘못된 요청입니다");
```

---

## @system/api 임포트

훅에서 사용할 수 있는 주요 임포트:

```ts
// 타입
import type {
    EntityHook,
    SubmitContext,
    DeleteContext,
    UserInfo,
} from "@system/api";

// 유틸리티
import { logger, entityServer } from "@system/api";

// 에러 클래스
import {
    ValidationError, // 422
    ForbiddenError, // 403
    BadRequestError, // 400
    NotFoundError, // 404
    ConflictError, // 409
    UnauthorizedError, // 401
} from "@system/api";
```

`entityServer`를 사용하면 훅 안에서 다른 엔티티를 조회/수정할 수 있습니다:

```ts
async afterSubmit(entity, ctx: SubmitContext, user: UserInfo) {
    // 다른 엔티티 조회
    const res = await entityServer.get("customer", ctx.new.customer_seq);
    const customer = res.data;

    // 다른 엔티티 수정
    await entityServer.submit("notification", {
        target_user: customer.email,
        message: `주문 ${ctx.new.order_no} 접수`,
    });

    return ctx.new;
}
```
