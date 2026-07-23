/**
 * 엔티티 훅 레지스트리 — 엔티티별 before/after 훅을 등록합니다.
 *
 * 키: 엔티티 이름 (entities/ 폴더의 JSON 파일명과 동일)
 * 값: EntityHook 구현 객체
 *
 * Entity Server CRUD 요청 전/후에 해당 엔티티의 훅이 자동 실행됩니다.
 */

import type { EntityHook } from "@system/api";
import { accountHook } from "./account.ts";
import { addressIndexHook } from "./address_index.ts";
import { orderHook } from "./order.ts";
import { postHook } from "./post.ts";

export const hookRegistry: Record<string, EntityHook> = {
    "*": addressIndexHook,
    account: accountHook,
    order: orderHook,
    post: postHook,
};
