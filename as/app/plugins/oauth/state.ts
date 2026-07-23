/**
 * OAuth CSRF state 토큰 생성 / 검증
 *
 * Go security/oauth.go GenerateState / ValidateState 와 동일한 방식:
 *   state = base64url(provider:nonce) + "." + hmac_sha256_hex
 *
 * 인메모리 Map에 codeVerifier 와 만료 시각을 함께 저장한다.
 * (다중 인스턴스 배포 시 Redis 등으로 교체 가능)
 */

import { createHmac, randomBytes, createHash } from "node:crypto";
import { getOAuthConfig, getStateSecret } from "./config.ts";

interface StateEntry {
    provider: string;
    codeVerifier: string;
    exp: number; // Unix ms
}

const stateStore = new Map<string, StateEntry>();

// 만료 엔트리 주기적 정리 (5분)
setInterval(
    () => {
        const now = Date.now();
        for (const [k, v] of stateStore) {
            if (v.exp < now) stateStore.delete(k);
        }
    },
    5 * 60 * 1000,
).unref();

function computeHmac(payload: string): string {
    return createHmac("sha256", getStateSecret()).update(payload).digest("hex");
}

/** PKCE code_verifier 생성 (32바이트 base64url) */
export function generateCodeVerifier(): string {
    return randomBytes(32).toString("base64url");
}

/** PKCE code_challenge (S256) */
export function codeChallenge(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
}

/** state 토큰 생성 — provider, codeVerifier 를 인메모리 맵에 저장 */
export function generateState(provider: string, codeVerifier: string): string {
    const nonce = randomBytes(16).toString("hex");
    const payload = `${provider.toLowerCase()}:${nonce}`;
    const mac = computeHmac(payload);
    const state = Buffer.from(payload).toString("base64url") + "." + mac;

    const ttlSec = getOAuthConfig()?.state_ttl_sec ?? 600;
    stateStore.set(state, {
        provider: provider.toLowerCase(),
        codeVerifier,
        exp: Date.now() + ttlSec * 1000,
    });
    return state;
}

/**
 * state 검증 → codeVerifier 반환
 * 검증 실패 시 Error throw
 */
export function validateState(
    state: string,
    expectedProvider: string,
): { codeVerifier: string } {
    const entry = stateStore.get(state);
    if (entry) stateStore.delete(state);
    if (!entry) throw new Error("unknown or already used state");
    if (entry.exp < Date.now()) throw new Error("state expired");

    // HMAC 검증
    const dotIdx = state.lastIndexOf(".");
    if (dotIdx < 0) throw new Error("invalid state format");
    const payloadB64 = state.slice(0, dotIdx);
    const mac = state.slice(dotIdx + 1);
    const payload = Buffer.from(payloadB64, "base64url").toString();
    if (!timingSafeEqual(mac, computeHmac(payload))) {
        throw new Error("state signature mismatch");
    }

    // 프로바이더 일치 확인
    const colonIdx = payload.indexOf(":");
    const stateProv = colonIdx >= 0 ? payload.slice(0, colonIdx) : "";
    if (stateProv !== expectedProvider.toLowerCase()) {
        throw new Error("state provider mismatch");
    }

    return { codeVerifier: entry.codeVerifier };
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    let result = 0;
    for (let i = 0; i < bufA.length; i++) {
        result |= bufA[i]! ^ bufB[i]!;
    }
    return result === 0;
}
