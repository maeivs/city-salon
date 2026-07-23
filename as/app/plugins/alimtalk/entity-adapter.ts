/**
 * AlimtalkQuerier — Entity Server 어댑터
 *
 * entity-server-client를 통해 alimtalk_log, alimtalk_msg 엔티티에 접근.
 * DB 큐 패턴: pending → processing → sent/failed/delivered
 *
 * Note: Go의 CompareAndSwap는 구현하지 않음.
 *       단일 Node.js 프로세스이므로 dispatch loop에서 순차 처리하여 동시성 문제 방지.
 */

import { entityServer } from "@system/api";
import { logger } from "@system/api";
import type { AlimtalkQuerier, PendingAlimtalkLog } from "./types/index.ts";

export class AlimtalkEntityAdapter implements AlimtalkQuerier {
    /** AlimtalkEntityAdapter를 초기화한다 */
    constructor(private readonly maxRetries: number = 3) {}

    /** 알림톡 발송 로그를 등록한다 */
    async submitAlimtalkLog(data: Record<string, unknown>): Promise<void> {
        await entityServer.submit("alimtalk_log", data);
    }

    /** 대기 중인 알림톡 로그를 조회·점유한다 */
    async claimPendingAlimtalkLogs(
        limit: number,
    ): Promise<PendingAlimtalkLog[]> {
        const resp = await entityServer.list("alimtalk_log", {
            status: "pending",
            page: 1,
            limit,
            order: "seq",
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<
            string,
            unknown
        >[];
        const logs: PendingAlimtalkLog[] = [];

        for (const item of items) {
            const seq = Number(item.seq ?? 0);
            if (seq <= 0) continue;

            // pending → processing (단일 프로세스이므로 CAS 대신 직접 갱신)
            try {
                await entityServer.submit("alimtalk_log", {
                    seq,
                    status: "processing",
                });
            } catch {
                continue; // 이미 다른 곳에서 처리 중 가능
            }

            logs.push({
                logSeq: seq,
                provider: String(item.provider ?? ""),
                templateCode: String(item.template_code ?? ""),
                templateName: String(item.template_name ?? ""),
                receiver: String(item.receiver ?? ""),
                variablesJSON: String(item.variables_json ?? ""),
                retryCount: Number(item.retry_count ?? 0),
                msgSeq: Number(item.alimtalk_msg_seq ?? 0),
            });
        }

        return logs;
    }

    /** 알림톡 발송 로그 상태를 갱신한다 */
    async updateAlimtalkLogStatus(
        logSeq: number,
        status: string,
        providerMsgId: string,
        errMsg: string,
    ): Promise<void> {
        const data: Record<string, unknown> = { seq: logSeq, status };
        if (providerMsgId) data.provider_msg_id = providerMsgId;
        if (errMsg) data.error_message = errMsg;
        if (status === "sent") data.sent_at = new Date().toISOString();

        await entityServer.submit("alimtalk_log", data);
    }

    /** 장기 처리 중인 알림톡 로그를 초기화한다 */
    async resetStaleAlimtalkLogs(): Promise<void> {
        const resp = await entityServer.list("alimtalk_log", {
            status: "processing",
            page: 1,
            limit: 1000,
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<
            string,
            unknown
        >[];
        let resetCount = 0;

        for (const item of items) {
            const seq = Number(item.seq ?? 0);
            if (seq <= 0) continue;

            const retryCount = Number(item.retry_count ?? 0);

            if (retryCount >= this.maxRetries) {
                await entityServer
                    .submit("alimtalk_log", {
                        seq,
                        status: "failed",
                        error_message: "max retries exceeded (stale recovery)",
                    })
                    .catch((err: unknown) =>
                        logger.error(
                            { err },
                            `Alimtalk: stale log update failed seq=${seq}`,
                        ),
                    );
                continue;
            }

            try {
                await entityServer.submit("alimtalk_log", {
                    seq,
                    status: "pending",
                });
                resetCount++;
            } catch {
                /* skip */
            }
        }

        if (resetCount > 0) {
            logger.info(
                `Alimtalk: reset ${resetCount} stale processing logs to pending`,
            );
        }
    }

    /** 알림톡 메시지 상태를 갱신한다 */
    async updateAlimtalkMsgStatus(
        msgSeq: number,
        status: string,
    ): Promise<void> {
        await entityServer.submit("alimtalk_msg", { seq: msgSeq, status });
    }

    /** 알림톡 발송 결과 웹훅을 반영한다 */
    async updateAlimtalkLogDelivery(
        providerMsgId: string,
        status: string,
        deliveredAt: string,
        errMsg: string,
    ): Promise<void> {
        // provider_msg_id로 alimtalk_log 검색
        const resp = await entityServer.list("alimtalk_log", {
            provider_msg_id: providerMsgId,
            page: 1,
            limit: 1,
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<
            string,
            unknown
        >[];
        if (items.length === 0) {
            throw new Error(
                `alimtalk delivery: log not found for provider_msg_id=${providerMsgId}`,
            );
        }

        const item = items[0];
        const logSeq = Number(item.seq ?? 0);
        if (logSeq <= 0) {
            throw new Error(
                `alimtalk delivery: invalid seq for provider_msg_id=${providerMsgId}`,
            );
        }

        const patch: Record<string, unknown> = { seq: logSeq, status };
        if (deliveredAt) patch.delivered_at = deliveredAt;
        if (errMsg) patch.error_message = errMsg;

        await entityServer.submit("alimtalk_log", patch);

        // alimtalk_msg 상태 갱신
        const msgSeq = Number(item.alimtalk_msg_seq ?? 0);
        if (msgSeq > 0) {
            await this.updateAlimtalkMsgStatus(msgSeq, status).catch((err) =>
                logger.warn(
                    { err },
                    `Alimtalk delivery: failed to update msg seq=${msgSeq}`,
                ),
            );
        }
    }
}
