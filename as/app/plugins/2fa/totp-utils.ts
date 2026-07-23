/**
 * TOTP (RFC 6238) + 복구 코드 유틸리티
 *
 * Go `internal/security/totp.go`에서 포팅.
 * Node.js 내장 crypto 모듈만 사용 (외부 의존성 없음).
 * QR코드 생성만 `qrcode` 패키지 사용.
 */

import { createHmac, randomBytes, createHash } from "node:crypto";
import QRCode from "qrcode";

/* ──────────── Base32 ──────────── */

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 인코딩 (NoPadding, RFC 4648) */
function base32Encode(buf: Buffer): string {
    let result = "";
    let bits = 0;
    let value = 0;
    for (let i = 0; i < buf.length; i++) {
        value = (value << 8) | buf[i];
        bits += 8;
        while (bits >= 5) {
            result += BASE32_CHARS[(value >>> (bits - 5)) & 0x1f];
            bits -= 5;
        }
    }
    if (bits > 0) {
        result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
    }
    return result;
}

/** Base32 디코딩 (NoPadding, 대소문자 무시) */
function base32Decode(str: string): Buffer {
    const s = str.toUpperCase().replace(/=+$/, "");
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (let i = 0; i < s.length; i++) {
        const idx = BASE32_CHARS.indexOf(s[i]);
        if (idx === -1) continue; // 잘못된 문자 무시
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(output);
}

/* ──────────── TOTP ──────────── */

/**
 * HMAC-SHA1 기반 HOTP 코드 생성
 * Go `generateCode()` 포팅
 */
function generateHOTP(
    secretBytes: Buffer,
    step: bigint,
    digits: number,
): string {
    const stepBuf = Buffer.alloc(8);
    stepBuf.writeBigUInt64BE(BigInt(step));

    const mac = createHmac("sha1", secretBytes);
    mac.update(stepBuf);
    const sum = mac.digest();

    const offset = sum[sum.length - 1] & 0x0f;
    const code =
        ((sum[offset] & 0x7f) << 24) |
        ((sum[offset + 1] & 0xff) << 16) |
        ((sum[offset + 2] & 0xff) << 8) |
        (sum[offset + 3] & 0xff);

    const mod = Math.pow(10, digits);
    return String(code % mod).padStart(digits, "0");
}

/** 20바이트(160-bit) 랜덤 비밀 키 생성 → Base32 인코딩 */
export function generateSecret(): string {
    const secret = randomBytes(20);
    return base32Encode(secret);
}

/** otpauth:// URI 생성 */
export function generateOTPAuthURL(
    secret: string,
    email: string,
    issuer: string,
    digits: number,
    period: number,
): string {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${digits}&period=${period}`;
}

/**
 * TOTP 코드 검증 (skew 허용)
 * Go `ValidateTOTP()` 포팅
 */
export function validateTOTP(
    secret: string,
    code: string,
    skew: number,
    digits: number,
    period: number,
): boolean {
    let secretBytes: Buffer;
    try {
        secretBytes = base32Decode(secret);
    } catch {
        return false;
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    const currentStep = now / BigInt(period);

    for (let i = -skew; i <= skew; i++) {
        const step = currentStep + BigInt(i);
        const expected = generateHOTP(secretBytes, step, digits);
        if (expected === code.trim()) return true;
    }
    return false;
}

/**
 * otpauth URL → QR코드 data URI (PNG base64)
 * Go `GenerateSetupQR()` 포팅
 */
export async function generateSetupQR(
    otpauthURL: string,
    size = 256,
): Promise<string> {
    const dataURL = await QRCode.toDataURL(otpauthURL, {
        width: size,
        errorCorrectionLevel: "H",
    });
    return dataURL;
}

/* ──────────── 복구 코드 ──────────── */

/**
 * 복구 코드 N개 생성 (8자리 HEX)
 * Go `GenerateRecoveryCodes()` 포팅
 * 평문 코드 + SHA-256 해시 목록 반환
 */
export function generateRecoveryCodes(count: number): {
    plainCodes: string[];
    hashes: string[];
} {
    const plainCodes: string[] = [];
    const hashes: string[] = [];
    for (let i = 0; i < count; i++) {
        const b = randomBytes(4);
        const code = b
            .readUInt32BE(0)
            .toString(16)
            .padStart(8, "0")
            .toUpperCase();
        plainCodes.push(code);
        const hash = createHash("sha256").update(code).digest("hex");
        hashes.push(`sha256:${hash}`);
    }
    return { plainCodes, hashes };
}

/**
 * 복구 코드 검증
 * Go `VerifyRecoveryCode()` 포팅
 * 일치하면 해당 해시를 제거한 나머지 목록을 반환
 */
export function verifyRecoveryCode(
    code: string,
    hashes: string[],
): { valid: boolean; remaining: string[] } {
    const normalized = code.trim().toUpperCase();
    const inputHash = `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
    for (let i = 0; i < hashes.length; i++) {
        if (hashes[i] === inputHash) {
            const remaining = [...hashes.slice(0, i), ...hashes.slice(i + 1)];
            return { valid: true, remaining };
        }
    }
    return { valid: false, remaining: hashes };
}
