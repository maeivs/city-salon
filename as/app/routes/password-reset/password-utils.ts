/**
 * 비밀번호 유틸리티 — Go 엔티티서버 `internal/security/password.go` 호환
 *
 * - SHA-256 + 16-byte salt 해싱 (형식: "hex(sha256(salt+pwd)).hex(salt)")
 * - 임시 비밀번호 생성 (혼동 문자 제외)
 * - 리셋 토큰 생성 (32-byte hex + SHA-256 해시)
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * 비밀번호를 SHA-256+salt 형식으로 해싱한다.
 *
 * Go 호환 형식: `hex(sha256(salt_bytes + password_bytes)).hex(salt_bytes)`
 * salt는 16바이트 랜덤
 */
export function hashPassword(password: string): string {
    const salt = randomBytes(16);
    const hash = createHash("sha256")
        .update(Buffer.concat([salt, Buffer.from(password, "utf-8")]))
        .digest("hex");
    return `${hash}.${salt.toString("hex")}`;
}

/**
 * 비밀번호를 해시와 비교한다 (constant-time).
 *
 * 지원 형식:
 * - `"hex_hash.hex_salt"` — SHA-256(salt + password)
 * - `"hex_hash"` (64자) — 레거시 SHA-256(password) 형식
 */
export function verifyPassword(password: string, storedHash: string): boolean {
    const parts = storedHash.split(".");
    if (parts.length === 2) {
        const [hashHex, saltHex] = parts;
        const salt = Buffer.from(saltHex!, "hex");
        const computed = createHash("sha256")
            .update(Buffer.concat([salt, Buffer.from(password, "utf-8")]))
            .digest("hex");
        try {
            return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hashHex!, "hex"));
        } catch {
            return false;
        }
    }
    // 레거시: 솔트 없는 SHA-256(password)
    if (storedHash.length === 64) {
        const computed = createHash("sha256")
            .update(Buffer.from(password, "utf-8"))
            .digest("hex");
        try {
            return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(storedHash, "hex"));
        } catch {
            return false;
        }
    }
    return false;
}

/**
 * 혼동 문자를 제외한 랜덤 임시 비밀번호를 생성한다.
 *
 * Go `security.GenerateTempPassword` 호환:
 * - 문자셋: `abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789`
 * - 제외: 0/O, 1/l/I
 */
export function generateTempPassword(length: number): string {
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const result: string[] = [];
    for (let i = 0; i < length; i++) {
        result.push(chars[randomInt(chars.length)]!);
    }
    return result.join("");
}

/**
 * 32-byte 랜덤 리셋 토큰을 생성한다.
 *
 * @returns [rawToken (64-char hex), sha256Hash (64-char hex)]
 */
export function generateResetToken(): [string, string] {
    const raw = randomBytes(32).toString("hex");
    const hash = createHash("sha256")
        .update(Buffer.from(raw, "utf-8"))
        .digest("hex");
    return [raw, hash];
}

/**
 * 토큰 원문으로부터 SHA-256 해시를 생성한다.
 */
export function hashToken(token: string): string {
    return createHash("sha256")
        .update(Buffer.from(token, "utf-8"))
        .digest("hex");
}
