/**
 * Push 알림 설정 타입 정의
 *
 * Go 엔티티서버 `internal/types/push_config.go` 에서 포팅
 */

export interface PushConfig {
    enabled?: boolean;
    default: string; // 기본 프로바이더 이름
    workers: number; // 워커 수 (기본 2)
    queue_size: number; // dispatch당 claim 수 (기본 50)
    dispatch_interval_sec: number; // 디스패치 주기 초 (기본 5)
    max_retries: number; // 최대 재시도 (기본 3)
    providers: Record<string, PushProviderConfig>; // 프로바이더 목록 (키=provider name)
}

export type PushProviderConfig = FcmProviderConfig | ApnsProviderConfig;

export interface FcmProviderConfig {
    driver: "fcm";
    project_id: string; // Firebase 프로젝트 ID
    key_file: string; // 서비스 계정 JSON 파일 경로
}

export interface ApnsProviderConfig {
    driver: "apns";
    key_id: string; // APNs 인증 키 ID (.p8)
    team_id: string; // Apple Team ID
    bundle_id: string; // 앱 Bundle ID
    key_file: string; // .p8 키 파일 경로
    production?: boolean; // production 환경 여부 (false = sandbox)
}
