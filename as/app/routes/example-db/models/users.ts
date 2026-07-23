/**
 * users 테이블 타입 — Kysely DB 직접 쿼리용
 *
 * DB를 직접 쓸 때만 models/ 폴더에 테이블 타입을 정의합니다.
 * declare module로 Database에 등록하면 dbConn().selectFrom("users")에서
 * 자동완성 + 타입 체크가 적용됩니다.
 *
 * @see https://kysely.dev/docs/getting-started#types
 */

import type { Generated } from "kysely";

/** users 테이블 타입 */
export interface UsersTable {
    seq: Generated<number>; // PK, auto_increment
    name: string | null; // 이름
    email: string; // 이메일 (unique)
    status: Generated<"active" | "inactive" | null>; // 상태
    data: Generated<string>; // JSON blob
    created_time: Generated<string>; // 생성 시각
    updated_time: Generated<string>; // 수정 시각
}

declare module "@system/api" {
    interface Database {
        users: UsersTable;
    }
}

export {};
