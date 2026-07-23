/**
 * 본인인증 키 유도 유틸리티
 *
 * 범용 암복호화 함수는 @system/crypto/cipher.ts 를 사용한다.
 * 여기에는 프로바이더별 키 유도 로직만 둔다.
 */

import { sha256, sha256Hex } from "@system/api";

// system/crypto/cipher.ts 의 함수들을 re-export (기존 import 호환)
export {
    encryptAesCbc,
    decryptAesCbc,
    encrypt3DesCbc,
    decrypt3DesCbc,
    hmacSha256,
} from "@system/api";

// ── 키 유도 ──

/** NICE 토큰 값에서 AES-128 키(16B)와 IV(16B)를 유도한다 */
export function deriveNiceKeyIV(tokenVal: string): { key: Buffer; iv: Buffer } {
    const hash = sha256(tokenVal);
    return { key: hash.subarray(0, 16), iv: hash.subarray(16) };
}

/** KMC cert_key에서 3DES 키(24B)와 IV(8B)를 유도한다 */
export function deriveKmcKey(certKey: string): { key: Buffer; iv: Buffer } {
    const hash = sha256(certKey);
    return { key: hash.subarray(0, 24), iv: hash.subarray(24, 32) };
}

/** Danal client_secret/client_id에서 AES-256 키(32B)와 IV(16B)를 유도한다 */
export function deriveDanalKey(
    clientSecret: string,
    clientId: string,
): { key: Buffer; iv: Buffer } {
    const keyHash = sha256(clientSecret);
    const ivHash = sha256(clientId);
    return { key: keyHash, iv: ivHash.subarray(0, 16) };
}

/** NICE HMAC-SHA256 무결성 키를 유도한다 (sha256(tokenVal + "HMAC"), 32B) */
export function deriveNiceHmacKey(tokenVal: string): Buffer {
    return sha256(tokenVal + "HMAC");
}

/** CI 값을 SHA-256으로 해시한다 */
export function hashCI(ci: string): string {
    return sha256Hex(ci);
}
