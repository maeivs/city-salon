/**
 * 2FA (TOTP) 라우트 타입 정의
 */

export interface TwoFactorConfig {
    /** 2FA 기능 활성화 여부 */
    enabled: boolean;
    /** TOTP 발급자 이름 (Authenticator 앱에 표시) */
    issuer: string;
    /** 2FA 강제 대상 역할 목록 */
    enforce_roles: string[];
    /** TOTP 코드 자릿수 (기본 6) */
    code_digits: number;
    /** TOTP 주기 (초, 기본 30) */
    period_sec: number;
    /** 허용 시간 오차 (step 수, 기본 1) */
    skew: number;
    /** 복구 코드 개수 (기본 10) */
    recovery_code_count: number;
    /** setup_token TTL (초, 기본 300) */
    setup_token_ttl_sec: number;
    /** 최대 TOTP 검증 실패 횟수 (기본 5) */
    max_verify_attempts: number;
    /** 잠금 지속 시간 (초, 기본 300) */
    verify_lockout_sec: number;
    /** JWT 액세스 토큰 TTL (초) — Go jwt.json과 일치시킬 것 */
    jwt_access_ttl_sec: number;
    /** JWT 리프레시 토큰 TTL (초) */
    jwt_refresh_ttl_sec: number;
    /** JWT 발급자 */
    jwt_issuer: string;
}

/* ──────────── 계정 엔티티 필드 ──────────── */

export interface AccountTotpFields {
    seq: number;
    email: string;
    name?: string;
    rbac_role?: string;
    license_seq?: number;
    has_password?: boolean | number;
    passwd?: string;
    totp_enabled?: boolean;
    totp_secret?: string;
    totp_enabled_time?: string;
    totp_recovery_codes?: string;
    totp_failed_attempts?: number;
    totp_locked_until?: string;
}

/* ──────────── 요청 바디 ──────────── */

export interface SetupVerifyBody {
    code: string;
    setup_token?: string;
}

export interface TwoFactorVerifyBody {
    two_factor_token: string;
    code: string;
}

export interface TwoFactorRecoveryBody {
    two_factor_token: string;
    recovery_code: string;
}

export interface TwoFactorDisableBody {
    passwd?: string;
    code: string;
}

export interface RegenerateRecoveryBody {
    code: string;
}

/* ──────────── JWT 클레임 ──────────── */

export interface TwoFactorTokenClaims {
    purpose: "2fa_verify" | "2fa_setup";
    sub: string;
    exp: number;
    iat: number;
    iss?: string;
}

export interface AccessTokenClaims {
    email: string;
    name: string;
    rbac_role: string;
    license_seq: number;
    sub: string;
    exp: number;
    iat: number;
    iss?: string;
}
