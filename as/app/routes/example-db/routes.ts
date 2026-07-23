/**
 * DB Example 라우트 테이블
 * 등록 경로: /v1/example-db/*
 *
 * Kysely를 사용한 DB 직접 접속 예제입니다.
 * 실제 프로젝트에서는 이 폴더를 복사하여 새 라우트를 만들 수 있습니다.
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

export default async function dbExampleRoutes(app: FastifyInstance) {
    // ── 기본 CRUD ──────────────────────────────
    app.get("/users", h.listUsers);
    app.get("/users/:id", h.getUser);
    app.post("/users", h.createUser);
    app.put("/users/:id", h.updateUser);
    app.delete("/users/:id", h.deleteUser);

    // ── 고급 쿼리 ─────────────────────────────
    app.get("/stats", h.getStats);
    app.get("/search", h.searchUsers);
}
