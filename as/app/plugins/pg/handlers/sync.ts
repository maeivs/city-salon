import type { FastifyReply, FastifyRequest } from "fastify";
import { fail, ok } from "@system/api";
import { ensureSvc, pgErrorResponse } from "./common.ts";

/** PG사 결제 정보를 재조회하여 상태를 동기화한다. */
export async function syncPaymentStatus(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const service = ensureSvc(request, reply);
    if (!service) return;

    try {
        const { orderId } = request.params as { orderId: string };
        if (!orderId) {
            return reply.status(400).send(fail("orderId is required"));
        }
        const result = await service.syncStatus(orderId);
        return ok(result);
    } catch (err) {
        return pgErrorResponse(reply, err);
    }
}
