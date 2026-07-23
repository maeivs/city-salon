import type { FastifyReply, FastifyRequest } from "fastify";
import { fail, ok } from "@system/api";
import { ensureSvc, pgErrorResponse } from "./common.ts";

type AccountRequest = FastifyRequest & { account?: { seq?: number } };

/** 새 주문을 생성한다. */
export async function createOrder(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const service = ensureSvc(request, reply);
    if (!service) return;

    try {
        const body = request.body as {
            amount?: number;
            order_name?: string;
            currency?: string;
            customer_name?: string;
            customer_email?: string;
            provider?: string;
            metadata?: Record<string, unknown>;
        };

        const result = await service.createOrder({
            amount: body.amount ?? 0,
            orderName: body.order_name ?? "",
            currency: body.currency,
            customerName: body.customer_name,
            customerEmail: body.customer_email,
            provider: body.provider,
            accountSeq: (request as AccountRequest).account?.seq,
            metadata: body.metadata,
        });

        return reply.status(201).send(ok(result));
    } catch (err) {
        return pgErrorResponse(reply, err);
    }
}

/** 주문 정보를 조회한다. */
export async function getOrder(request: FastifyRequest, reply: FastifyReply) {
    const service = ensureSvc(request, reply);
    if (!service) return;

    try {
        const { orderId } = request.params as { orderId: string };
        if (!orderId) {
            return reply.status(400).send(fail("orderId is required"));
        }
        const result = await service.getOrder(orderId);
        return ok(result);
    } catch (err) {
        return pgErrorResponse(reply, err);
    }
}
