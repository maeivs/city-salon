/**
 * email-verify 공통 유틸리티
 *
 * - Rate Limit (인메모리 슬라이딩 윈도우)
 * - JWT에서 account_seq 추출
 * - account 엔티티 조회 헬퍼
 */

import type { FastifyRequest } from "fastify";
import { entityServer } from "@system/api";
import type { AccountVerifyFields, RateLimitEntry } from "../types/index.ts";

/* ──────────── 상수 ──────────── */

export const MAX_EMAIL_LEN = 320;
const HOUR_MS = 3_600_000;

/* ──────────── Rate Limit ──────────── */

const emailRateLimits = new Map<string, RateLimitEntry>();

export function isRateLimited(email: string, maxPerHour: number): boolean {
    const now = Date.now();
    const entry = emailRateLimits.get(email);
    if (!entry) {
        emailRateLimits.set(email, { timestamps: [now] });
        return false;
    }
    entry.timestamps = entry.timestamps.filter((t) => t > now - HOUR_MS);
    if (entry.timestamps.length >= maxPerHour) return true;
    entry.timestamps.push(now);
    return false;
}

// 5분마다 만료 항목 정리
const _cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of emailRateLimits) {
        entry.timestamps = entry.timestamps.filter((t) => t > now - HOUR_MS);
        if (entry.timestamps.length === 0) emailRateLimits.delete(key);
    }
}, 5 * 60_000);
if (_cleanup.unref) _cleanup.unref();

/* ──────────── 공통 유틸 ──────────── */

export function nowIsoString(): string {
    return new Date().toISOString();
}

/** JWT에서 account_seq 추출 (프록시 인증 헤더 기반) */
export function getAccountSeqFromJwt(req: FastifyRequest): number | null {
    const user = (req as unknown as Record<string, unknown>).user as
        | Record<string, unknown>
        | undefined;
    if (!user) return null;
    return Number(user.account_seq ?? user.seq ?? 0) || null;
}

export async function findAccountByEmail(
    email: string,
): Promise<AccountVerifyFields | null> {
    try {
        const result = await entityServer.find<AccountVerifyFields>("account", {
            email,
        });
        return result?.data ?? null;
    } catch {
        return null;
    }
}

export async function getAccountBySeq(
    seq: number,
): Promise<AccountVerifyFields | null> {
    try {
        const result = await entityServer.get<AccountVerifyFields>(
            "account",
            seq,
        );
        return result?.data ?? null;
    } catch {
        return null;
    }
}
