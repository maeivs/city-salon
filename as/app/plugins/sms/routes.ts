/**
 * SMS 라우트 테이블
 * 등록 경로: /v1/sms/*
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** SMS 라우트를 등록한다 */
export default async function smsRoutes(app: FastifyInstance) {
    // POST /v1/sms/send — SMS/LMS/MMS 발송 큐 등록
    app.post("/send", h.handleSend);

    // GET /v1/sms/status/:seq — 발송 상태 조회
    app.get("/status/:seq", h.handleStatus);

    // 인증번호 라우트 (인증 불필요)
    // POST /v1/sms/verification/send — 인증번호 발송
    app.post("/verification/send", h.handleVerificationSend);

    // POST /v1/sms/verification/verify — 인증번호 검증
    app.post("/verification/verify", h.handleVerificationVerify);
}
