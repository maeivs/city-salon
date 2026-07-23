/**
 * GET /activate — 링크 클릭 인증
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, logger } from "@system/api";
import type {
    EmailVerifyConfig,
    VerificationActivateQuery,
} from "../types/index.ts";
import { verifyCode } from "../verification-utils.ts";
import { findAccountByEmail } from "./utils.ts";
import { loadRegisterConfig } from "../../account/register/config-loader.ts";
import { sendWelcomeEmail } from "../../account/register/handlers.ts";

export function createActivateHandler(cfg: EmailVerifyConfig) {
    return async function handleActivate(
        req: FastifyRequest<{ Querystring: VerificationActivateQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const email = ((req.query as VerificationActivateQuery).email ?? "")
            .trim()
            .toLowerCase();
        const token = (
            (req.query as VerificationActivateQuery).token ?? ""
        ).trim();
        const redirect = (req.query as VerificationActivateQuery).redirect;

        if (!email || !token) {
            reply.code(400).send(fail("email과 token은 필수입니다."));
            return;
        }

        const account = await findAccountByEmail(email);
        if (!account || !account.seq || !account.email_verify_code) {
            reply.code(400).send(fail("유효하지 않은 인증 링크입니다."));
            return;
        }

        if (account.email_verified) {
            if (redirect === "1" && cfg.link_base_url) {
                reply.redirect(`${cfg.link_base_url}?verified=1`);
                return;
            }
            reply.send(ok({ message: "이미 인증된 이메일입니다." }));
            return;
        }

        // 만료 확인
        if (
            !account.email_verify_expires_time ||
            new Date(account.email_verify_expires_time).getTime() <= Date.now()
        ) {
            reply.code(401).send(fail("인증 링크가 만료되었습니다."));
            return;
        }

        // 시도 횟수 확인 (링크 무차별 대입 방지)
        const attempts = Number(account.email_verify_attempts ?? 0);
        if (attempts >= cfg.max_attempts) {
            reply.code(429).send(fail("최대 시도 횟수를 초과했습니다."));
            return;
        }

        // 토큰 검증
        if (!verifyCode(token, account.email_verify_code)) {
            await entityServer.submit("account", {
                seq: account.seq,
                email_verify_attempts: attempts + 1,
            } as Record<string, unknown>);
            reply.code(401).send(fail("유효하지 않은 인증 링크입니다."));
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

        logger.info(
            { accountSeq: account.seq, email },
            "Email verified via link",
        );

        // 인증 완료 → 환영 메일 (register config의 send_welcome_email이 true인 경우)
        const registerCfg = loadRegisterConfig();
        if (registerCfg.send_welcome_email) {
            sendWelcomeEmail(registerCfg, email).catch((err) =>
                logger.error({ err, email }, "Activate: welcome email failed"),
            );
        }

        if (redirect === "1" && cfg.link_base_url) {
            reply.redirect(`${cfg.link_base_url}?verified=1`);
            return;
        }
        reply.send(ok({ message: "이메일 인증이 완료되었습니다." }));
    };
}
