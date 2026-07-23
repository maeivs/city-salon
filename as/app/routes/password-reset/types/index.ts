/**
 * 비밀번호 재설정 — 요청/응답 타입 정의
 */

/* ──────────── 설정 ──────────── */

export interface PasswordResetRateLimitConfig {
    /** 동일 이메일 시간당 최대 요청 수 (기본 5) */
    per_email_per_hour: number;
    /** 동일 IP 분당 최대 요청 수 (기본 10) */
    per_ip_per_minute: number;
}

export interface PasswordResetConfig {
    /** 기능 활성화 여부 */
    enabled: boolean;
    /**
     * 재설정 모드
     * - `"temp_password"`: 임시 비밀번호 발급 → 이메일 발송 (기본값, Go 호환)
     * - `"link"`: 토큰 기반 리셋 링크 → 이메일 발송 → 새 비밀번호 설정
     */
    mode: "temp_password" | "link";
    /** 임시 비밀번호 유효 시간(초), 기본 300 (5분) — temp_password 모드 전용 */
    temp_password_ttl_sec: number;
    /** 임시 비밀번호 길이, 기본 12 — temp_password 모드 전용 */
    temp_password_length: number;
    /** 리셋 링크 기본 URL (예: https://myapp.com/reset-password) — link 모드 전용 */
    link_base_url: string;
    /** 토큰 유효 시간(초), 기본 300 (5분) — link 모드 전용 */
    link_token_ttl_sec: number;
    /** Rate limit 설정 */
    rate_limit: PasswordResetRateLimitConfig;
    /** 이메일 제목 */
    email_subject: string;
    /** 빌드 시 dist에 포함 여부 (기본: true, false면 배포에서 제외) */
    deploy?: boolean;
    /** 빌드 시 난독화 여부 */
    minify?: boolean;
}

/* ──────────── 요청 ──────────── */

export interface PasswordResetRequestBody {
    email: string;
}

export interface PasswordResetVerifyBody {
    token: string;
    new_password: string;
}

export interface PasswordResetValidateParams {
    token: string;
}

/* ──────────── 응답 ──────────── */

export interface PasswordResetSuccessResponse {
    ok: boolean;
    message: string;
}

export interface PasswordResetValidateResponse {
    ok: boolean;
    valid: boolean;
    expires_in_sec?: number;
}

/* ──────────── Account 엔티티 필드 ──────────── */

export interface AccountResetFields {
    seq: number;
    email?: string;
    /** SHA-256+salt 해시 (Go 호환: "hex_hash.hex_salt") — temp_password 모드 */
    temp_password_hash?: string | null;
    /** 임시 비밀번호 발급 시각 (ISO 8601) — temp_password 모드 */
    temp_password_issued_time?: string | null;
    /** SHA-256(token) 해시 — link 모드 */
    password_reset_token?: string | null;
    /** 토큰 만료 시각 (ISO 8601) — link 모드 */
    password_reset_expires?: string | null;
    /** 비밀번호 해시 */
    passwd?: string;
    /** 비밀번호 변경 시각 */
    passwd_changed_time?: string;
    /** 비밀번호 강제 변경 플래그 */
    force_password_change?: boolean;
}

/* ──────────── Rate Limit 내부 ──────────── */

export interface RateLimitEntry {
    count: number;
    resetAt: number;
}
