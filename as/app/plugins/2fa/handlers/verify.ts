/**
 * POST /v1/account/2fa/verify
 *
 * 로그인 2단계: two_factor_token + TOTP 코드 검증 → JWT 토큰 쌍 발급
 * 인증 불필요 (two_factor_token 사용)
 *
 * Go `HandleVerify` 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, registerAuthenticatedSession } from "@system/api";
import type { TwoFactorConfig, TwoFactorVerifyBody } from "../types.ts";
import {
    getAccountSeqFromTwoFactorToken,
    getAccountBySeq,
    checkLockout,
    incrementFailedAttempts,
    resetFailedAttempts,
    issueTokenPair,
    isSecureRequest,
    setAuthCookies,
} from "./utils.ts";
import { validateTOTP } from "../totp-utils.ts";

export function createVerifyHandler(cfg: TwoFactorConfig) {
    return async function handleVerify(
        req: FastifyRequest<{ Body: TwoFactorVerifyBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const body = req.body ?? {};
        const code = (body.code ?? "").trim();

        if (!body.two_factor_token || !code) {
            reply
                .code(400)
                .send(fail("two_factor_token and code are required"));
            return;
        }

        const accountSeq = getAccountSeqFromTwoFactorToken(
            body.two_factor_token,
            "2fa_verify",
        );
        if (!accountSeq) {
            reply.code(401).send(fail("Invalid or expired two-factor token"));
            return;
        }

        const account = await getAccountBySeq(accountSeq);
        if (!account) {
            reply.code(500).send(fail("Internal server error"));
            return;
        }

        // 잠금 상태 확인
        const lockMsg = checkLockout(account);
        if (lockMsg) {
            reply.code(429).send(fail(lockMsg));
            return;
        }

        const secret = account.totp_secret ?? "";
        if (!secret || secret === "<nil>") {
            reply
                .code(400)
                .send(fail("2FA is not configured for this account"));
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
            await incrementFailedAttempts(accountSeq, account, cfg);
            reply.code(401).send(fail("Invalid TOTP code"));
            return;
        }

        // 성공 → 실패 횟수 리셋 + JWT 발급
        await resetFailedAttempts(accountSeq);
        const tokenPair = await issueTokenPair(account, cfg);
        setAuthCookies(reply, tokenPair, cfg, isSecureRequest(req));
        await registerAuthenticatedSession(req, tokenPair.access_token);

        reply
            .header("X-Access-Token", tokenPair.access_token)
            .header("X-Refresh-Token", tokenPair.refresh_token)
            .code(200)
            .send(ok(tokenPair));
    };
}
