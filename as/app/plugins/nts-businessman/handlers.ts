import type { FastifyReply, FastifyRequest } from "fastify";
import { fail, ok } from "@system/api";

/** 국세청 사업자등록정보 서비스를 가져오거나 503 응답을 보낸다. */
function ensureService(request: FastifyRequest, reply: FastifyReply) {
    const service = request.server.ntsBusinessmanService;
    if (!service) {
        reply.status(503).send(fail("NTS businessman plugin not enabled"));
        return null;
    }
    return service;
}

/** 상태조회 요청을 처리한다. */
export async function handleStatus(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const service = ensureService(request, reply);
    if (!service) return;

    try {
        return ok(await service.status(request.body as any));
    } catch (err) {
        request.log.warn({ err }, "nts-businessman: status failed");
        const status =
            typeof (err as any)?.status === "number"
                ? (err as any).status
                : 400;
        return reply.status(status).send(fail((err as Error).message));
    }
}

/** 진위확인 요청을 처리한다. */
export async function handleValidate(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const service = ensureService(request, reply);
    if (!service) return;

    try {
        return ok(await service.validate(request.body as any));
    } catch (err) {
        request.log.warn({ err }, "nts-businessman: validate failed");
        const status =
            typeof (err as any)?.status === "number"
                ? (err as any).status
                : 400;
        return reply.status(status).send(fail((err as Error).message));
    }
}

/** 바로빌 상태조회 요청을 처리한다. */
export async function handleBarobillStatus(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const service = ensureService(request, reply);
    if (!service) return;

    try {
        return ok(await service.barobillStatus(request.body as any));
    } catch (err) {
        request.log.warn({ err }, "nts-businessman: barobill status failed");
        const status =
            typeof (err as any)?.status === "number"
                ? (err as any).status
                : 400;
        return reply.status(status).send(fail((err as Error).message));
    }
}
