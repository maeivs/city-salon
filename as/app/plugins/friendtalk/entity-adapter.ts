/**
 * FriendTalkQuerier — Entity Server 어댑터
 *
 * entity-server-client를 통해 friendtalk_log, friendtalk_msg 엔티티에 접근.
 */

import { entityServer } from "@system/api";
import { logger } from "@system/api";
import type {
    FriendTalkQuerier,
    PendingFriendTalkLog,
} from "../alimtalk/types/index.ts";

export class FriendTalkEntityAdapter implements FriendTalkQuerier {
    constructor(private readonly maxRetries: number = 3) {}

    /** 친구톡 발송 로그를 Entity Server에 등록한다 */
    async submitFriendTalkLog(data: Record<string, unknown>): Promise<void> {
        await entityServer.submit("friendtalk_log", data);
    }

    /** 대기 중인 친구톡 발송 로그를 일괄 조회·점유한다 */
    async claimPendingFriendTalkLogs(
        limit: number,
    ): Promise<PendingFriendTalkLog[]> {
        const resp = await entityServer.list("friendtalk_log", {
            status: "pending",
            page: 1,
            limit,
            order: "seq",
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<
            string,
            unknown
        >[];
        const logs: PendingFriendTalkLog[] = [];

        for (const item of items) {
            const seq = Number(item.seq ?? 0);
            if (seq <= 0) continue;

            try {
                await entityServer.submit("friendtalk_log", {
                    seq,
                    status: "processing",
                });
            } catch {
                continue;
            }

            logs.push({
                logSeq: seq,
                provider: String(item.provider ?? ""),
                msgType: String(item.msg_type ?? ""),
                receiver: String(item.receiver ?? ""),
                content: String(item.content ?? ""),
                imageUrl: String(item.image_url ?? ""),
                imageLink: String(item.image_link ?? ""),
                isAd:
                    String(item.is_ad) === "true" || String(item.is_ad) === "1",
                buttonsJSON: String(item.buttons_json ?? ""),
                carouselJSON: String(item.carousel_json ?? ""),
                itemsJSON: String(item.items_json ?? ""),
                header: String(item.header ?? ""),
                retryCount: Number(item.retry_count ?? 0),
                msgSeq: Number(item.friendtalk_msg_seq ?? 0),
            });
        }

        return logs;
    }

    /** 친구톡 발송 로그 상태를 갱신한다 */
    async updateFriendTalkLogStatus(
        logSeq: number,
        status: string,
        providerMsgId: string,
        errMsg: string,
    ): Promise<void> {
        const data: Record<string, unknown> = { seq: logSeq, status };
        if (providerMsgId) data.provider_msg_id = providerMsgId;
        if (errMsg) data.error_message = errMsg;
        if (status === "sent") data.sent_at = new Date().toISOString();

        await entityServer.submit("friendtalk_log", data);
    }

    /** 장기 처리 중인 친구톡 로그를 pending으로 초기화한다 */
    async resetStaleFriendTalkLogs(): Promise<void> {
        const resp = await entityServer.list("friendtalk_log", {
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
                    .submit("friendtalk_log", {
                        seq,
                        status: "failed",
                        error_message: "max retries exceeded (stale recovery)",
                    })
                    .catch((err: unknown) =>
                        logger.error(
                            { err },
                            `FriendTalk: stale log update failed seq=${seq}`,
                        ),
                    );
                continue;
            }

            try {
                await entityServer.submit("friendtalk_log", {
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
                `FriendTalk: reset ${resetCount} stale processing logs to pending`,
            );
        }
    }

    /** 친구톡 메시지 상태를 갱신한다 */
    async updateFriendTalkMsgStatus(
        msgSeq: number,
        status: string,
    ): Promise<void> {
        await entityServer.submit("friendtalk_msg", { seq: msgSeq, status });
    }
}
