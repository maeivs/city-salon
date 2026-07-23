import type { FastifyReply, FastifyRequest } from "fastify";
import { ok } from "@system/api";
import { ensureSvc } from "./common.ts";

/** PG사 웹훅을 수신한다. */
export async function handleWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const service = ensureSvc(request, reply);
    if (!service) return;

    try {
        const payload = Buffer.from(JSON.stringify(request.body));
        const signature =
            (request.headers["x-webhook-signature"] as string) ?? "";

        try {
            await service.handleWebhook(payload, signature);
        } catch (err) {
            request.log.warn({ err }, "pg: webhook processing failed");
        }

        return ok(null);
    } catch {
        return ok(null);
    }
}
