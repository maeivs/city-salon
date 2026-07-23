/**
 * 본인인증 라우트 테이블
 * 등록 경로: /v1/identity/*
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** 본인인증 라우트를 등록한다 */
export default async function identityRoutes(app: FastifyInstance) {
    // POST /v1/identity/request — 인증 요청 생성 (JWT 선택)
    app.post("/request", h.handleRequest);

    // POST /v1/identity/callback — 중계사 콜백 수신 (인증 없음)
    app.post("/callback", h.handleCallback);

    // GET /v1/identity/result/:request_id — 인증 결과 조회 (JWT 선택)
    app.get("/result/:request_id", h.handleResult);

    // POST /v1/identity/verify-ci — CI 중복 확인 (JWT 필수)
    app.post("/verify-ci", h.handleVerifyCI);
}
