/**
 * 전자세금계산서 핸들러 구현
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";

/** 세금계산서 서비스 사용 가능 여부를 확인한다 */
const ensureSvc = (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.server.taxInvoiceService) {
        reply.status(503).send(fail("TaxInvoice service not available"));
        return null;
    }
    return req.server.taxInvoiceService;
};

/** 세금계산서 등록 및 즉시 발행을 요청한다 */
export async function registIssue(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;
    try {
        const body = request.body as any;
        const result = await svc.registIssue(body);
        return ok(result);
    } catch (err) {
        return reply
            .status(500)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** 세금계산서 임시 저장을 요청한다 */
export async function register(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;
    try {
        const body = request.body as any;
        const result = await svc.register(body);
        return ok(result);
    } catch (err) {
        return reply
            .status(500)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** 세금계산서 발행을 요청한다 */
export async function issue(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;
    try {
        const { seq } = request.params as { seq: string };
        const body = (request.body as any) ?? {};
        const result = await svc.issue(Number(seq), {
            force_issue: body.force_issue,
            memo: body.memo,
            send_sms: body.send_sms,
            send_email: body.send_email,
        });
        return ok(result);
    } catch (err) {
        return reply
            .status(500)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** 세금계산서 발행을 취소한다 */
export async function cancelIssue(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;
    try {
        const { seq } = request.params as { seq: string };
        const body = (request.body as any) ?? {};
        await svc.cancelIssue(Number(seq), body.memo ?? "");
        return ok({ seq: Number(seq), state: "issue_cancelled" });
    } catch (err) {
        return reply
            .status(500)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** 세금계산서 발행 상태를 조회한다 */
export async function getState(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;
    try {
        const { seq } = request.params as { seq: string };
        const result = await svc.getState(Number(seq));
        return ok(result);
    } catch (err) {
        return reply
            .status(500)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** 세금계산서 상세를 조회한다 */
export async function getDetail(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;
    try {
        const { seq } = request.params as { seq: string };
        const { EntityServerApi } = await import("entity-client");
        const es = new EntityServerApi();
        const resp = await es.get("tax_invoice", Number(seq));
        return ok(resp.data);
    } catch (err) {
        return reply
            .status(500)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}
