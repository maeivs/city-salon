/**
 * OCR 라우트 테이블
 * 등록 경로: /v1/ocr/*
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** OCR 라우트 테이블을 등록한다 */
export default async function ocrRoutes(app: FastifyInstance) {
    app.post("/recognize", h.recognize);
    app.post("/recognize/async", h.recognizeAsync);
    app.post("/:docType", h.recognizeByDocType);
    app.get("/results", h.listResults);
    app.get("/results/:id", h.getResult);
    app.get("/results/:id/text", h.getResultText);
    app.delete("/results/:id", h.deleteResult);
    app.get("/quota", h.getQuota);
}
