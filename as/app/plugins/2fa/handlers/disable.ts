/**
 * DELETE /v1/account/2fa
 *
 * 2FA 비활성화: JWT 인증 + 비밀번호(선택) + TOTP 코드 확인
 *
 * Go `HandleDisable` 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, sendEmail, logger } from "@system/api";
import type { TwoFactorConfig, TwoFactorDisableBody } from "../types.ts";
import {
    getAccountSeqFromJwt,
    getAccountBySeq,
    updateAccount,
    nowIsoString,
    TEMPLATES_DIR,
} from "./utils.ts";
import { verifyPassword } from "../../../routes/password-reset/password-utils.ts";
import { validateTOTP } from "../totp-utils.ts";

export function createDisableHandler(cfg: TwoFactorConfig) {
    return async function handleDisable(
        req: FastifyRequest<{ Body: TwoFactorDisableBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const accountSeq = getAccountSeqFromJwt(req);
        if (!accountSeq) {
            reply.code(401).send(fail("Not authenticated"));
            return;
        }

        const body = req.body ?? {};
        const code = (body.code ?? "").trim();
        if (!code) {
            reply.code(400).send(fail("code (TOTP) is required"));
            return;
        }

        const account = await getAccountBySeq(accountSeq);
        if (!account) {
            reply.code(500).send(fail("Internal server error"));
            return;
        }

        if (!account.totp_enabled) {
            reply.code(400).send(fail("2FA is not enabled"));
            return;
        }

        // 비밀번호 확인 (비밀번호가 있는 계정만)
        const hasPassword = Boolean(account.has_password);
        if (hasPassword) {
            const passwd = (body.passwd ?? "").trim();
            if (!passwd) {
                reply
                    .code(400)
                    .send(
                        fail("passwd is required for password-based accounts"),
                    );
                return;
            }
            const storedPasswd = account.passwd ?? "";
            if (!verifyPassword(passwd, storedPasswd)) {
                reply.code(401).send(fail("Invalid password"));
                return;
            }
        }

        // TOTP 코드 검증
        const secret = account.totp_secret ?? "";
        const valid = validateTOTP(
            secret,
            code,
            cfg.skew,
            cfg.code_digits,
            cfg.period_sec,
        );
        if (!valid) {
            reply.code(401).send(fail("Invalid TOTP code"));
            return;
        }

        // 2FA 비활성화
        await updateAccount(accountSeq, {
            totp_secret: null,
            totp_enabled: false,
            totp_enabled_time: null,
            totp_recovery_codes: null,
            totp_failed_attempts: 0,
            totp_locked_until: null,
        });

        // 비활성화 알림 이메일
        sendEmail({
            to: [account.email],
            subject: "2단계 인증 비활성화 알림",
            templateDir: TEMPLATES_DIR,
            templateName: "auth/2fa_disabled",
            templateData: {
                email: account.email,
                disabled_time: nowIsoString(),
                disabled_by: "본인 요청",
            },
        }).catch((err: unknown) =>
            logger.warn(
                { err },
                "2FA disable: failed to send notification email",
            ),
        );

        reply.code(200).send(ok({ message: "2FA가 비활성화되었습니다." }));
    };
}
