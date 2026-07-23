/**
 * 이메일 인증 — 요청/응답 타입 정의
 */

/* ──────────── 설정 ──────────── */

export interface EmailVerificationRateLimitConfig {
    /** 동일 이메일 시간당 최대 요청 수 (기본 5) */
    per_email_per_hour: number;
}

export interface EmailVerifyConfig {
    /** 기능 활성화 여부 */
    enabled: boolean;
    /** 미인증 계정 로그인 차단 여부 */
    required: boolean;
    /** 인증 코드 길이 (기본 6) */
    code_length: number;
    /** 코드/토큰 유효 시간(초), 기본 300 (5분) */
    code_ttl_sec: number;
    /** 최대 시도 횟수 (기본 5) */
    max_attempts: number;
    /** 재발송 쿨다운(초), 기본 60 */
    resend_cooldown_sec: number;
    /** 링크 인증 기본 URL (link 방식 전용) */
    link_base_url: string;
    /** Rate limit 설정 */
    rate_limit: EmailVerificationRateLimitConfig;
    /** 이메일 제목 */
    email_subject: string;
    /** 빌드 시 dist에 포함 여부 (기본: true, false면 배포에서 제외) */
    deploy?: boolean;
    /** 빌드 시 난독화 여부 */
    minify?: boolean;
}

/* ──────────── 요청 ──────────── */

export interface VerificationSendBody {
    email: string;
    /** "code" (기본값) | "link" */
    method?: "code" | "link";
}

export interface VerificationConfirmBody {
    email: string;
    code: string;
}

export interface VerificationActivateQuery {
    email: string;
    token: string;
    redirect?: string;
}

export interface EmailChangeBody {
    new_email: string;
    current_password?: string;
}

/* ──────────── Rate Limit 내부 ──────────── */

export interface RateLimitEntry {
    timestamps: number[];
}

/* ──────────── Account 엔티티 필드 ──────────── */

export interface AccountVerifyFields {
    seq: number;
    email?: string;
    email_verified?: boolean;
    email_verify_code?: string | null;
    email_verify_expires_time?: string | null;
    email_verify_attempts?: number | null;
    passwd?: string;
}
