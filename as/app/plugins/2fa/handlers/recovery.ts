/**
 * POST /v1/account/2fa/recovery
 *
 * 복구 코드로 로그인: two_factor_token + 복구 코드 검증 → JWT 토큰 쌍 발급
 * 인증 불필요 (two_factor_token 사용)
 *
 * Go `HandleRecovery` 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, registerAuthenticatedSession } from "@system/api";
import type { TwoFactorConfig, TwoFactorRecoveryBody } from "../types.ts";
import {
    getAccountSeqFromTwoFactorToken,
    getAccountBySeq,
    checkLockout,
    incrementFailedAttempts,
    updateAccount,
    parseRecoveryHashes,
    issueTokenPair,
    isSecureRequest,
    setAuthCookies,
} from "./utils.ts";
import { verifyRecoveryCode } from "../totp-utils.ts";

export function createRecoveryHandler(cfg: TwoFactorConfig) {
    return async function handleRecovery(
        req: FastifyRequest<{ Body: TwoFactorRecoveryBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const body = req.body ?? {};
        const recoveryCode = (body.recovery_code ?? "").trim();

        if (!body.two_factor_token || !recoveryCode) {
            reply
                .code(400)
                .send(fail("two_factor_token and recovery_code are required"));
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

        // 복구 코드 해시 목록 파싱
        const hashes = parseRecoveryHashes(account);
        if (hashes.length === 0) {
            reply.code(400).send(fail("No recovery codes available"));
            return;
        }

        // 복구 코드 검증
        const { valid, remaining } = verifyRecoveryCode(recoveryCode, hashes);
        if (!valid) {
            await incrementFailedAttempts(accountSeq, account, cfg);
            reply.code(401).send(fail("Invalid recovery code"));
            return;
        }

        // 사용된 코드 제거 + 실패 횟수 리셋
        await updateAccount(accountSeq, {
            totp_recovery_codes: JSON.stringify(remaining),
            totp_failed_attempts: 0,
            totp_locked_until: null,
        });

        const tokenPair = await issueTokenPair(account, cfg);
        setAuthCookies(reply, tokenPair, cfg, isSecureRequest(req));
        await registerAuthenticatedSession(req, tokenPair.access_token);

        reply
            .header("X-Access-Token", tokenPair.access_token)
            .header("X-Refresh-Token", tokenPair.refresh_token)
            .code(200)
            .send(
                ok({
                    ...tokenPair,
                    remaining_recovery_codes: remaining.length,
                    message:
                        "복구 코드로 로그인했습니다. 새 복구 코드 생성을 권장합니다.",
                }),
            );
    };
}
