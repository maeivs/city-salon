/** 로그인 요청 바디 타입이다. */
export interface LoginBody {
    email?: string;
    passwd?: string;
}

/** 계정 조회 결과 행 타입이다. */
export interface LoginAccountRow {
    seq: number;
    email?: string;
    passwd?: string;
    temp_password_hash?: string | null;
    temp_password_issued_time?: string | null;
    password_reset_expires?: string | null;
    status?: string;
    rbac_role?: string;
    totp_enabled?: boolean;
}
