/**
 * POST /v1/account/2fa/setup/verify
 *
 * 2FA 설정 확인: TOTP 코드 검증 → 2FA 활성화 + 복구 코드 생성
 * JWT 또는 setup_token 인증
 *
 * Go `HandleSetupVerify` 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, sendEmail, logger } from "@system/api";
import type { TwoFactorConfig, SetupVerifyBody } from "../types.ts";
import {
    getAccountSeqFromJwt,
    getAccountSeqFromTwoFactorToken,
    getAccountBySeq,
    updateAccount,
    nowIsoString,
    TEMPLATES_DIR,
} from "./utils.ts";
import { validateTOTP, generateRecoveryCodes } from "../totp-utils.ts";

export function createSetupVerifyHandler(cfg: TwoFactorConfig) {
    return async function handleSetupVerify(
        req: FastifyRequest<{ Body: SetupVerifyBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const body = req.body ?? {};
        const code = (body.code ?? "").trim();
        if (!code) {
            reply.code(400).send(fail("code is required"));
            return;
        }

        // 인증: JWT 또는 setup_token
        let accountSeq = getAccountSeqFromJwt(req);
        if (!accountSeq && body.setup_token) {
            accountSeq = getAccountSeqFromTwoFactorToken(
                body.setup_token,
                "2fa_setup",
            );
        }
        if (!accountSeq) {
            reply.code(401).send(fail("Not authenticated"));
            return;
        }

        const account = await getAccountBySeq(accountSeq);
        if (!account) {
            reply.code(500).send(fail("Internal server error"));
            return;
        }

        const secret = account.totp_secret ?? "";
        if (!secret || secret === "<nil>") {
            reply
                .code(400)
                .send(
                    fail(
                        "2FA setup not initiated. Call POST /v1/account/2fa/setup first.",
                    ),
                );
            return;
        }

        // TOTP 코드 검증
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

        // 복구 코드 생성
        const { plainCodes, hashes } = generateRecoveryCodes(
            cfg.recovery_code_count,
        );
        const enabledTime = nowIsoString();

        // 2FA 활성화
        await updateAccount(accountSeq, {
            totp_enabled: true,
            totp_enabled_time: enabledTime,
            totp_recovery_codes: JSON.stringify(hashes),
            totp_failed_attempts: 0,
            totp_locked_until: null,
        });

        // 복구 코드 이메일 발송
        sendEmail({
            to: [account.email],
            subject: "2단계 인증 복구 코드",
            templateDir: TEMPLATES_DIR,
            templateName: "auth/2fa_setup_complete",
            templateData: {
                email: account.email,
                recovery_codes: plainCodes.join("\n"),
                recovery_count: String(plainCodes.length),
                enabled_time: enabledTime,
            },
        }).catch((err: unknown) =>
            logger.warn(
                { err },
                "2FA setup: failed to send recovery codes email",
            ),
        );

        reply.code(200).send(
            ok({
                recovery_codes: plainCodes,
                message:
                    "복구 코드를 안전한 곳에 저장하세요. 이 코드는 다시 표시되지 않습니다.",
            }),
        );
    };
}
