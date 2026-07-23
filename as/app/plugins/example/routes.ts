/**
 * example 라우트 테이블
 * 등록 경로: /v1/example/*
 *
 * 새 확장을 만들 때:
 *  1. example → 모듈명으로 교체
 *  2. 필요한 HTTP 메서드 / 경로를 추가
 *  3. handlers.ts에 대응하는 핸들러 함수를 작성
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** example 라우트를 등록한다 */
export default async function exampleRoutes(app: FastifyInstance) {
    // GET /v1/example/ — 목록 조회
    app.get("/", h.handleList);

    // GET /v1/example/:seq — 단건 조회
    app.get("/:seq", h.handleGet);

    // POST /v1/example/ — 생성
    app.post("/", h.handleCreate);

    // PUT /v1/example/:seq — 수정
    app.put("/:seq", h.handleUpdate);

    // DELETE /v1/example/:seq — 삭제
    app.delete("/:seq", h.handleDelete);
}
