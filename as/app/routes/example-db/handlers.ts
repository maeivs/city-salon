/**
 * DB Example 핸들러 — Kysely DB 직접 접속 예제
 *
 * 이 파일은 Entity App Server에서 DB에 직접 접속하는 방법을 보여줍니다.
 * req.server.db 가 Kysely<Database> 인스턴스이므로
 * 체이닝 방식으로 타입 안전한 쿼리를 작성할 수 있습니다.
 *
 * ⚠ 주의: database.json 이 설정되어 있어야 동작합니다.
 *   설정되지 않으면 req.server.db 가 null 이므로 503 에러를 반환합니다.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import {
    ok,
    fail,
    sql,
    dbConn,
    NotFoundError,
    BadRequestError,
} from "@system/api";
import type {
    CreateUserBody,
    UpdateUserBody,
    SearchUsersQuery,
    UserIdParams,
} from "./types/index.ts";
// models/users.ts 에서 Database 확장 선언을 로드합니다.
// 이 import가 있어야 dbConn().selectFrom("users") 에 UsersTable 타입이 적용됩니다.
import "./models/users.ts";

// ─────────────────────────────────────────────────
// 기본 CRUD 예제
// ─────────────────────────────────────────────────

/**
 * GET /example/users
 * 사용자 목록 조회 (기본 SELECT)
 */
export async function listUsers(req: FastifyRequest, reply: FastifyReply) {
    const conn = dbConn();

    const users = await conn
        .selectFrom("users")
        .select(["seq", "name", "email", "status", "created_time"])
        .orderBy("seq", "desc")
        .limit(50)
        .execute();

    return reply.send(ok(users));
}

/**
 * GET /example/users/:id
 * 사용자 단건 조회
 */
export async function getUser(
    req: FastifyRequest<{ Params: UserIdParams }>,
    reply: FastifyReply,
) {
    const conn = dbConn();
    const { id } = req.params;

    const user = await conn
        .selectFrom("users")
        .selectAll()
        .where("seq", "=", Number(id))
        .executeTakeFirst();

    if (!user) {
        throw new NotFoundError(`User ${id} not found`);
    }

    return reply.send(ok(user));
}

/**
 * POST /example/users
 * 사용자 생성 (INSERT)
 */
export async function createUser(
    req: FastifyRequest<{ Body: CreateUserBody }>,
    reply: FastifyReply,
) {
    const conn = dbConn();
    const { name, email, status = "active" } = req.body;

    const result = await conn
        .insertInto("users")
        .values({ name, email, status, data: "{}" })
        .executeTakeFirst();

    return reply.code(201).send(
        ok({
            insertId: Number(result.insertId),
            name,
            email,
            status,
        }),
    );
}

/**
 * PUT /example/users/:id
 * 사용자 수정 (UPDATE)
 */
export async function updateUser(
    req: FastifyRequest<{ Params: UserIdParams; Body: UpdateUserBody }>,
    reply: FastifyReply,
) {
    const conn = dbConn();
    const { id } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
        throw new BadRequestError("No fields to update");
    }

    const result = await conn
        .updateTable("users")
        .set(updates)
        .where("seq", "=", Number(id))
        .executeTakeFirst();

    if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError(`User ${id} not found`);
    }

    return reply.send(ok({ id: Number(id), ...updates }));
}

/**
 * DELETE /example/users/:id
 * 사용자 삭제 (DELETE)
 */
export async function deleteUser(
    req: FastifyRequest<{ Params: UserIdParams }>,
    reply: FastifyReply,
) {
    const conn = dbConn();
    const { id } = req.params;

    const result = await conn
        .deleteFrom("users")
        .where("seq", "=", Number(id))
        .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError(`User ${id} not found`);
    }

    return reply.send(ok({ deleted: true, id: Number(id) }));
}

// ─────────────────────────────────────────────────
// 고급 쿼리 예제
// ─────────────────────────────────────────────────

/**
 * GET /example/stats
 * 통계 조회 — raw SQL (sql 태그드 리터럴) 예제
 *
 * 복잡한 집계 쿼리나 Database 인터페이스에 등록하지 않은 테이블은
 * sql`` 태그를 사용하여 raw SQL로 처리합니다.
 */
export async function getStats(req: FastifyRequest, reply: FastifyReply) {
    const conn = dbConn();

    // sql<T>`` 에서 T는 결과 행의 타입
    const { rows } = await sql<{ status: string; count: number }>`
        SELECT status, COUNT(*) as count
        FROM users
        GROUP BY status
        ORDER BY count DESC
    `.execute(conn);

    if (rows.length === 0) {
        return reply.send(fail("No stats available"));
    }

    return reply.send(ok(rows));
}

/**
 * GET /example/search?q=john&status=active&limit=20&offset=0
 * 동적 조건 검색 — 조건부 where 체이닝 예제
 */
export async function searchUsers(
    req: FastifyRequest<{ Querystring: SearchUsersQuery }>,
    reply: FastifyReply,
) {
    const conn = dbConn();
    const { q, status, limit = 20, offset = 0 } = req.query;

    let query = conn
        .selectFrom("users")
        .select(["seq", "name", "email", "status", "created_time"]);

    // 검색어가 있으면 이름 또는 이메일에서 LIKE 검색
    if (q) {
        query = query.where((eb: any) =>
            eb.or([
                eb("name", "like", `%${q}%`),
                eb("email", "like", `%${q}%`),
            ]),
        );
    }

    // 상태 필터
    if (status) {
        query = query.where("status", "=", status);
    }

    const users = await query
        .orderBy("seq", "desc")
        .limit(limit)
        .offset(offset)
        .execute();

    return reply.send(ok(users));
}
