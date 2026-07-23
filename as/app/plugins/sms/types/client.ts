/**
 * SMS 클라이언트(프로바이더) 인터페이스 + Querier 인터페이스
 *
 * Go 엔티티서버 `internal/sms/client.go`, `internal/sms/entity_adapter.go`에서 포팅
 */

import type { SendRequest, SendResult, PendingSmsLog } from "./job.ts";

/** SMS 프로바이더 클라이언트 인터페이스 */
export interface SmsClient {
    send(req: SendRequest): Promise<SendResult>;
    name(): string;
}

/** SMS DB 큐 어댑터 인터페이스 */
export interface SmsQuerier {
    submitSmsLog(data: Record<string, unknown>): Promise<void>;
    claimPendingSmsLogs(limit: number): Promise<PendingSmsLog[]>;
    updateSmsLogStatus(
        logSeq: number,
        status: string,
        providerMsgId: string,
        errMsg: string,
    ): Promise<void>;
    resetStaleSmsLogs(): Promise<void>;
    updateSmsMsgStatus(msgSeq: number, status: string): Promise<void>;
}

/** SMS 인증번호 DB 어댑터 인터페이스 */
export interface VerificationQuerier {
    submitVerification(data: Record<string, unknown>): Promise<number>;
    findPendingVerification(
        phone: string,
        purpose: string,
    ): Promise<Record<string, unknown> | null>;
    updateVerification(
        seq: number,
        data: Record<string, unknown>,
    ): Promise<void>;
    expireOldVerifications(phone: string, purpose: string): Promise<void>;
}
