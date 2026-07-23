import type { FastifyReply, FastifyRequest } from "fastify";
import { ok } from "@system/api";
import { ensureSvc } from "./common.ts";

/** 클라이언트 SDK 설정을 반환한다. */
export async function getClientConfig(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const service = ensureSvc(request, reply);
    if (!service) return;

    const provider = (request.query as { provider?: string }).provider;
    const config = service.getClientConfig(provider);
    return ok(config);
}
