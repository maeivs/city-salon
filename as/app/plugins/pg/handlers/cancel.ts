import type { FastifyReply, FastifyRequest } from "fastify";
import { fail, ok } from "@system/api";
import { ensureSvc, pgErrorResponse } from "./common.ts";

/** 결제를 취소한다. */
export async function cancelPayment(
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

        const body = request.body as {
            cancel_reason?: string;
            cancel_amount?: number;
            refund_account?: {
                bank: string;
                account_number: string;
                holder_name: string;
            };
        };

        if (!body.cancel_reason) {
            return reply.status(400).send(fail("cancel_reason is required"));
        }

        const result = await service.cancelPayment(
            orderId,
            body.cancel_reason,
            body.cancel_amount,
            body.refund_account
                ? {
                      bank: body.refund_account.bank,
                      accountNumber: body.refund_account.account_number,
                      holderName: body.refund_account.holder_name,
                  }
                : undefined,
        );
        return ok(result);
    } catch (err) {
        return pgErrorResponse(reply, err);
    }
}
