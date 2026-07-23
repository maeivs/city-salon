/**
 * 알림톡 핸들러 구현
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";

/** 알림톡 발송 요청을 처리한다 */
export async function send(req: FastifyRequest, reply: FastifyReply) {
    const svc = req.server.alimtalkService;
    if (!svc)
        return reply.status(503).send(fail("Alimtalk service not available"));

    const body = req.body as Record<string, unknown> | undefined;
    const templateCode = String(body?.template_code ?? "");
    const receiver = String(body?.receiver ?? "");

    if (!templateCode || !receiver) {
        return reply
            .status(400)
            .send(fail("template_code and receiver are required"));
    }

    await svc.enqueueJob({
        templateCode,
        receiver,
        variables: (body?.variables ?? {}) as Record<string, string>,
        provider: String(body?.provider ?? ""),
        templateName: "",
        buttons: [],
        refEntity: "",
        refSeq: 0,
        msgSeq: 0,
    });

    return reply.status(202).send(ok({ message: "alimtalk queued" }));
}

/** 발송 상태를 조회한다 */
export async function getStatus(_req: FastifyRequest, reply: FastifyReply) {
    return reply.status(501).send(fail("not implemented yet"));
}

/** 등록된 템플릿 목록을 조회한다 */
export async function listTemplates(req: FastifyRequest, reply: FastifyReply) {
    const svc = req.server.alimtalkService;
    if (!svc)
        return reply.status(503).send(fail("Alimtalk service not available"));

    const templates = svc.listTemplates();
    return ok({
        templates: templates.map((t) => ({
            code: t.templateCode,
            name: t.templateName,
            variables: t.variables,
        })),
        count: templates.length,
    });
}

/** 프로바이더 웹훅 콜백을 수신한다 */
export async function webhook(req: FastifyRequest, reply: FastifyReply) {
    const svc = req.server.alimtalkService;
    if (!svc) return reply.status(200).send("OK");

    const provider = (req.params as Record<string, string>).provider ?? "";
    if (!provider) return reply.status(400).send("provider required");

    try {
        const rawBody =
            typeof req.body === "string"
                ? req.body
                : JSON.stringify(req.body ?? {});
        await svc.processWebhook(provider, rawBody);
    } catch (err) {
        req.server.log.warn(
            err,
            `Alimtalk webhook callback (${provider}) error`,
        );
    }

    // 프로바이더 재시도 방지 — 항상 200 반환
    return reply.status(200).send("OK");
}
