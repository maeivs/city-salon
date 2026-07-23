/**
 * 전자세금계산서 라우트 테이블
 * 등록 경로: /v1/taxinvoice/*
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** 세금계산서 API 라우트를 등록한다 */
export default async function taxinvoiceRoutes(app: FastifyInstance) {
    app.post("/", h.registIssue);
    app.post("/register", h.register);
    app.post("/:seq/issue", h.issue);
    app.post("/:seq/cancel", h.cancelIssue);
    app.get("/:seq/state", h.getState);
    app.get("/:seq", h.getDetail);
}
