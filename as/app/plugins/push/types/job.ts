/**
 * Push 알림 작업·로그 타입 정의
 *
 * Go 엔티티서버 `internal/push/types.go` 에서 포팅
 */

/** 훅에서 생성하는 발송 작업 단위 */
export interface PushJob {
    /** 수신자 account seq */
    account_seq: number;
    /** 알림 제목 */
    title: string;
    /** 알림 본문 */
    body: string;
    /** 커스텀 페이로드 */
    data?: Record<string, string>;
    /** 트리거 엔티티명 */
    ref_entity?: string;
    /** 트리거 레코드 seq */
    ref_seq?: number;
    /** 특정 provider 지정 (없으면 default) */
    provider?: string;
}

/** DB 큐에서 가져온 미발송 push_log 레코드 */
export interface PendingPushLog {
    log_seq: number;
    account_seq: number;
    device_seq: number;
    /** 발송 채널: "fcm" | "apns" */
    platform: string;
    device_token: string;
    title: string;
    body: string;
    push_data?: Record<string, string>;
    ref_entity?: string;
    ref_seq?: number;
    retry_count: number;
    /** 특정 provider 이름 (지정된 경우) */
    provider?: string;
}

/** 디바이스 정보 */
export interface DeviceInfo {
    seq: number;
    account_seq: number;
    platform: string;
    push_token: string;
}

/** push_log DB 큐 인터페이스 */
export interface PushQuerier {
    /** 특정 계정의 push 활성 디바이스 목록 조회 */
    listDevicesForAccount(accountSeq: number): Promise<DeviceInfo[]>;
    /** push_log(pending) 레코드 생성 */
    submitPushLog(data: Record<string, unknown>): Promise<void>;
    /** pending 로그를 processing으로 claim하여 반환 */
    claimPendingPushLogs(limit: number): Promise<PendingPushLog[]>;
    /** push_log 상태 갱신 */
    updatePushLogStatus(
        logSeq: number,
        status: string,
        errMsg: string,
    ): Promise<void>;
    /** 서버 재시작 시 processing → pending 복구 */
    resetStalePushLogs(): Promise<void>;
    /** 만료된 토큰 디바이스 비활성화 */
    disableDeviceToken(deviceSeq: number): Promise<void>;
}

/** Push Provider 인터페이스 */
export interface PushProvider {
    send(
        deviceToken: string,
        title: string,
        body: string,
        data?: Record<string, string>,
    ): Promise<void>;
}
