import type { FastifyReply, FastifyRequest } from "fastify";
import { fail } from "@system/api";
import { PgConflictError, PgError, PgNotFoundError } from "../types/index.ts";

/** pg 서비스 사용 가능 여부를 확인한다. */
export function ensureSvc(request: FastifyRequest, reply: FastifyReply) {
    const service = (request.server as unknown as Record<string, unknown>)
        .pgService as import("../service.ts").PgService | null | undefined;
    if (!service) {
        reply.status(503).send(fail("PG service not available"));
        return null;
    }
    return service;
}

/** PG 에러를 HTTP 응답으로 변환한다. */
export function pgErrorResponse(reply: FastifyReply, err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof PgNotFoundError) {
        return reply.status(404).send(fail(message));
    }
    if (err instanceof PgConflictError) {
        return reply.status(409).send(fail(message));
    }
    if (err instanceof PgError) {
        return reply.status(502).send(fail(message));
    }
    return reply.status(400).send(fail(message));
}
