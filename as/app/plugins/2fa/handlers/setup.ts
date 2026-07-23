/**
 * POST /v1/account/2fa/setup
 *
 * 2FA 설정 시작: 비밀 키 + QR코드 생성 → setup_token 발급
 * JWT 인증 필요
 *
 * Go `HandleSetup` 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";
import type { TwoFactorConfig } from "../types.ts";
import {
    getAccountSeqFromJwt,
    getAccountBySeq,
    updateAccount,
    generateSetupToken,
} from "./utils.ts";
import {
    generateSecret,
    generateOTPAuthURL,
    generateSetupQR,
} from "../totp-utils.ts";

export function createSetupHandler(cfg: TwoFactorConfig) {
    return async function handleSetup(
        req: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        const accountSeq = getAccountSeqFromJwt(req);
        if (!accountSeq) {
            reply.code(401).send(fail("Not authenticated"));
            return;
        }

        const account = await getAccountBySeq(accountSeq);
        if (!account) {
            reply.code(500).send(fail("Internal server error"));
            return;
        }

        if (account.totp_enabled) {
            reply
                .code(409)
                .send(
                    fail(
                        "2FA is already enabled. Disable first to reconfigure.",
                    ),
                );
            return;
        }

        // 비밀 키 생성
        const secret = generateSecret();

        // otpauth URL 생성
        const otpauthURL = generateOTPAuthURL(
            secret,
            account.email,
            cfg.issuer,
            cfg.code_digits,
            cfg.period_sec,
        );

        // QR코드 생성
        let qrDataURI: string;
        try {
            qrDataURI = await generateSetupQR(otpauthURL, 256);
        } catch {
            reply.code(500).send(fail("Failed to generate QR code"));
            return;
        }

        // 비밀 키를 account에 임시 저장 (totp_enabled=false 상태)
        await updateAccount(accountSeq, { totp_secret: secret });

        // setup_token 발급
        const setupToken = generateSetupToken(
            accountSeq,
            cfg.setup_token_ttl_sec,
        );

        reply.code(200).send(
            ok({
                secret,
                qr_code: qrDataURI,
                otpauth_url: otpauthURL,
                setup_token: setupToken,
            }),
        );
    };
}
