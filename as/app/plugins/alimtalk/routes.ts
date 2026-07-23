/**
 * 알림톡 라우트 테이블
 * 등록 경로: /v1/alimtalk/*
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers";

/** 알림톡 라우트를 등록한다 */
export default async function alimtalkRoutes(app: FastifyInstance) {
    app.post("/send", h.send);
    app.get("/status/:seq", h.getStatus);
    app.get("/templates", h.listTemplates);
    app.post("/webhook/:provider", h.webhook);
}
