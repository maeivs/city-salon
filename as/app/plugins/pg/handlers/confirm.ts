import type { FastifyReply, FastifyRequest } from "fastify";
import { fail, ok } from "@system/api";
import { ensureSvc, pgErrorResponse } from "./common.ts";

/** 결제를 승인한다. */
export async function confirmPayment(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const service = ensureSvc(request, reply);
    if (!service) return;

    try {
        const body = request.body as {
            payment_key?: string;
            order_id?: string;
            amount?: number;
            provider_payload?: Record<string, unknown>;
        };

        if (!body.order_id || !body.amount) {
            return reply
                .status(400)
                .send(fail("order_id and amount are required"));
        }

        const result = await service.confirmPayment(
            body.payment_key ?? "",
            body.order_id,
            body.amount,
            body.provider_payload,
        );
        return ok(result);
    } catch (err) {
        return pgErrorResponse(reply, err);
    }
}
