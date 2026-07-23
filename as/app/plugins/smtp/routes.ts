/**
 * SMTP 라우트 테이블
 * 등록 경로: /v1/smtp/*
 *
 * 여기서 처리되지 않는 /v1/smtp/* 경로는
 * system/proxy/register.ts 에 의해 Go 서버로 패스스루된다.
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** SMTP 라우트를 등록한다 */
export default async function smtpRoutes(app: FastifyInstance) {
    // POST /v1/smtp/send — 로컬 템플릿 렌더링 후 Go 서버로 발송
    app.post("/send", h.handleSend);

    // GET /v1/smtp/status/:seq — 발송 상태 조회
    app.get("/status/:seq", h.handleStatus);
}
