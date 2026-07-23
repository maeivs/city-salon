/**
 * Health 라우트 테이블 — 샘플 라우트
 * 등록 경로: /v1/health/*
 *
 * 새 라우트 추가 방법: src/app/routes/README.md 참고
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

export default async function healthRoutes(app: FastifyInstance) {
    app.get("/", h.getHealth);
    app.get("/ready", h.getReady);
}
