/**
 * 친구톡 라우트 테이블
 * 등록 경로: /v1/friendtalk/*
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** 친구톡 라우트를 Fastify에 등록한다 */
export default async function friendtalkRoutes(app: FastifyInstance) {
    app.post("/send", h.send);
}
