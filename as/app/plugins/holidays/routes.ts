/**
 * 공휴일 라우트 테이블
 * 등록 경로: /v1/holidays/*  (routes loader가 자동 등록)
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

export default async function holidayRoutes(app: FastifyInstance) {
    // GET /v1/holidays?year=2025&month=5&is_holiday=Y
    app.get("/", h.handleList);

    // GET /v1/holidays/20250101
    app.get("/:locdate", h.handleGetByDate);

    // POST /v1/holidays/sync  (관리자 전용)
    app.post("/sync", h.handleSync);
}
