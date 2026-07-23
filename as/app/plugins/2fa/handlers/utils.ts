/**
 * 2FA 공통 유틸리티
 *
 * - JWT 파싱/검증/발급 (two_factor_token, setup_token, token pair)
 * - account 엔티티 조회
 * - 잠금 상태 확인 / 실패 횟수 관리
 * - 복구 코드 해시 파싱
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    appendSetCookie,
    entityServer,
    issueAuthTokenPair,
    logger,
    serializeCookie,
} from "@system/api";
import { env } from "@system/api";
import type {
    TwoFactorConfig,
    AccountTotpFields,
    TwoFactorTokenClaims,
} from "../types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_DIR = join(__dirname, "..", "templates");

/* ──────────── account_seq 추출 ──────────── */

/** req.user(프록시 미들웨어)에서 account_seq 추출 */
export function getAccountSeqFromJwt(req: FastifyRequest): number | null {
    const user = (req as unknown as Record<string, unknown>).user as
        | Record<string, unknown>
        | undefined;
    if (!user) return null;
    return Number(user.account_seq ?? user.seq ?? 0) || null;
}

/**
 * two_factor_token / setup_token 검증 → account_seq 반환
 * purpose가 일치하지 않으면 null
 */
export function getAccountSeqFromTwoFactorToken(
    token: string,
    expectedPurpose: "2fa_verify" | "2fa_setup",
): number | null {
    try {
        const claims = jwt.verify(
            token,
            env.JWT_SECRET,
        ) as TwoFactorTokenClaims;
        if (claims.purpose !== expectedPurpose) return null;
        const seq = Number(claims.sub);
        return isFinite(seq) && seq > 0 ? seq : null;
    } catch {
        return null;
    }
}

/** two_factor_token 발급 */
export function generateTwoFactorToken(
    accountSeq: number,
    purpose: "2fa_verify" | "2fa_setup",
    ttlSec: number,
): string {
    return jwt.sign({ purpose }, env.JWT_SECRET, {
        subject: String(accountSeq),
        expiresIn: ttlSec,
    });
}

/** setup_token 발급 */
export function generateSetupToken(accountSeq: number, ttlSec: number): string {
    return generateTwoFactorToken(accountSeq, "2fa_setup", ttlSec);
}

export function isRoleEnforced(cfg: TwoFactorConfig, role: string): boolean {
    const normalizedRole = role.trim().toLowerCase();
    return cfg.enforce_roles.some(
        (item) => item.trim().toLowerCase() === normalizedRole,
    );
}

/* ──────────── Access/Refresh 토큰 발급 ──────────── */

/** JTI 생성 (refresh token용) */
function generateJTI(): string {
    return randomBytes(16).toString("hex");
}

export interface TokenPair {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

export function isSecureRequest(req: FastifyRequest): boolean {
    const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "")
        .split(",")[0]
        .trim()
        .toLowerCase();
    return forwardedProto === "https" || req.protocol === "https";
}

export function setAuthCookies(
    reply: FastifyReply,
    tokenPair: TokenPair,
    cfg: TwoFactorConfig,
    secure: boolean,
): void {
    appendSetCookie(
        reply,
        serializeCookie("token_access", tokenPair.access_token, {
            httpOnly: true,
            sameSite: "lax",
            secure,
            path: "/",
            maxAge: tokenPair.expires_in,
        }),
    );

    appendSetCookie(
        reply,
        serializeCookie("token_refresh", tokenPair.refresh_token, {
            httpOnly: true,
            sameSite: "lax",
            secure,
            path: "/",
            maxAge: cfg.jwt_refresh_ttl_sec,
        }),
    );
}

/** Go GenerateTokenPair과 동일한 방식으로 JWT 토큰 쌍 발급 */
export function issueTokenPair(
    account: AccountTotpFields,
    cfg: TwoFactorConfig,
): Promise<TokenPair> {
    return issueAuthTokenPair(account, cfg);
}

/* ──────────── account 엔티티 조회 ──────────── */

export async function getAccountBySeq(
    seq: number,
): Promise<AccountTotpFields | null> {
    try {
        const res = await entityServer.get<AccountTotpFields>("account", seq);
        return res?.data ?? null;
    } catch (err) {
        logger.error({ err, seq }, "2FA: getAccountBySeq failed");
        return null;
    }
}

/* ──────────── 잠금 처리 ──────────── */

/** 잠금 상태 확인. 잠겨 있으면 에러 메시지 반환 */
export function checkLockout(account: AccountTotpFields): string | null {
    if (!account.totp_locked_until) return null;
    const lockedUntil = new Date(account.totp_locked_until).getTime();
    const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
    if (remaining > 0) {
        return `Too many failed attempts. Try again in ${remaining} seconds.`;
    }
    return null;
}

/** 실패 횟수 증가 + 임계치 초과 시 잠금 */
export async function incrementFailedAttempts(
    accountSeq: number,
    account: AccountTotpFields,
    cfg: TwoFactorConfig,
): Promise<void> {
    const failed = (Number(account.totp_failed_attempts) || 0) + 1;
    const update: Record<string, unknown> = { totp_failed_attempts: failed };

    if (failed >= cfg.max_verify_attempts) {
        const lockUntil = new Date(Date.now() + cfg.verify_lockout_sec * 1000)
            .toISOString()
            .replace("T", " ")
            .replace("Z", "")
            .slice(0, 19);
        update.totp_locked_until = lockUntil;
        logger.warn(
            { accountSeq, failed },
            "2FA: account locked due to failed attempts",
        );
    }

    await updateAccount(accountSeq, update);
}

/** 실패 횟수 리셋 */
export async function resetFailedAttempts(accountSeq: number): Promise<void> {
    await updateAccount(accountSeq, {
        totp_failed_attempts: 0,
        totp_locked_until: null,
    });
}

/* ──────────── account 업데이트 ──────────── */

export async function updateAccount(
    seq: number,
    data: Record<string, unknown>,
): Promise<void> {
    try {
        await entityServer.submit("account", { seq, ...data });
    } catch (err) {
        logger.error({ err, seq }, "2FA: updateAccount failed");
    }
}

/* ──────────── 복구 코드 해시 파싱 ──────────── */

export function parseRecoveryHashes(account: AccountTotpFields): string[] {
    const raw = account.totp_recovery_codes ?? "";
    if (!raw || raw === "<nil>") return [];
    try {
        return JSON.parse(raw) as string[];
    } catch {
        return [];
    }
}

/* ──────────── 공통 유틸 ──────────── */

export function nowIsoString(): string {
    return new Date()
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .slice(0, 19);
}
