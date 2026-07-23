/**
 * Push 알림 발송 서비스
 *
 * Go 엔티티서버 `internal/push/service.go` 에서 포팅
 *
 * 흐름:
 *  1. enqueueJob() → 디바이스 조회 → push_log(pending) DB 저장
 *  2. dispatchLoop (setInterval N초) → pending 조회 → processing claim → processOne
 *  3. processOne → FCM/APNs 전송 → push_log 상태 갱신 (sent/failed)
 *  4. 서버 시작 시 → resetStaleLogs → processing → pending 복구
 */

import { logger } from "@system/api";
import type {
    PushConfig,
    PushQuerier,
    PushJob,
    PendingPushLog,
    PushProvider,
} from "./types/index.ts";
import {
    isFcmTokenExpiredError,
    isApnsTokenExpiredError,
} from "./providers/index.ts";

export class PushService {
    private readonly config: PushConfig;
    private readonly providers: Map<string, PushProvider>;

    private querier: PushQuerier | null = null;
    private dispatchTimer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private activeDispatch: Promise<void> | null = null;

    constructor(config: PushConfig, providers: Map<string, PushProvider>) {
        this.config = config;
        this.providers = providers;
    }

    setQuerier(q: PushQuerier): void {
        this.querier = q;
    }

    getConfig(): PushConfig {
        return this.config;
    }

    /** 서비스를 시작한다 (stale 복구 + dispatch loop) */
    async start(): Promise<void> {
        if (!this.querier) {
            logger.warn("Push: querier not set, service will not start");
            return;
        }

        // stale processing 로그 복구
        try {
            await this.querier.resetStalePushLogs();
        } catch (err) {
            logger.warn({ err }, "Push: failed to reset stale logs");
        }

        this.running = true;

        const intervalMs = (this.config.dispatch_interval_sec || 5) * 1000;
        this.dispatchTimer = setInterval(() => {
            const p = this.dispatch().catch((err) =>
                logger.error({ err }, "Push dispatch error"),
            );
            this.activeDispatch = p;
        }, intervalMs);

        logger.info(
            `Push service started (workers=${this.config.workers}, interval=${this.config.dispatch_interval_sec}s, providers=${[...this.providers.keys()].join(",")})`,
        );
    }

    /** 서비스를 중지한다 */
    async stop(): Promise<void> {
        this.running = false;
        if (this.dispatchTimer) {
            clearInterval(this.dispatchTimer);
            this.dispatchTimer = null;
        }
        if (this.activeDispatch) {
            try {
                await this.activeDispatch;
            } catch {
                // best-effort
            }
        }
        logger.info("Push service stopped");
    }

    /**
     * Push 발송 작업을 큐에 등록한다.
     * 계정의 디바이스를 조회하여 각 디바이스별로 push_log(pending)을 생성한다.
     */
    async enqueueJob(job: PushJob): Promise<void> {
        if (!this.querier) {
            throw new Error("Push service not initialized");
        }

        // 디바이스 조회
        let devices;
        try {
            devices = await this.querier.listDevicesForAccount(job.account_seq);
        } catch (err) {
            logger.warn(
                { err, account_seq: job.account_seq },
                "Push: failed to query devices",
            );
            return;
        }

        if (!devices || devices.length === 0) return;

        // push_data 직렬화
        let pushDataStr = "";
        if (job.data && Object.keys(job.data).length > 0) {
            try {
                pushDataStr = JSON.stringify(job.data);
            } catch {
                // ignore
            }
        }

        // provider 결정
        const providerName = job.provider || this.config.default;

        // 디바이스별 push_log(pending) 생성
        for (const device of devices) {
            if (!device.push_token) continue;

            // platform은 device.platform 우선, 없으면 provider driver 기반
            const platform =
                device.platform || this.getPlatformForProvider(providerName);

            const logData: Record<string, unknown> = {
                status: "pending",
                account_seq: job.account_seq,
                device_seq: device.seq,
                platform,
                device_token: device.push_token,
                title: job.title,
                body: job.body,
                ref_entity: job.ref_entity || "",
                retry_count: 0,
                error_message: "",
                provider: providerName,
            };
            if (pushDataStr) {
                logData.push_data = pushDataStr;
            }
            if (job.ref_seq && job.ref_seq > 0) {
                logData.ref_seq = job.ref_seq;
            }

            try {
                await this.querier.submitPushLog(logData);
            } catch (err) {
                logger.warn(
                    { err, device_seq: device.seq },
                    "Push: failed to create push_log",
                );
            }
        }
    }

    /** pending 로그를 가져와 발송한다 */
    private async dispatch(): Promise<void> {
        if (!this.running || !this.querier) return;

        const logs = await this.querier.claimPendingPushLogs(
            this.config.queue_size,
        );
        if (logs.length === 0) return;

        // 동시 발송 (workers 수만큼 병렬)
        const maxConcurrency = this.config.workers || 2;
        const queue = [...logs];

        const processNext = async (): Promise<void> => {
            while (queue.length > 0 && this.running) {
                const log = queue.shift()!;
                await this.processOne(log);
            }
        };

        const workers: Promise<void>[] = [];
        for (let i = 0; i < Math.min(maxConcurrency, logs.length); i++) {
            workers.push(processNext());
        }
        await Promise.allSettled(workers);
    }

    /** 단일 pending 로그를 처리한다 */
    private async processOne(pl: PendingPushLog): Promise<void> {
        if (!pl.device_token) {
            await this.finalize(pl.log_seq, "failed", "empty device token");
            return;
        }

        // provider 선택: log에 기록된 provider 우선, 없으면 platform 기반, 없으면 default
        const providerName =
            (pl.provider && this.providers.has(pl.provider)
                ? pl.provider
                : "") ||
            this.resolveProviderByPlatform(pl.platform) ||
            this.config.default;

        const provider = this.providers.get(providerName);
        if (!provider) {
            await this.finalize(
                pl.log_seq,
                "failed",
                `provider '${providerName}' not configured`,
            );
            return;
        }

        try {
            await provider.send(
                pl.device_token,
                pl.title,
                pl.body,
                pl.push_data,
            );
            await this.finalize(pl.log_seq, "sent", "");
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);

            // 토큰 만료 시 디바이스 비활성화
            const isExpired =
                isFcmTokenExpiredError(errMsg) ||
                isApnsTokenExpiredError(errMsg);

            if (isExpired && this.querier && pl.device_seq > 0) {
                try {
                    await this.querier.disableDeviceToken(pl.device_seq);
                    logger.info(
                        {
                            device_seq: pl.device_seq,
                            account_seq: pl.account_seq,
                        },
                        "Push: disabled expired device token",
                    );
                } catch (disableErr) {
                    logger.warn(
                        { err: disableErr, device_seq: pl.device_seq },
                        "Push: failed to disable expired token",
                    );
                }
            }

            await this.finalize(pl.log_seq, "failed", errMsg);
        }
    }

    /** push_log 최종 상태를 기록한다 */
    private async finalize(
        logSeq: number,
        status: string,
        errMsg: string,
    ): Promise<void> {
        if (!this.querier) return;
        try {
            await this.querier.updatePushLogStatus(logSeq, status, errMsg);
        } catch (err) {
            logger.warn(
                { err, log_seq: logSeq },
                "Push: failed to update push_log status",
            );
        }
    }

    /** provider driver 이름으로 platform 문자열을 반환한다 */
    private getPlatformForProvider(providerName: string): string {
        const provCfg = this.config.providers[providerName];
        if (!provCfg) return "fcm";
        return provCfg.driver === "apns" ? "apns" : "fcm";
    }

    /**
     * platform 문자열로 적절한 provider를 찾는다.
     * apns 플랫폼이면 driver="apns"인 provider를 찾고,
     * 그 외는 driver="fcm"인 provider를 찾는다.
     */
    private resolveProviderByPlatform(platform: string): string | null {
        const targetDriver = platform === "apns" ? "apns" : "fcm";
        for (const [name, cfg] of Object.entries(this.config.providers)) {
            if (cfg.driver === targetDriver && this.providers.has(name)) {
                return name;
            }
        }
        return null;
    }
}
