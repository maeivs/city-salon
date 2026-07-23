/**
 * 회원가입(Register) 핸들러
 *
 * 흐름:
 *   1) 입력 검증 (email, password 필수 + 길이)
 *   2) 비밀번호 정책 검증 (password-policy.ts)
 *   3) 이메일 중복 확인 (entityServer.find)
 *   4) 비밀번호 해시 → account 엔티티 생성 (entityServer.submit)
 *   5) email-verify.enabled=true → email-verify의 sendVerification 호출 (중복 코드 없음)
 *      send_welcome_email=true    → 환영 메일 발송 (인증 메일과 병렬)
 *   6) 201 반환
 *
 * 기존 entity-server 회원가입 구현을 대체한다.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, logger, sendEmail } from "@system/api";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");
import { validatePassword } from "@system/api";
import { hashPassword } from "../../password-reset/password-utils.ts";
import { loadEmailVerifyConfig } from "../../email-verify/config-loader.ts";
import { sendVerification } from "../../email-verify/handlers/index.ts";
import type {
    RegisterConfig,
    RegisterBody,
    AccountFields,
} from "./types/index.ts";

/* ──────────── 상수 ──────────── */

const MAX_EMAIL_LEN = 320;
const MAX_PASSWD_LEN = 128;

/* ──────────── 유틸 ──────────── */

function nowIsoString(): string {
    return new Date().toISOString();
}

/* ──────────── 핸들러 팩토리 ──────────── */

export function createRegisterHandler(cfg: RegisterConfig) {
    return async function handleRegister(
        req: FastifyRequest<{ Body: RegisterBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const body = req.body ?? {};

        // ── 1. 입력 검증 ────────────────────────────────────────────────────
        const email = (body.email ?? "").trim().toLowerCase();
        const password = (body.password ?? "").trim();

        if (!email) {
            reply.code(400).send(fail("email is required"));
            return;
        }
        if (!password) {
            reply.code(400).send(fail("password is required"));
            return;
        }
        if (email.length > MAX_EMAIL_LEN) {
            reply.code(400).send(fail("email is too long"));
            return;
        }
        if (password.length > MAX_PASSWD_LEN) {
            reply.code(400).send(fail("password is too long"));
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            reply.code(400).send(fail("email format is invalid"));
            return;
        }

        // ── 2. 비밀번호 정책 검증 ────────────────────────────────────────────
        // validatePassword 내부에서 policy.enabled 확인
        const policyError = validatePassword(password);
        if (policyError) {
            reply.code(400).send(fail(policyError));
            return;
        }

        // ── 3. 이메일 중복 확인 ──────────────────────────────────────────────
        try {
            const existing = await entityServer.find<AccountFields>("account", {
                email,
            });
            if (existing?.data) {
                reply.code(409).send(fail("이미 사용 중인 이메일입니다."));
                return;
            }
        } catch {
            // find가 404를 던지면 중복 없는 것으로 처리
        }

        // ── 4. 계정 생성 ─────────────────────────────────────────────────────
        const passwdHash = hashPassword(password);

        // email-verify 설정을 미리 로드해서 email_verified 초기값 결정
        const emailVerifyCfg = loadEmailVerifyConfig();
        const willSendVerify = emailVerifyCfg.enabled;

        // 허용된 추가 필드 전달 (보안 필드는 제외)
        const blockedKeys = new Set([
            "email",
            "password",
            "passwd",
            "status",
            "rbac_role",
            "has_password",
            "email_verified",
            "seq",
            "email_verify_code",
            "email_verify_expires_time",
        ]);
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body)) {
            if (!blockedKeys.has(k)) extra[k] = v;
        }

        const submitData: Record<string, unknown> = {
            email,
            passwd: passwdHash,
            passwd_changed_time: nowIsoString(),
            status: "active",
            rbac_role: cfg.default_role,
            has_password: true,
            // 인증 메일을 보내면 false(미인증), 아니면 true(인증 불필요)
            email_verified: !willSendVerify,
            ...extra,
        };

        let newSeq: number;
        try {
            const result = await entityServer.submit("account", submitData);
            newSeq = result.seq;
            if (!newSeq) throw new Error("seq not returned");
        } catch (err) {
            logger.error({ email, err }, "Register: account creation failed");
            reply.code(500).send(fail("계정 생성에 실패했습니다."));
            return;
        }

        logger.info({ email, seq: newSeq }, "Register: account created");

        // ── 5. 이메일 발송 (비동기 — 응답을 블로킹하지 않음) ──────────────────
        const emailJobs: Promise<void>[] = [];

        if (willSendVerify) {
            // email-verify ON → 인증 메일 발송 (환영 메일은 인증 완료 후 confirm/activate에서 발송)
            const method: "code" | "link" = emailVerifyCfg.link_base_url
                ? "link"
                : "code";
            emailJobs.push(
                sendVerification(emailVerifyCfg, newSeq, email, method),
            );
        } else if (cfg.send_welcome_email) {
            // email-verify OFF → 인증 불필요, 즉시 환영 메일 발송
            emailJobs.push(
                sendWelcomeEmail(cfg, email, body.name as string | undefined),
            );
        }

        // 발송 실패는 로그만 남기고 201 응답에 영향 없음
        Promise.all(emailJobs).catch((err) =>
            logger.error(
                { email, seq: newSeq, err },
                "Register: email send failed",
            ),
        );

        // ── 6. 응답 ──────────────────────────────────────────────────────────
        reply.code(201).send(
            ok({
                seq: newSeq,
                email,
                email_verified: !willSendVerify,
            }),
        );
    };
}

/* ──────────── 환영 메일 발송 ──────────── */

export async function sendWelcomeEmail(
    cfg: RegisterConfig,
    email: string,
    name?: string,
): Promise<void> {
    try {
        await sendEmail({
            to: [email],
            subject: cfg.welcome_email_subject,
            templateDir: TEMPLATES_DIR,
            templateName: "welcome",
            templateData: { email, name: name ?? email },
            refEntity: "account",
        });
        logger.info({ email }, "Register: welcome email sent");
    } catch (err) {
        logger.error({ email, err }, "Register: sendWelcomeEmail failed");
        throw err;
    }
}
