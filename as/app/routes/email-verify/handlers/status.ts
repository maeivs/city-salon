/**
 * GET /status — 인증 상태 조회 (JWT 필요)
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";
import type { EmailVerifyConfig } from "../types/index.ts";
import { getAccountSeqFromJwt, getAccountBySeq } from "./utils.ts";

export function createStatusHandler(cfg: EmailVerifyConfig) {
    return async function handleStatus(
        req: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        const accountSeq = getAccountSeqFromJwt(req);
        if (!accountSeq) {
            reply.code(401).send(fail("인증이 필요합니다."));
            return;
        }

        const account = await getAccountBySeq(accountSeq);
        if (!account) {
            reply.code(404).send(fail("계정을 찾을 수 없습니다."));
            return;
        }

        let canResend = true;
        let resendAvailableAt: string | undefined;

        if (account.email_verify_expires_time) {
            const lastSentAt =
                new Date(account.email_verify_expires_time).getTime() -
                cfg.code_ttl_sec * 1000;
            const cooldownEnd = lastSentAt + cfg.resend_cooldown_sec * 1000;
            if (Date.now() < cooldownEnd) {
                canResend = false;
                resendAvailableAt = new Date(cooldownEnd).toISOString();
            }
        }

        reply.send(
            ok({
                email: account.email,
                email_verified: !!account.email_verified,
                required: cfg.required,
                can_resend: canResend,
                ...(resendAvailableAt
                    ? { resend_available_at: resendAvailableAt }
                    : {}),
            }),
        );
    };
}
