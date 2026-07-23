/**
 * POST /send — 인증 코드/링크 발송
 * sendVerification — 내부 발송 로직 (register 등 외부에서도 재사용 가능)
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, logger, sendEmail } from "@system/api";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");
import type {
    EmailVerifyConfig,
    VerificationSendBody,
} from "../types/index.ts";
import {
    generateNumericCode,
    generateRandomToken,
    hashVerificationValue,
} from "../verification-utils.ts";
import { MAX_EMAIL_LEN, isRateLimited, findAccountByEmail } from "./utils.ts";

export function createSendHandler(cfg: EmailVerifyConfig) {
    return async function handleSend(
        req: FastifyRequest<{ Body: VerificationSendBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const email = (req.body?.email ?? "").trim().toLowerCase();
        if (!email) {
            reply.code(400).send(fail("email is required"));
            return;
        }
        if (email.length > MAX_EMAIL_LEN) {
            reply.code(400).send(fail("email is too long"));
            return;
        }

        const method = req.body?.method ?? "code";
        if (method !== "code" && method !== "link") {
            reply.code(400).send(fail("method must be 'code' or 'link'"));
            return;
        }

        if (method === "link" && !cfg.link_base_url) {
            reply.code(400).send(fail("link_base_url is not configured"));
            return;
        }

        if (isRateLimited(email, cfg.rate_limit.per_email_per_hour)) {
            reply.code(429).send(fail("발송 제한 횟수를 초과했습니다."));
            return;
        }

        // 계정 조회 (열거 공격 방지 — 동일 응답)
        const account = await findAccountByEmail(email);
        if (!account || !account.seq) {
            reply.send(ok({ message: "인증 이메일을 발송했습니다." }));
            return;
        }

        if (account.email_verified) {
            reply.send(ok({ message: "이미 인증된 이메일입니다." }));
            return;
        }

        // 재발송 쿨다운 체크
        if (account.email_verify_expires_time) {
            const lastSentAt =
                new Date(account.email_verify_expires_time).getTime() -
                cfg.code_ttl_sec * 1000;
            const cooldownEnd = lastSentAt + cfg.resend_cooldown_sec * 1000;
            if (Date.now() < cooldownEnd) {
                reply
                    .code(429)
                    .send(
                        fail(
                            "재발송 쿨다운 중입니다. 잠시 후 다시 시도하세요.",
                        ),
                    );
                return;
            }
        }

        try {
            await sendVerification(cfg, account.seq, email, method);
        } catch (err) {
            logger.error({ err, email }, "Email verification send failed");
            // 열거 공격 방지 — 에러도 동일 응답
        }

        reply.send(ok({ message: "인증 이메일을 발송했습니다." }));
    };
}

/**
 * 공통: 인증 코드/링크 생성 + 저장 + 이메일 발송
 *
 * register 등 다른 라우트에서도 재사용 가능.
 * email-verify config를 주입받아 동일한 방식으로 발송한다.
 */
export async function sendVerification(
    cfg: EmailVerifyConfig,
    accountSeq: number,
    email: string,
    method: "code" | "link",
): Promise<void> {
    const expiresAt = new Date(
        Date.now() + cfg.code_ttl_sec * 1000,
    ).toISOString();
    const expiresMin = Math.ceil(cfg.code_ttl_sec / 60);

    if (method === "link") {
        const token = generateRandomToken();
        const tokenHash = hashVerificationValue(token);

        await entityServer.submit("account", {
            seq: accountSeq,
            email_verify_code: tokenHash,
            email_verify_expires_time: expiresAt,
            email_verify_attempts: 0,
        } as Record<string, unknown>);

        const activationUrl = `${cfg.link_base_url}?email=${encodeURIComponent(email)}&token=${token}`;
        await sendEmail({
            to: [email],
            subject: cfg.email_subject || "이메일 인증",
            templateDir: TEMPLATES_DIR,
            templateName: "verification_link",
            templateData: {
                activation_url: activationUrl,
                expires_in: `${expiresMin}분`,
                email,
            },
        });
    } else {
        const code = generateNumericCode(cfg.code_length || 6);
        const codeHash = hashVerificationValue(code);

        await entityServer.submit("account", {
            seq: accountSeq,
            email_verify_code: codeHash,
            email_verify_expires_time: expiresAt,
            email_verify_attempts: 0,
        } as Record<string, unknown>);

        await sendEmail({
            to: [email],
            subject: cfg.email_subject || "이메일 인증",
            templateDir: TEMPLATES_DIR,
            templateName: "verification",
            templateData: { code, expires_in: `${expiresMin}분`, email },
        });
    }

    logger.info({ accountSeq, method }, "Verification email sent");
}
