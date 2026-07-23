/**
 * 이메일 인증 유틸리티
 *
 * Go `internal/security/verification.go` 호환:
 * - N자리 숫자 코드 생성 (crypto.randomInt)
 * - 32-byte hex 토큰 생성 (crypto.randomBytes)
 * - SHA-256 해시 + constant-time 비교
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * N자리 숫자 인증 코드를 생성한다.
 *
 * Go `security.GenerateNumericCode(length)` 호환
 * @example generateNumericCode(6) → "048291"
 */
export function generateNumericCode(length: number): string {
    const max = 10 ** length;
    const n = randomInt(max);
    return String(n).padStart(length, "0");
}

/**
 * 32-byte 랜덤 토큰을 생성한다 (링크 인증용).
 *
 * @returns 64자 hex 문자열
 */
export function generateRandomToken(): string {
    return randomBytes(32).toString("hex");
}

/**
 * 인증값(코드 또는 토큰)의 SHA-256 해시를 생성한다.
 */
export function hashVerificationValue(value: string): string {
    return createHash("sha256")
        .update(Buffer.from(value, "utf-8"))
        .digest("hex");
}

/**
 * 입력값과 저장된 SHA-256 해시를 constant-time으로 비교한다.
 *
 * Go `security.VerifyCode` 호환 (subtle.ConstantTimeCompare)
 */
export function verifyCode(input: string, storedHash: string): boolean {
    const inputHash = hashVerificationValue(input);
    try {
        return timingSafeEqual(
            Buffer.from(inputHash, "hex"),
            Buffer.from(storedHash, "hex"),
        );
    } catch {
        return false;
    }
}
