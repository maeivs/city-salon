/**
 * Entity Server Example 라우트 테이블
 * 등록 경로: /v1/example-es/*
 *
 * entityServer 클라이언트를 사용한 Entity Server CRUD 예제입니다.
 * 실제 프로젝트에서는 이 폴더를 복사하여 새 라우트를 만들 수 있습니다.
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

export default async function esExampleRoutes(app: FastifyInstance) {
    // ── 기본 CRUD ──────────────────────────────
    app.get("/posts", h.listPosts);
    app.get("/posts/:seq", h.getPost);
    app.post("/posts", h.createPost);
    app.put("/posts/:seq", h.updatePost);
    app.delete("/posts/:seq", h.deletePost);

    // ── 고급: 검색, 트랜잭션, 이력 ─────────────
    app.get("/posts/search", h.searchPosts);
    app.post("/posts/:seq/publish", h.publishPost);
    app.get("/posts/:seq/history", h.getPostHistory);
}
