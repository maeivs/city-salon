/**
 * SMS 설정 타입 정의
 *
 * Go 엔티티서버 `internal/types/sms_config.go`에서 포팅
 */

export interface SmsConfig {
    enabled?: boolean;
    default: string; // 기본 프로바이더 driver 이름
    sender: string; // 글로벌 발신번호
    workers: number; // 워커 수 (기본 2)
    queue_size: number; // dispatch당 claim 수 (기본 200)
    dispatch_interval_sec: number; // 디스패치 주기 초 (기본 5)
    max_retries: number; // 최대 재시도 (기본 3)
    auto_lms: boolean; // 자동 LMS 판정 (기본 true)
    lms_threshold_bytes: number; // LMS 판정 바이트 임계값 (기본 80)
    providers: Record<string, SmsProviderConfig>; // 프로바이더 목록 (키=provider name)
    rate_limit?: SmsRateLimitConfig; // Rate limit
    verification?: SmsVerificationConfig; // 인증번호 설정
}

export interface SmsProviderConfig {
    driver: string;
    api_key?: string;
    api_secret?: string;
    user_id?: string;
    account?: string;
    app_key?: string;
    secret_key?: string;
    region?: string;
    access_key?: string;
    sender?: string;
}

export interface SmsRateLimitConfig {
    per_number_per_minute: number;
    per_minute: number;
    per_hour: number;
}

export interface SmsVerificationConfig {
    code_length: number;
    ttl_sec: number;
    max_attempts: number;
    cooldown_sec: number;
}
