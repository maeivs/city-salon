/**
 * 회원가입(Register) — 요청/응답 타입 정의
 */

/* ──────────── 설정 ──────────── */

export interface RegisterConfig {
    /** 기능 활성화 여부 (기본: true) */
    enabled: boolean;
    /**
     * 가입 환영 메일 발송 여부
     * 인증 이메일 발송 여부는 email-verify/config.json의 enabled 필드로 제어.
     */
    send_welcome_email: boolean;
    /** 가입 환영 메일 제목 */
    welcome_email_subject: string;
    /** 가입 허용 RBAC role (기본: "user") */
    default_role: string;
    /** 빌드 시 dist에 포함 여부 (기본: true, false면 배포에서 제외) */
    deploy?: boolean;
    /** 빌드 시 난독화 여부 */
    minify?: boolean;
}

/* ──────────── 요청 ──────────── */

export interface RegisterBody {
    /** 이메일 (필수) */
    email: string;
    /** 비밀번호 (필수) */
    password: string;
    /** 이름 (선택) */
    name?: string;
    /** 전화번호 (선택) */
    phone?: string;
    /** 추가 필드는 account 엔티티에 그대로 전달 */
    [key: string]: unknown;
}

/* ──────────── Account 엔티티 필드 ──────────── */

export interface AccountFields {
    seq: number;
    email?: string;
    email_verified?: boolean;
    email_verify_code?: string | null;
    email_verify_expires_time?: string | null;
    status?: string;
    rbac_role?: string;
}
