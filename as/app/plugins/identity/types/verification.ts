import type { ParsedUserAgent } from "@system/api";

/** 인증 요청 상태 */
export type VerificationStatus = "pending" | "verified" | "failed" | "expired";

/** 인증 목적 */
export type VerificationPurpose =
    | "signup"
    | "find_account"
    | "password_reset"
    | "adult_verify"
    | "identity_change";

/** 인증 방식 */
export type VerificationMethod = "popup" | "pass" | "sms";

/** 인증 중계사 */
export type ProviderName = "nice" | "kmc" | "danal";

/** 인증 수단 코드 (NICE) */
export type AuthType = "M" | "X" | "P";

/** 유효한 목적 집합 */
export const VALID_PURPOSES = new Set<string>([
    "signup",
    "find_account",
    "password_reset",
    "adult_verify",
    "identity_change",
]);

/** 인증 준비 요청 입력 */
export interface PrepareInput {
    requestId: string;
    returnUrl: string;
    method: string;
    purpose: string;
    ip: string;
    userAgent: string;
}

/** 인증 준비 요청 출력 */
export interface PrepareOutput {
    popupUrl: string;
    encData: string;
    schemeUrl?: string;
    tokenVersionId?: string;
    integrityValue?: string;
    tokenVal?: string;
}

/** 프로바이더에서 파싱된 원본 인증 결과 */
export interface VerificationResult {
    requestId: string;
    ci: string;
    di: string;
    name: string;
    birthDate: string;
    gender: string;
    carrier: string;
    phone: string;
    nationality: string;
    authType?: string;
}

/** DB에 저장되는 인증 요청 레코드 */
export interface VerificationRequest {
    seq: number;
    requestId: string;
    status: VerificationStatus;
    purpose: string;
    provider: string;
    ciHash: string;
    di: string;
    name: string;
    birthDate: string;
    gender: string;
    carrier: string;
    phone: string;
    nationality: string;
    accountSeq: number;
    ipAddress: string;
    userAgent: string;
    userAgentPlatform?: string;
    userAgentDeviceType?: string;
    userAgentBrowser?: string;
    userAgentBrowserVersion?: string;
    userAgentParsed?: ParsedUserAgent;
    verifiedAt: string;
    expiresAt: string;
    errorMessage: string;
    createdAt?: string;
}

/** 클라이언트에 반환되는 마스킹된 결과 */
export interface MaskedResult {
    status: string;
    name?: string;
    birthDate?: string;
    gender?: string;
    phone?: string;
    verifiedAt?: string;
    isDuplicate?: boolean;
    accountLinked?: boolean;
}
