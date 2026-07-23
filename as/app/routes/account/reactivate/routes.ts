/**
 * 휴면 계정 재활성화 라우트
 *
 *   POST /v1/account/reactivate
 */

import type { FastifyInstance } from "fastify";
import { handleReactivate } from "./handlers.ts";

export default async function reactivatePlugin(
    app: FastifyInstance,
): Promise<void> {
    app.post("/", handleReactivate);
}
