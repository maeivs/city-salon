import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

/** 국세청 사업자등록정보 라우트를 등록한다. */
export default async function ntsBusinessmanRoutes(app: FastifyInstance) {
    app.post("/status", h.handleStatus);
    app.post("/barobill/status", h.handleBarobillStatus);
    app.post("/validate", h.handleValidate);
}
