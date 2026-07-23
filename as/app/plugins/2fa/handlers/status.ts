/**
 * GET /v1/account/2fa/status
 *
 * 현재 계정의 2FA 활성화 상태 조회
 * JWT 인증 필요
 *
 * Go `HandleStatus` 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";
import type { TwoFactorConfig } from "../types.ts";
import {
    getAccountSeqFromJwt,
    getAccountBySeq,
    parseRecoveryHashes,
} from "./utils.ts";

export function createStatusHandler(cfg: TwoFactorConfig) {
    return async function handleStatus(
        req: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        void cfg;
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

        const hashes = parseRecoveryHashes(account);

        reply.code(200).send(
            ok({
                enabled: Boolean(account.totp_enabled),
                enabled_time: account.totp_enabled_time ?? "",
                remaining_recovery_codes: hashes.length,
            }),
        );
    };
}
