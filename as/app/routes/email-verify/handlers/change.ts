/**
 * POST /change — 이메일 변경 + 재인증 (JWT 필요)
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, logger } from "@system/api";
import type { EmailVerifyConfig, EmailChangeBody } from "../types/index.ts";
import { verifyPassword } from "../../password-reset/password-utils.ts";
import {
    MAX_EMAIL_LEN,
    isRateLimited,
    getAccountSeqFromJwt,
    getAccountBySeq,
    findAccountByEmail,
} from "./utils.ts";
import { sendVerification } from "./send.ts";

export function createChangeHandler(cfg: EmailVerifyConfig) {
    return async function handleChange(
        req: FastifyRequest<{ Body: EmailChangeBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const accountSeq = getAccountSeqFromJwt(req);
        if (!accountSeq) {
            reply.code(401).send(fail("인증이 필요합니다."));
            return;
        }

        const newEmail = (req.body?.new_email ?? "").trim().toLowerCase();
        if (!newEmail) {
            reply.code(400).send(fail("new_email은 필수입니다."));
            return;
        }
        if (newEmail.length > MAX_EMAIL_LEN) {
            reply.code(400).send(fail("new_email is too long"));
            return;
        }

        const account = await getAccountBySeq(accountSeq);
        if (!account) {
            reply.code(404).send(fail("계정을 찾을 수 없습니다."));
            return;
        }

        // 비밀번호 확인 (OAuth 전용 계정이 아닌 경우)
        if (account.passwd) {
            const currentPwd = req.body?.current_password ?? "";
            if (!currentPwd) {
                reply.code(400).send(fail("현재 비밀번호가 필요합니다."));
                return;
            }
            if (!verifyPassword(currentPwd, account.passwd)) {
                reply.code(401).send(fail("비밀번호가 일치하지 않습니다."));
                return;
            }
        }

        // 동일 이메일 체크
        if (newEmail === String(account.email ?? "").toLowerCase()) {
            reply.code(400).send(fail("현재와 동일한 이메일입니다."));
            return;
        }

        // 중복 이메일 체크
        const existing = await findAccountByEmail(newEmail);
        if (existing) {
            reply.code(409).send(fail("이미 사용 중인 이메일입니다."));
            return;
        }

        // Rate limit
        if (isRateLimited(newEmail, cfg.rate_limit.per_email_per_hour)) {
            reply.code(429).send(fail("발송 제한 횟수를 초과했습니다."));
            return;
        }

        // 이메일 변경 + 인증 필드 초기화
        await entityServer.submit("account", {
            seq: accountSeq,
            email: newEmail,
            email_verified: false,
            email_verify_code: null,
            email_verify_expires_time: null,
            email_verify_attempts: 0,
        } as Record<string, unknown>);

        // 새 이메일로 인증 코드 발송
        try {
            await sendVerification(cfg, accountSeq, newEmail, "code");
        } catch (err) {
            logger.error(
                { err, email: newEmail },
                "Email change: verification send failed",
            );
        }

        reply.send(
            ok({
                message:
                    "이메일이 변경되었습니다. 새 이메일로 인증 코드를 발송했습니다.",
                email: newEmail,
                email_verified: false,
            }),
        );
    };
}
