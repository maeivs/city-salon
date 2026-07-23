/**
 * POST /v1/account/2fa/recovery/regenerate
 *
 * 복구 코드 재생성: JWT 인증 + TOTP 코드 확인
 *
 * Go `HandleRegenerateRecovery` 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, sendEmail, logger } from "@system/api";
import type { TwoFactorConfig, RegenerateRecoveryBody } from "../types.ts";
import {
    getAccountSeqFromJwt,
    getAccountBySeq,
    updateAccount,
    nowIsoString,
    TEMPLATES_DIR,
} from "./utils.ts";
import { validateTOTP, generateRecoveryCodes } from "../totp-utils.ts";

export function createRegenerateHandler(cfg: TwoFactorConfig) {
    return async function handleRegenerate(
        req: FastifyRequest<{ Body: RegenerateRecoveryBody }>,
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

        // 새 복구 코드 생성
        const { plainCodes, hashes } = generateRecoveryCodes(
            cfg.recovery_code_count,
        );

        await updateAccount(accountSeq, {
            totp_recovery_codes: JSON.stringify(hashes),
        });

        // 새 복구 코드 이메일 발송
        sendEmail({
            to: [account.email],
            subject: "2단계 인증 복구 코드 재생성",
            templateDir: TEMPLATES_DIR,
            templateName: "auth/2fa_recovery_regenerated",
            templateData: {
                email: account.email,
                recovery_codes: plainCodes.join("\n"),
                recovery_count: String(plainCodes.length),
                regenerated_time: nowIsoString(),
            },
        }).catch((err: unknown) =>
            logger.warn(
                { err },
                "2FA regenerate: failed to send recovery codes email",
            ),
        );

        reply.code(200).send(
            ok({
                recovery_codes: plainCodes,
                message: "기존 복구 코드가 모두 폐기되고 새로 생성되었습니다.",
            }),
        );
    };
}
