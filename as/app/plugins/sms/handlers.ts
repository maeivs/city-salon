/**
 * SMS 라우트 핸들러
 *
 * Go 엔티티서버 `internal/handler/sms_handler.go`에서 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, BadRequestError } from "@system/api";
import type { SmsService } from "./service.ts";
import type { VerificationService } from "./verification.ts";

// 핸들러 팩토리에서 서비스 인스턴스를 주입받는다
let smsService: SmsService | null = null;
let verificationService: VerificationService | null = null;

export function initHandlers(
    sms: SmsService,
    verification: VerificationService | null,
): void {
    smsService = sms;
    verificationService = verification;
}

/** POST /v1/sms/send — SMS/LMS/MMS 발송 큐 등록 */
export async function handleSend(
    req: FastifyRequest<{
        Body: {
            provider?: string;
            sender?: string;
            receiver: string;
            content: string;
            subject?: string;
            image_url?: string;
            ref_entity?: string;
            ref_seq?: number;
        };
    }>,
    reply: FastifyReply,
): Promise<void> {
    if (!smsService) {
        reply.code(503).send(fail("SMS service not available"));
        return;
    }

    const body = req.body;
    if (!body.receiver) {
        throw new BadRequestError("receiver is required");
    }
    if (!body.content) {
        throw new BadRequestError("content is required");
    }

    await smsService.enqueueJob({
        provider: body.provider ?? "",
        sender: body.sender ?? "",
        receiver: body.receiver,
        content: body.content,
        subject: body.subject ?? "",
        msg_type: "",
        image_url: body.image_url ?? "",
        ref_entity: body.ref_entity ?? "",
        ref_seq: body.ref_seq ?? 0,
        sms_msg_seq: 0,
    });

    reply.send(ok({ message: "SMS queued for delivery" }));
}

/** GET /v1/sms/status/:seq — 발송 상태 조회 */
export async function handleStatus(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
): Promise<void> {
    // 상태 조회는 엔티티 API를 직접 사용하도록 안내
    reply.send(ok({
        message:
            "Use entity API: GET /v1/entity/sms_log/{seq} to check SMS delivery status",
    }));
}

/** POST /v1/sms/verification/send — 인증번호 발송 */
export async function handleVerificationSend(
    req: FastifyRequest<{
        Body: {
            phone: string;
            purpose?: string;
        };
    }>,
    reply: FastifyReply,
): Promise<void> {
    if (!verificationService) {
        reply.code(503).send(fail("SMS verification service not available"));
        return;
    }

    const body = req.body;
    if (!body.phone) {
        throw new BadRequestError("phone is required");
    }

    const purpose = body.purpose ?? "signup";
    const expiresIn = await verificationService.sendVerificationCode(
        body.phone,
        purpose,
    );

    reply.send(ok({ expires_in: expiresIn }));
}

/** POST /v1/sms/verification/verify — 인증번호 검증 */
export async function handleVerificationVerify(
    req: FastifyRequest<{
        Body: {
            phone: string;
            purpose?: string;
            code: string;
        };
    }>,
    reply: FastifyReply,
): Promise<void> {
    if (!verificationService) {
        reply.code(503).send(fail("SMS verification service not available"));
        return;
    }

    const body = req.body;
    if (!body.phone) {
        throw new BadRequestError("phone is required");
    }
    if (!body.code) {
        throw new BadRequestError("code is required");
    }

    const purpose = body.purpose ?? "signup";
    const result = await verificationService.verifyCode(
        body.phone,
        purpose,
        body.code,
    );

    if (!result.verified) {
        const status = result.error ? 400 : 401;
        const message = result.error ?? "invalid verification code";
        reply.code(status).send(fail(message));
        return;
    }

    reply.send(ok({ verified: true }));
}
