/**
 * SmsQuerier — Entity Server 어댑터
 *
 * entity-server-client를 통해 sms_log, sms_msg 엔티티에 접근.
 * DB 큐 패턴: pending → processing → sent/failed
 *
 * Go 엔티티서버 `internal/sms/entity_adapter.go`에서 포팅
 *
 * Note: Go의 CompareAndSwap는 구현하지 않음.
 *       단일 Node.js 프로세스이므로 dispatch loop에서 순차 처리하여 동시성 문제 방지.
 */

import { entityServer, logger } from "@system/api";
import type { SmsQuerier, PendingSmsLog, VerificationQuerier } from "./types/index.ts";

export class SmsEntityAdapter implements SmsQuerier {
    constructor(private readonly maxRetries: number = 3) {}

    /** SMS 발송 로그를 등록한다 */
    async submitSmsLog(data: Record<string, unknown>): Promise<void> {
        await entityServer.submit("sms_log", data);
    }

    /** 대기 중인 SMS 로그를 조회·점유한다 */
    async claimPendingSmsLogs(limit: number): Promise<PendingSmsLog[]> {
        const resp = await entityServer.list("sms_log", {
            status: "pending",
            page: 1,
            limit,
            order: "seq",
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<string, unknown>[];
        const logs: PendingSmsLog[] = [];

        for (const item of items) {
            const seq = Number(item.seq ?? 0);
            if (seq <= 0) continue;

            // pending → processing (단일 프로세스이므로 CAS 대신 직접 갱신)
            try {
                await entityServer.submit("sms_log", {
                    seq,
                    status: "processing",
                });
                logs.push({
                    log_seq: seq,
                    provider: String(item.provider ?? ""),
                    sender: String(item.sender ?? ""),
                    receiver: String(item.receiver ?? ""),
                    content: String(item.content ?? ""),
                    subject: String(item.subject ?? ""),
                    msg_type: String(item.msg_type ?? ""),
                    image_url: String(item.image_url ?? ""),
                    retry_count: Number(item.retry_count ?? 0),
                    sms_msg_seq: Number(item.sms_msg_seq ?? 0),
                });
            } catch (err) {
                logger.warn(
                    { err, seq },
                    "SMS: failed to claim log, skipping",
                );
            }
        }

        return logs;
    }

    /** SMS 로그 상태를 갱신한다 */
    async updateSmsLogStatus(
        logSeq: number,
        status: string,
        providerMsgId: string,
        errMsg: string,
    ): Promise<void> {
        const data: Record<string, unknown> = {
            status,
            provider_msg_id: providerMsgId,
            error_message: errMsg,
        };
        if (status === "sent") {
            data.sent_at = "now()";
        }
        await entityServer.submit("sms_log", { seq: logSeq, ...data });
    }

    /** 서버 시작 시 stale processing 로그를 복구한다 */
    async resetStaleSmsLogs(): Promise<void> {
        const resp = await entityServer.list("sms_log", {
            status: "processing",
            page: 1,
            limit: 1000,
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<string, unknown>[];

        for (const item of items) {
            const seq = Number(item.seq ?? 0);
            const retryCount = Number(item.retry_count ?? 0);

            if (seq <= 0) continue;

            try {
                if (retryCount >= this.maxRetries) {
                    await entityServer.submit("sms_log", {
                        seq,
                        status: "failed",
                        error_message: "max retries exceeded (stale recovery)",
                    });
                } else {
                    await entityServer.submit("sms_log", {
                        seq,
                        status: "pending",
                        retry_count: retryCount + 1,
                    });
                }
            } catch (err) {
                logger.warn(
                    { err, seq },
                    "SMS: failed to reset stale log",
                );
            }
        }

        if (items.length > 0) {
            logger.info(
                `SMS: reset ${items.length} stale processing logs`,
            );
        }
    }

    /** sms_msg 상태를 갱신한다 */
    async updateSmsMsgStatus(
        msgSeq: number,
        status: string,
    ): Promise<void> {
        if (msgSeq <= 0) return;
        try {
            await entityServer.submit("sms_msg", { seq: msgSeq, status });
        } catch (err) {
            logger.warn(
                { err, msgSeq },
                "SMS: failed to update sms_msg status",
            );
        }
    }
}

/** SMS 인증번호 Entity Adapter */
export class SmsVerificationEntityAdapter implements VerificationQuerier {
    /** 인증번호 레코드를 등록하고 seq를 반환한다 */
    async submitVerification(
        data: Record<string, unknown>,
    ): Promise<number> {
        const resp = await entityServer.submit("sms_verification", data);
        return resp.seq ?? 0;
    }

    /** 대기 중인 인증번호 레코드를 조회한다 */
    async findPendingVerification(
        phone: string,
        purpose: string,
    ): Promise<Record<string, unknown> | null> {
        const resp = await entityServer.list("sms_verification", {
            phone,
            purpose,
            status: "pending",
            page: 1,
            limit: 1,
            order: "-seq",
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<string, unknown>[];
        return items[0] ?? null;
    }

    /** 인증번호 레코드를 갱신한다 */
    async updateVerification(
        seq: number,
        data: Record<string, unknown>,
    ): Promise<void> {
        await entityServer.submit("sms_verification", { seq, ...data });
    }

    /** 동일 전화번호+목적의 이전 pending 건을 모두 만료시킨다 */
    async expireOldVerifications(
        phone: string,
        purpose: string,
    ): Promise<void> {
        const resp = await entityServer.list("sms_verification", {
            phone,
            purpose,
            status: "pending",
            page: 1,
            limit: 100,
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<string, unknown>[];

        for (const item of items) {
            const seq = Number(item.seq ?? 0);
            if (seq <= 0) continue;
            try {
                await entityServer.submit("sms_verification", {
                    seq,
                    status: "expired",
                });
            } catch {
                // best-effort
            }
        }
    }
}
