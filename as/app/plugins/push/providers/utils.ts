/**
 * Push 프로바이더 공통 유틸리티
 */

/**
 * FCM 오류 메시지가 토큰 만료(등록 해제)인지 확인합니다.
 * Go `internal/push/fcm.go IsTokenExpiredError` 에서 포팅
 */
export function isFcmTokenExpiredError(msg: string): boolean {
    if (!msg) return false;
    const upper = msg.toUpperCase();
    return (
        upper.includes("NOT_FOUND") ||
        upper.includes("UNREGISTERED") ||
        upper.includes("INVALID_ARGUMENT")
    );
}

/**
 * APNs 오류 메시지가 토큰 만료(등록 해제)인지 확인합니다.
 * Go `internal/push/apns.go IsAPNsTokenExpiredError` 에서 포팅
 */
export function isApnsTokenExpiredError(msg: string): boolean {
    if (!msg) return false;
    return (
        msg.includes("BadDeviceToken") ||
        msg.includes("Unregistered") ||
        msg.includes("ExpiredToken")
    );
}
