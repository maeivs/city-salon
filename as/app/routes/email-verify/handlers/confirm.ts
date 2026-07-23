/**
 * POST /confirm — 인증 코드 검증
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, logger } from "@system/api";
import type {
    EmailVerifyConfig,
    VerificationConfirmBody,
} from "../types/index.ts";
import { verifyCode } from "../verification-utils.ts";
import { findAccountByEmail } from "./utils.ts";
import { loadRegisterConfig } from "../../account/register/config-loader.ts";
import { sendWelcomeEmail } from "../../account/register/handlers.ts";

export function createConfirmHandler(cfg: EmailVerifyConfig) {
    return async function handleConfirm(
        req: FastifyRequest<{ Body: VerificationConfirmBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const email = (req.body?.email ?? "").trim().toLowerCase();
        const code = (req.body?.code ?? "").trim();

        if (!email || !code) {
            reply.code(400).send(fail("email과 code는 필수입니다."));
            return;
        }

        const account = await findAccountByEmail(email);
        if (!account || !account.seq || !account.email_verify_code) {
            reply.code(400).send(fail("인증 요청이 없습니다."));
            return;
        }

        if (account.email_verified) {
            reply.send(ok({ message: "이미 인증된 이메일입니다." }));
            return;
        }

        // 만료 확인
        if (
            !account.email_verify_expires_time ||
            new Date(account.email_verify_expires_time).getTime() <= Date.now()
        ) {
            reply.code(401).send(fail("인증 코드가 만료되었습니다."));
            return;
        }

        // 시도 횟수 초과
        const attempts = Number(account.email_verify_attempts ?? 0);
        if (attempts >= cfg.max_attempts) {
            reply.code(429).send(fail("최대 시도 횟수를 초과했습니다."));
            return;
        }

        // 코드 검증
        if (!verifyCode(code, account.email_verify_code)) {
            await entityServer.submit("account", {
                seq: account.seq,
                email_verify_attempts: attempts + 1,
            } as Record<string, unknown>);
            reply.code(401).send(fail("인증 코드가 일치하지 않습니다."));
            return;
        }

        // 인증 성공
        await entityServer.submit("account", {
            seq: account.seq,
            email_verified: true,
            email_verify_code: null,
            email_verify_expires_time: null,
            email_verify_attempts: null,
        } as Record<string, unknown>);

        logger.info({ accountSeq: account.seq, email }, "Email verified");

        // 인증 완료 → 환영 메일 (register config의 send_welcome_email이 true인 경우)
        const registerCfg = loadRegisterConfig();
        if (registerCfg.send_welcome_email) {
            sendWelcomeEmail(registerCfg, email).catch((err) =>
                logger.error({ err, email }, "Confirm: welcome email failed"),
            );
        }

        reply.send(ok({ message: "이메일 인증이 완료되었습니다." }));
    };
}
