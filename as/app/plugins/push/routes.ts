/**
 * Push 알림 라우트 테이블
 * 등록 경로: /v1/push/*
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** Push 라우트를 등록한다 */
export default async function pushRoutes(app: FastifyInstance) {
    // POST /v1/push/send — 단일 계정 푸시 발송 큐 등록
    app.post("/send", h.handleSend);

    // POST /v1/push/broadcast — 다중 계정 브로드캐스트
    app.post("/broadcast", h.handleBroadcast);

    // GET /v1/push/status/:seq — 발송 상태 조회 (엔티티 API 안내)
    app.get("/status/:seq", h.handleStatus);
    // POST /v1/push/device — 디바이스 토큰 등록/갱신
    app.post("/device", h.handleDeviceRegister);

    // DELETE /v1/push/device/:seq — 디바이스 푸시 수신 비활성화
    app.delete("/device/:seq", h.handleDeviceUnregister);
}
