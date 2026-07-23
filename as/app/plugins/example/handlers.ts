/**
 * example API 핸들러
 *
 * 새 확장을 만들 때:
 *  1. example → 모듈명으로 교체
 *  2. 각 핸들러에 비즈니스 로직을 작성
 *  3. ensureSvc 패턴으로 서비스 비활성 시 503 반환
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

/** exampleService가 없으면 503을 반환하고 null을 리턴한다 */
const ensureSvc = (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.server.exampleService) {
        reply.status(503).send(fail("Example plugin not enabled"));
        return null;
    }
    return req.server.exampleService;
};

// ─── 핸들러 ──────────────────────────────────────────────────────────────────

/** GET / — 목록 조회 */
export async function handleList(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    // TODO: 쿼리 파라미터 파싱, 서비스 호출
    const items: unknown[] = [];
    return ok({ items, total: 0 });
}

/** GET /:seq — 단건 조회 */
export async function handleGet(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { seq } = request.params as { seq: string };
    if (!seq) {
        return reply.status(400).send(fail("seq is required"));
    }

    // TODO: 서비스 호출
    return reply.status(404).send(fail("not found"));
}

/** POST / — 생성 */
export async function handleCreate(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const body = (request.body ?? {}) as Record<string, unknown>;

    // TODO: 입력 검증, 서비스 호출
    return ok({ created: true });
}

/** PUT /:seq — 수정 */
export async function handleUpdate(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { seq } = request.params as { seq: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    // TODO: 입력 검증, 서비스 호출
    return ok({ updated: true });
}

/** DELETE /:seq — 삭제 */
export async function handleDelete(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { seq } = request.params as { seq: string };
    if (!seq) {
        return reply.status(400).send(fail("seq is required"));
    }

    // TODO: 서비스 호출
    return ok({ deleted: true });
}
