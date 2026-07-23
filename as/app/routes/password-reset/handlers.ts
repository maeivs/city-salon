/**
 * 비밀번호 재설정 핸들러
 *
 * Go `internal/handler/password_reset_handler.go`에서 포팅.
 *
 * 두 가지 모드 지원 (config.mode):
 * 1. "temp_password" — 임시 비밀번호 발급 → 이메일 → /auth/login 으로 로그인
 * 2. "link" — 토큰 기반 리셋 링크 → 이메일 → /password-reset/verify 로 새 비밀번호 설정
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, logger, sendEmail } from "@system/api";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "templates");

import type {
    PasswordResetConfig,
    PasswordResetRequestBody,
    PasswordResetVerifyBody,
    PasswordResetValidateParams,
    AccountResetFields,
    RateLimitEntry,
} from "./types/index.ts";

import {
    hashPassword,
    generateTempPassword,
    generateResetToken,
    hashToken,
    verifyPassword,
} from "./password-utils.ts";

/* ──────────── Rate Limit (인메모리) ──────────── */

const emailLimits = new Map<string, RateLimitEntry>();
const ipLimits = new Map<string, RateLimitEntry>();

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** 오래된 항목 자동 정리 (5분마다) */
function cleanupLimits(): void {
    const now = Date.now();
    for (const [key, entry] of emailLimits) {
        if (entry.resetAt <= now) emailLimits.delete(key);
    }
    for (const [key, entry] of ipLimits) {
        if (entry.resetAt <= now) ipLimits.delete(key);
    }
}

const _cleanupInterval = setInterval(cleanupLimits, 5 * MINUTE_MS);
// Node.js가 이 타이머 때문에 종료 대기하지 않도록
if (_cleanupInterval.unref) _cleanupInterval.unref();

function isRateLimited(
    map: Map<string, RateLimitEntry>,
    key: string,
    maxCount: number,
    windowMs: number,
): boolean {
    const now = Date.now();
    const entry = map.get(key);
    if (!entry || entry.resetAt <= now) {
        map.set(key, { count: 1, resetAt: now + windowMs });
        return false;
    }
    entry.count++;
    return entry.count > maxCount;
}

/* ──────────── 공통 유틸 ──────────── */

/** 계정 열거 공격 방지 — 항상 동일한 성공 응답 */
const ALWAYS_SUCCESS = { ok: true, message: "요청이 처리되었습니다." };

function nowIsoString(): string {
    return new Date()
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .slice(0, 19);
}

function getClientIp(req: FastifyRequest): string {
    return (
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
        req.ip ??
        "unknown"
    );
}

/* ══════════════════════════════════════════════════════════════════════
 * POST /request — 비밀번호 재설정 요청
 * ════════════════════════════════════════════════════════════════════ */
export function createRequestHandler(cfg: PasswordResetConfig) {
    return async function handlePasswordResetRequest(
        req: FastifyRequest<{ Body: PasswordResetRequestBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const email = (req.body?.email ?? "").trim().toLowerCase();
        if (!email) {
            reply.code(400).send(fail("email is required"));
            return;
        }

        // Rate limit 확인
        const clientIp = getClientIp(req);
        if (
            isRateLimited(
                ipLimits,
                clientIp,
                cfg.rate_limit.per_ip_per_minute,
                MINUTE_MS,
            )
        ) {
            // 과도한 요청 — 하지만 열거 공격 방지를 위해 동일 응답
            logger.warn(
                { ip: clientIp },
                "Password reset IP rate limit exceeded",
            );
            reply.send(ALWAYS_SUCCESS);
            return;
        }
        if (
            isRateLimited(
                emailLimits,
                email,
                cfg.rate_limit.per_email_per_hour,
                HOUR_MS,
            )
        ) {
            logger.warn({ email }, "Password reset email rate limit exceeded");
            reply.send(ALWAYS_SUCCESS);
            return;
        }

        // 계정 조회
        let account: Record<string, unknown> | null = null;
        try {
            const result = await entityServer.find<Record<string, unknown>>(
                "account",
                { email },
            );
            account = result?.data ?? null;
        } catch {
            // 계정 없음 → 동일 응답
        }

        if (!account || !account.seq) {
            reply.send(ALWAYS_SUCCESS);
            return;
        }
        const accountSeq = Number(account.seq);

        try {
            if (cfg.mode === "link") {
                await handleLinkMode(cfg, email, accountSeq);
            } else {
                await handleTempPasswordMode(cfg, email, accountSeq);
            }
        } catch (err) {
            logger.error({ err, email }, "Password reset request failed");
        }

        reply.send(ALWAYS_SUCCESS);
    };
}

/** temp_password 모드 핸들링 */
async function handleTempPasswordMode(
    cfg: PasswordResetConfig,
    email: string,
    accountSeq: number,
): Promise<void> {
    const length = cfg.temp_password_length || 12;
    const ttlSec = cfg.temp_password_ttl_sec || 300;

    const tempPwd = generateTempPassword(length);
    const tempHash = hashPassword(tempPwd);

    // account 업데이트 (기존 비밀번호 유지)
    await entityServer.submit("account", {
        seq: accountSeq,
        temp_password_hash: tempHash,
        temp_password_issued_time: nowIsoString(),
    } as Record<string, unknown>);

    // 이메일 발송
    const expiresMin = Math.ceil(ttlSec / 60);
    await sendEmail({
        to: [email],
        subject: cfg.email_subject || "비밀번호 재설정",
        templateDir: TEMPLATES_DIR,
        templateName: "password_reset",
        templateData: {
            temp_password: tempPwd,
            expires_in: `${expiresMin}분`,
            email,
        },
    });

    logger.info({ accountSeq }, "Temp password issued");
}

/** link 모드 핸들링 */
async function handleLinkMode(
    cfg: PasswordResetConfig,
    email: string,
    accountSeq: number,
): Promise<void> {
    const ttlSec = cfg.link_token_ttl_sec || 300;

    const [rawToken, tokenHash] = generateResetToken();
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

    // account 업데이트
    await entityServer.submit("account", {
        seq: accountSeq,
        password_reset_token: tokenHash,
        password_reset_expires: expiresAt,
    } as Record<string, unknown>);

    // 리셋 URL 구성
    const baseUrl = cfg.link_base_url || "https://example.com/reset-password";
    const resetUrl = `${baseUrl}?token=${rawToken}`;
    const expiresMin = Math.ceil(ttlSec / 60);

    // 이메일 발송
    await sendEmail({
        to: [email],
        subject: cfg.email_subject || "비밀번호 재설정",
        templateDir: TEMPLATES_DIR,
        templateName: "password_reset_link",
        templateData: {
            reset_url: resetUrl,
            expires_in: `${expiresMin}분`,
            email,
        },
    });

    logger.info({ accountSeq }, "Password reset link issued");
}

/* ══════════════════════════════════════════════════════════════════════
 * GET /validate/:token — 토큰 유효성 확인 (link 모드 전용)
 * ════════════════════════════════════════════════════════════════════ */
export function createValidateHandler(cfg: PasswordResetConfig) {
    return async function handlePasswordResetValidate(
        req: FastifyRequest<{ Params: PasswordResetValidateParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        if (cfg.mode !== "link") {
            reply
                .code(404)
                .send(fail("This endpoint is available only in link mode"));
            return;
        }

        const { token } = req.params;
        if (!token || token.length !== 64) {
            reply.send(ok({ valid: false }));
            return;
        }

        const tokenH = hashToken(token);

        // token 해시로 account 조회
        let account: AccountResetFields | null = null;
        try {
            const result = await entityServer.find<AccountResetFields>(
                "account",
                {
                    password_reset_token: tokenH,
                },
            );
            account = result?.data ?? null;
        } catch {
            // not found
        }

        if (!account || !account.password_reset_expires) {
            reply.send(ok({ valid: false }));
            return;
        }

        const expiresAt = new Date(account.password_reset_expires).getTime();
        const now = Date.now();
        if (expiresAt <= now) {
            reply.send(ok({ valid: false }));
            return;
        }

        reply.send(
            ok({
                valid: true,
                expires_in_sec: Math.floor((expiresAt - now) / 1000),
            }),
        );
    };
}

/* ══════════════════════════════════════════════════════════════════════
 * POST /verify — 토큰 검증 + 새 비밀번호 설정 (link 모드 전용)
 * ════════════════════════════════════════════════════════════════════ */
export function createVerifyHandler(cfg: PasswordResetConfig) {
    return async function handlePasswordResetVerify(
        req: FastifyRequest<{ Body: PasswordResetVerifyBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        if (cfg.mode !== "link") {
            reply
                .code(404)
                .send(fail("This endpoint is available only in link mode"));
            return;
        }

        const token = req.body?.token ?? "";
        const newPassword = req.body?.new_password ?? "";

        if (!token || token.length !== 64) {
            reply.code(400).send(fail("유효하지 않은 토큰입니다."));
            return;
        }
        if (!newPassword || newPassword.length < 4) {
            reply.code(400).send(fail("새 비밀번호를 입력하세요."));
            return;
        }

        const tokenH = hashToken(token);

        // account 조회
        let account: AccountResetFields | null = null;
        try {
            const result = await entityServer.find<AccountResetFields>(
                "account",
                {
                    password_reset_token: tokenH,
                },
            );
            account = result?.data ?? null;
        } catch {
            reply.code(400).send(fail("유효하지 않은 토큰입니다."));
            return;
        }

        if (!account || !account.seq || !account.password_reset_expires) {
            reply.code(400).send(fail("유효하지 않은 토큰입니다."));
            return;
        }

        // 만료 확인
        const expiresAt = new Date(account.password_reset_expires).getTime();
        if (expiresAt <= Date.now()) {
            reply.code(400).send(fail("토큰이 만료되었습니다."));
            return;
        }

        // 새 비밀번호 해싱 (Go 호환)
        const newHash = hashPassword(newPassword);

        // account 업데이트 — 비밀번호 변경 + 토큰 삭제 + 강제변경 해제
        await entityServer.submit("account", {
            seq: account.seq,
            passwd: newHash,
            passwd_changed_time: nowIsoString(),
            force_password_change: false,
            has_password: true,
            password_reset_token: null,
            password_reset_expires: null,
        } as Record<string, unknown>);

        logger.info(
            { accountSeq: account.seq },
            "Password reset completed via link",
        );
        reply.send(ok({ message: "비밀번호가 변경되었습니다." }));
    };
}
