/**
 * PG 결제 라우트 테이블
 * 등록 경로: /v1/pg/*
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** PG 결제 API 라우트를 등록한다 */
export default async function pgRoutes(app: FastifyInstance) {
    // 주문 생성
    app.post("/orders", h.createOrder);

    // 주문 조회
    app.get("/orders/:orderId", h.getOrder);

    // 결제 승인
    app.post("/confirm", h.confirmPayment);

    // KCP 서명데이터 생성
    app.post("/kcp/signature", h.createKcpSignature);

    // 결제 취소
    app.post("/orders/:orderId/cancel", h.cancelPayment);

    // 상태 동기화 (관리자용)
    app.post("/orders/:orderId/sync", h.syncPaymentStatus);

    // 웹훅 수신 (PG사 → entity-app-server, 인증 불필요)
    app.post("/webhook", h.handleWebhook);

    // 클라이언트 SDK 설정 조회 (공개)
    app.get("/config", h.getClientConfig);
}
