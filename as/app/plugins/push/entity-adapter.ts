/**
 * Push EntityAdapter — Entity Server 어댑터
 *
 * entity-server-client를 통해 push_log, account_device 엔티티에 접근.
 * DB 큐 패턴: pending → processing → sent/failed
 *
 * Go 엔티티서버 `internal/push/entity_adapter.go` 에서 포팅
 */

import { entityServer, logger } from "@system/api";
import type { PushQuerier, PendingPushLog, DeviceInfo } from "./types/index.ts";

/** 재시도 불가 오류 키워드 */
const NON_RETRY_KEYWORDS = [
    "not configured",
    "invalid argument",
    "not_found",
    "unregistered",
    "baddevicetoken",
    "expiredtoken",
    "invalid token",
];

/** 재시도 백오프: 10s × 2^(retryCount-1), max 10분 */
function retryBackoffMs(retryCount: number): number {
    if (retryCount <= 0) return 0;
    const shift = Math.min(retryCount - 1, 8);
    const ms = 10_000 * Math.pow(2, shift);
    return Math.min(ms, 10 * 60 * 1000);
}

/** stale processing 기준 시간 (ms) */
const STALE_AFTER_MS = 2 * 60 * 1000;

function shouldRetry(
    errMsg: string,
    retryCount: number,
    maxRetries: number,
): boolean {
    if (retryCount >= maxRetries) return false;
    const lower = errMsg.toLowerCase().trim();
    if (!lower) return true;
    for (const kw of NON_RETRY_KEYWORDS) {
        if (lower.includes(kw)) return false;
    }
    return true;
}

function truncateError(msg: string): string {
    return msg.length <= 500 ? msg : msg.slice(0, 500);
}

export class PushEntityAdapter implements PushQuerier {
    constructor(private readonly maxRetries: number = 3) {}

    /** 특정 계정의 push 활성 디바이스 목록을 조회한다 */
    async listDevicesForAccount(accountSeq: number): Promise<DeviceInfo[]> {
        const resp = await entityServer.list("account_device", {
            account_seq: accountSeq,
            push_enabled: true,
            page: 1,
            limit: 50,
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<
            string,
            unknown
        >[];
        const devices: DeviceInfo[] = [];

        for (const item of items) {
            const token = String(item.push_token ?? "");
            if (!token) continue;
            devices.push({
                seq: Number(item.seq ?? 0),
                account_seq: Number(item.account_seq ?? accountSeq),
                platform: String(item.platform ?? "fcm").toLowerCase(),
                push_token: token,
            });
        }
        return devices;
    }

    /** push_log(pending) 레코드를 생성한다 */
    async submitPushLog(data: Record<string, unknown>): Promise<void> {
        await entityServer.submit("push_log", data);
    }

    /** pending 로그를 processing으로 claim하여 반환한다 */
    async claimPendingPushLogs(limit: number): Promise<PendingPushLog[]> {
        const now = Date.now();

        // pending 조회
        const pendingResp = await entityServer.list("push_log", {
            status: "pending",
            page: 1,
            limit,
            order: "seq",
        } as any);

        // stale processing 조회 (오래된 것 포함)
        const processingResp = await entityServer.list("push_log", {
            status: "processing",
            page: 1,
            limit,
            order: "seq",
        } as any);

        const pending = ((pendingResp.data as any)?.items ?? []) as Record<
            string,
            unknown
        >[];
        const processing = ((processingResp.data as any)?.items ??
            []) as Record<string, unknown>[];

        const candidates: Record<string, unknown>[] = [...pending];

        // stale processing 추가 (2분 이상 경과한 것만)
        for (const item of processing) {
            const attemptTime = String(item.attempt_time ?? "");
            if (!attemptTime) {
                candidates.push(item);
                continue;
            }
            const dt = Date.parse(attemptTime);
            if (!isNaN(dt) && now - dt >= STALE_AFTER_MS) {
                candidates.push(item);
            }
        }

        const logs: PendingPushLog[] = [];

        for (const item of candidates) {
            if (logs.length >= limit) break;

            const seq = Number(item.seq ?? 0);
            if (seq <= 0) continue;

            const status = String(item.status ?? "");
            const retryCount = Number(item.retry_count ?? 0);

            // retry backoff: 이전 attempt_time + backoff 경과 여부 확인
            if (status === "pending" && retryCount > 0) {
                const attemptTime = String(item.attempt_time ?? "");
                if (attemptTime) {
                    const dt = Date.parse(attemptTime);
                    if (!isNaN(dt) && now < dt + retryBackoffMs(retryCount)) {
                        continue; // 아직 backoff 중
                    }
                }
            }

            // processing으로 claim
            try {
                await entityServer.submit("push_log", {
                    seq,
                    status: "processing",
                    attempt_time: new Date().toISOString(),
                });
            } catch (err) {
                logger.warn(
                    { err, seq },
                    "Push: failed to claim push_log, skipping",
                );
                continue;
            }

            let pushData: Record<string, string> | undefined;
            const pdStr = String(item.push_data ?? "");
            if (pdStr) {
                try {
                    pushData = JSON.parse(pdStr) as Record<string, string>;
                } catch {
                    // ignore
                }
            }

            logs.push({
                log_seq: seq,
                account_seq: Number(item.account_seq ?? 0),
                device_seq: Number(item.device_seq ?? 0),
                platform: String(item.platform ?? "fcm"),
                device_token: String(item.device_token ?? ""),
                title: String(item.title ?? ""),
                body: String(item.body ?? ""),
                push_data: pushData,
                ref_entity: String(item.ref_entity ?? ""),
                ref_seq: Number(item.ref_seq ?? 0),
                retry_count: retryCount,
                provider: String(item.provider ?? ""),
            });
        }

        return logs;
    }

    /** push_log 상태를 갱신한다 (재시도 로직 포함) */
    async updatePushLogStatus(
        logSeq: number,
        status: string,
        errMsg: string,
    ): Promise<void> {
        if (status === "sent") {
            await entityServer.submit("push_log", {
                seq: logSeq,
                status: "sent",
                sent_time: new Date().toISOString(),
                error_message: "",
            });
            return;
        }

        if (status === "failed") {
            // 재시도 여부 판단을 위해 현재 retry_count 조회
            let retryCount = 0;
            try {
                const resp = await entityServer.list("push_log", {
                    seq: logSeq,
                    page: 1,
                    limit: 1,
                } as any);
                const items = ((resp.data as any)?.items ?? []) as Record<
                    string,
                    unknown
                >[];
                if (items.length > 0) {
                    retryCount = Number(items[0]!.retry_count ?? 0);
                }
            } catch {
                // 조회 실패 시 재시도 없이 failed
            }

            if (shouldRetry(errMsg, retryCount, this.maxRetries)) {
                await entityServer.submit("push_log", {
                    seq: logSeq,
                    status: "pending",
                    retry_count: retryCount + 1,
                    attempt_time: new Date().toISOString(),
                    error_message: truncateError(errMsg),
                });
            } else {
                await entityServer.submit("push_log", {
                    seq: logSeq,
                    status: "failed",
                    error_message: truncateError(errMsg),
                });
            }
            return;
        }

        // 기타 상태
        await entityServer.submit("push_log", {
            seq: logSeq,
            status,
            ...(errMsg ? { error_message: truncateError(errMsg) } : {}),
        });
    }

    /** 서버 시작 시 processing 상태의 레코드를 pending으로 복구한다 */
    async resetStalePushLogs(): Promise<void> {
        const resp = await entityServer.list("push_log", {
            status: "processing",
            page: 1,
            limit: 500,
            order: "seq",
        } as any);

        const items = ((resp.data as any)?.items ?? []) as Record<
            string,
            unknown
        >[];
        const now = Date.now();
        let resetCount = 0;

        for (const item of items) {
            const seq = Number(item.seq ?? 0);
            if (seq <= 0) continue;

            const attemptTime = String(item.attempt_time ?? "");
            if (attemptTime) {
                const dt = Date.parse(attemptTime);
                if (!isNaN(dt) && now - dt < STALE_AFTER_MS) {
                    continue; // 아직 stale 아님
                }
            }

            const retryCount = Number(item.retry_count ?? 0);

            try {
                if (retryCount >= this.maxRetries) {
                    await entityServer.submit("push_log", {
                        seq,
                        status: "failed",
                        error_message: "max retries exceeded (stale recovery)",
                    });
                } else {
                    await entityServer.submit("push_log", {
                        seq,
                        status: "pending",
                        attempt_time: "",
                    });
                }
                resetCount++;
            } catch (err) {
                logger.warn(
                    { err, seq },
                    "Push: failed to reset stale push_log",
                );
            }
        }

        if (resetCount > 0) {
            logger.info(
                `Push: reset ${resetCount} stale processing push_log records to pending`,
            );
        }
    }

    /** 만료된 토큰을 가진 디바이스의 push_enabled를 false로 변경한다 */
    async disableDeviceToken(deviceSeq: number): Promise<void> {
        await entityServer.submit("account_device", {
            seq: deviceSeq,
            push_enabled: false,
        });
    }
}
