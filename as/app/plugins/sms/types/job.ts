/**
 * SMS Job / Log 타입 정의
 *
 * Go 엔티티서버 `internal/sms/types.go`에서 포팅
 */

export interface SmsJob {
    /** 프로바이더 driver (빈 문자열이면 config.default 사용) */
    provider: string;
    receiver: string;
    /** 발신번호 (빈 문자열이면 config.sender 사용) */
    sender: string;
    content: string;
    /** LMS/MMS용 제목 */
    subject: string;
    /** "sms" | "lms" | "mms" (빈 값 → 자동 판정) */
    msg_type: string;
    /** MMS 이미지 URL */
    image_url: string;
    ref_entity: string;
    ref_seq: number;
    /** sms_msg 참조 시퀀스 */
    sms_msg_seq: number;
}

export interface PendingSmsLog {
    log_seq: number;
    provider: string;
    sender: string;
    receiver: string;
    content: string;
    subject: string;
    msg_type: string;
    image_url: string;
    retry_count: number;
    sms_msg_seq: number;
}

export interface SendRequest {
    type: string;
    sender: string;
    receiver: string;
    subject: string;
    content: string;
    image_url: string;
}

export interface SendResult {
    provider_msg_id: string;
    status_code: string;
}
