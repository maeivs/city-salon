/**
 * SMTP API 핸들러
 *
 * 앱 서버가 직접 처리하는 이유:
 *  - 로컬 템플릿(templates/*.html) 렌더링 후 body_html을 완성하여 Go 서버로 전달
 *  - 프록시 패스스루로는 앱 서버 로컬 파일에 접근 불가
 *
 * 라우트에 없는 /v1/smtp/* 경로는 proxy/register.ts가 Go 서버로 패스스루한다.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, sendEmail, entityServer } from "@system/api";
import type { SendEmailParams } from "@system/api";

// ─── 핸들러 ──────────────────────────────────────────────────────────────────

/**
 * POST /v1/smtp/send
 *
 * templateName이 지정되면 로컬 templates/ 에서 렌더링 후 Go 서버에 전달.
 * templateName 없이 body_html/body_text만 지정하면 그대로 전달.
 */
export async function handleSend(request: FastifyRequest, reply: FastifyReply) {
    const params = (request.body ?? {}) as SendEmailParams;

    if (!params.to || params.to.length === 0) {
        return reply.status(400).send(fail("to is required"));
    }

    const seq = await sendEmail(params);
    return ok({ seq });
}

/**
 * GET /v1/smtp/status/:seq
 *
 * Go 서버에 발송 상태를 조회한다.
 */
export async function handleStatus(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const { seq } = request.params as { seq: string };
    const seqNum = Number(seq);

    if (!seqNum || seqNum <= 0) {
        return reply.status(400).send(fail("Invalid seq"));
    }

    const result = await entityServer.smtpStatus(seqNum);
    return ok(result);
}
