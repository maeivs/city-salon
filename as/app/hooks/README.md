# app/hooks/

Entity Server CRUD 요청 전/후에 실행되는 비즈니스 훅 모음.

## 구조

```
hooks/
├── address_index.ts     — 주소 기반 시도/시군구 자동 채움 전역 훅
├── index.ts             — 엔티티별 훅 등록 테이블 (유일한 진입점)
├── order.ts             — 주문 훅 예시 (모든 훅 메서드 시연)
├── post.ts              — 게시글 훅 예시
└── {entity}.ts          — 추가 엔티티 훅
```

## 동작 원리

```
클라이언트 요청
    └─ Entity App Server 미들웨어
       └─ 훅 체크 → before 훅 실행
            └─ Entity Server 요청
                 └─ after 훅 실행 → 클라이언트 응답
```

- `registry.ts` 의 키가 Entity Server 엔티티 이름과 일치해야 한다.
- `"*"` 키를 사용하면 모든 엔티티 요청에 공통으로 적용되는 전역 훅을 등록할 수 있다.
- 훅이 없는 엔티티는 전/후 처리 없이 그대로 통과한다.
- `find` (목록 조회)에도 `afterGet`이 자동 적용된다.

## 훅 메서드 일람

| 메서드         | 시점         | 반환값                   | 설명                           |
| -------------- | ------------ | ------------------------ | ------------------------------ |
| `beforeGet`    | 단건 조회 전 | `boolean` (false = 차단) | 접근 제어                      |
| `afterGet`     | 단건 조회 후 | 가공된 데이터            | 마스킹, 필드 추가/제거         |
| `beforeSubmit` | 등록/수정 전 | 실제 저장될 데이터       | 검증, 자동 필드 설정           |
| `afterSubmit`  | 등록/수정 후 | 최종 응답 데이터         | 알림, 연관 처리                |
| `beforeDelete` | 삭제 전      | `boolean` (false = 차단) | 삭제 조건 검증                 |
| `afterDelete`  | 삭제 후      | `void`                   | 연관 데이터 정리               |
| `beforeList`   | 목록 조회 전 | 가공된 params            | 기본 정렬·필터 추가, 접근 제어 |
| `afterList`    | 목록 조회 후 | 가공된 응답              | 응답 데이터 변환               |

모든 메서드는 선택 구현이다. 필요한 것만 정의하면 된다.

## 새 훅 추가 방법

### 1) 훅 파일 생성

```ts
// app/hooks/my-entity.ts
import type {
    EntityHook,
    UserInfo,
    SubmitContext,
    DeleteContext,
} from "@system/api";
import { logger, ForbiddenError, ValidationError } from "@system/api";

export const myEntityHook: EntityHook = {
    async beforeSubmit(entity, ctx: SubmitContext, user: UserInfo) {
        if (!ctx.new.title) {
            throw new ValidationError("제목은 필수입니다");
        }
        return { ...ctx.new, created_by: user.sub };
    },

    async afterGet(entity, data: any, user: UserInfo) {
        // 비밀 필드 제거
        delete data.internal_note;
        return data;
    },
};
```

### 2) registry.ts 에 등록

```ts
// app/hooks/index.ts
import type { EntityHook } from "@system/api";
import { myEntityHook } from "./my-entity.ts";

export const hookRegistry: Record<string, EntityHook> = {
    my_entity: myEntityHook, // ← 엔티티 이름(JSON 파일명)과 정확히 일치해야 함
};
```

전역 훅 등록 예시:

```ts
import type { EntityHook } from "@system/api";
import { addressIndexHook } from "./address_index.ts";
import { myEntityHook } from "./my-entity.ts";

export const hookRegistry: Record<string, EntityHook> = {
    "*": addressIndexHook,
    my_entity: myEntityHook,
};
```

## 주소 자동채움 규칙

- 전역 `address_index.ts` 훅은 `beforeSubmit` 단계에서 동작한다.
- 엔티티 JSON에 `fields.sido.path`, `fields.sigungu.path` 가 둘 다 선언된 엔티티만 대상이다.
- payload에 `sido`, `sigungu` 값이 이미 있으면 덮어쓰지 않는다.
- payload 안에 `addr`, `addr1`, `address`, `address1`, `road_address`, `road_address1`, `residence_address`, `residence_address1` 중 하나라도 있으면 주소 후보로 사용한다.
- 주소 후보가 있으면 ES `POST /v1/utils/address/resolve` 를 호출해 시도, 시군구를 추출한 뒤 비어 있는 필드만 자동 채운다.
- 주소 해석 실패는 저장 자체를 막지 않고 warn 로그만 남기며 원래 payload로 계속 진행한다.

## 에러 반환 방법

훅에서 throw 하면 해당 HTTP 에러로 응답된다.

```ts
import {
    ForbiddenError,
    ValidationError,
    NotFoundError,
    BadRequestError,
} from "@system/api";

throw new ValidationError("제목은 필수입니다"); // 422
throw new ForbiddenError("권한이 없습니다"); // 403
throw new BadRequestError("잘못된 요청입니다"); // 400
throw new NotFoundError("데이터를 찾을 수 없습니다"); // 404
```

## `SubmitContext` — 등록/수정 훅 컨텍스트

```ts
interface SubmitContext {
    old: Record<string, unknown> | null; // 수정 전 데이터 (신규 INSERT 시 null)
    new: Record<string, unknown>; // 클라이언트 요청 데이터
}
```

신규 INSERT vs 수정 구분:

```ts
async beforeSubmit(entity, ctx, user) {
    if (!ctx.old) {
        // 신규 INSERT
    } else {
        // 수정 — ctx.old 에 기존 데이터 있음
        if (ctx.old.status !== ctx.new.status) {
            // 상태 변경 감지
        }
    }
    return ctx.new;
}
```

## `DeleteContext` — 삭제 훅 컨텍스트

```ts
interface DeleteContext {
    seq: number; // 삭제 대상 seq
    data: Record<string, unknown> | null; // 삭제 대상 전체 데이터 (조회 실패 시 null)
}
```

## 현재 등록된 훅

| 엔티티    | 파일         | 주요 동작                                           |
| --------- | ------------ | --------------------------------------------------- |
| `account` | `account.ts` | devices 자동 조회                                   |
| `order`   | `order.ts`   | 전화번호 마스킹, 주문번호 자동 생성, 상태 변경 차단 |
| `post`    | `post.ts`    | 작성자 자동 설정, 비공개 글 접근 제어               |

## 관련 문서

- [훅 시스템 개요](../../../docs/hooks.md)
