/**
 * SMS 발송 서비스
 *
 * Go 엔티티서버 `internal/sms/service.go`에서 포팅
 *
 * 흐름:
 *  1. enqueueJob() → sms_log(pending) DB 저장
 *  2. dispatchLoop (setInterval N초) → pending 조회 → processing으로 claim → processOne 호출
 *  3. processOne → 프로바이더 API 발송 → sms_log 상태 갱신 (sent/failed)
 *  4. 서버 시작 시 → resetStaleLogs → processing → pending 되돌림
 */

import { logger } from "@system/api";
import type {
    SmsConfig,
    SmsClient,
    SmsQuerier,
    SmsJob,
    PendingSmsLog,
    SendRequest,
} from "./types/index.ts";
import { determineMsgType } from "./providers/index.ts";

export class SmsService {
    private readonly config: SmsConfig;
    private readonly clients: Map<string, SmsClient>;

    private querier: SmsQuerier | null = null;
    private dispatchTimer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private activeWorkers = 0;
    private activeDispatch: Promise<void> | null = null;

    constructor(config: SmsConfig, clients: Map<string, SmsClient>) {
        this.config = config;
        this.clients = clients;
    }

    setQuerier(q: SmsQuerier): void {
        this.querier = q;
    }

    getConfig(): SmsConfig {
        return this.config;
    }

    /** 서비스를 시작한다 (stale 복구 + dispatch loop) */
    async start(): Promise<void> {
        if (!this.querier) {
            logger.warn("SMS: querier not set, service will not start");
            return;
        }

        // stale processing 로그 복구
        try {
            await this.querier.resetStaleSmsLogs();
        } catch (err) {
            logger.warn({ err }, "SMS: failed to reset stale logs");
        }

        this.running = true;

        const intervalMs = (this.config.dispatch_interval_sec || 5) * 1000;
        this.dispatchTimer = setInterval(() => {
            const p = this.dispatch().catch((err) =>
                logger.error({ err }, "SMS dispatch error"),
            );
            this.activeDispatch = p;
        }, intervalMs);

        logger.info(
            `SMS service started (workers=${this.config.workers}, interval=${this.config.dispatch_interval_sec}s)`,
        );
    }

    /** 서비스를 중지한다 (진행 중인 발송 완료 대기) */
    async stop(): Promise<void> {
        this.running = false;
        if (this.dispatchTimer) {
            clearInterval(this.dispatchTimer);
            this.dispatchTimer = null;
        }
        // 진행 중인 dispatch 완료 대기
        if (this.activeDispatch) {
            try {
                await this.activeDispatch;
            } catch {
                // best-effort
            }
        }
        logger.info("SMS service stopped");
    }

    /** SMS 발송 작업을 큐에 등록한다 */
    async enqueueJob(job: SmsJob): Promise<void> {
        if (!this.querier) {
            throw new Error("SMS service not initialized");
        }

        // provider 기본값
        const provider = job.provider || this.config.default;
        // sender 기본값
        const sender =
            job.sender ||
            this.findProviderSender(provider) ||
            this.config.sender;

        // 메시지 타입 자동 판정
        let msgType = job.msg_type;
        if (!msgType && this.config.auto_lms) {
            msgType = determineMsgType(
                job.content,
                this.config.lms_threshold_bytes,
                job.image_url,
            );
        }
        if (!msgType) msgType = "sms";

        await this.querier.submitSmsLog({
            status: "pending",
            provider,
            sender,
            receiver: job.receiver,
            content: job.content,
            subject: job.subject || "",
            msg_type: msgType,
            image_url: job.image_url || "",
            ref_entity: job.ref_entity || "",
            ref_seq: job.ref_seq || 0,
            sms_msg_seq: job.sms_msg_seq || 0,
            retry_count: 0,
            error_message: "",
        });
    }

    /** pending 로그를 가져와 발송한다 */
    private async dispatch(): Promise<void> {
        if (!this.running || !this.querier) return;

        const logs = await this.querier.claimPendingSmsLogs(
            this.config.queue_size,
        );
        if (logs.length === 0) return;

        // 동시 발송 (workers 만큼 제한)
        const maxConcurrency = this.config.workers || 2;
        const queue = [...logs];

        const processNext = async (): Promise<void> => {
            while (queue.length > 0 && this.running) {
                const pending = queue.shift();
                if (!pending) break;
                await this.processOne(pending);
            }
        };

        const workers = Array.from(
            { length: Math.min(maxConcurrency, logs.length) },
            () => processNext(),
        );
        await Promise.allSettled(workers);
    }

    /** 단일 SMS 로그를 발송 처리한다 */
    private async processOne(pending: PendingSmsLog): Promise<void> {
        const client = this.clients.get(pending.provider);
        if (!client) {
            await this.finalize(
                pending,
                "",
                new Error(`Unknown provider: ${pending.provider}`),
            );
            return;
        }

        const req: SendRequest = {
            type: pending.msg_type || "sms",
            sender: pending.sender,
            receiver: pending.receiver,
            subject: pending.subject,
            content: pending.content,
            image_url: pending.image_url,
        };

        try {
            const result = await client.send(req);
            await this.finalize(pending, result.provider_msg_id, null);
        } catch (err) {
            await this.finalize(
                pending,
                "",
                err instanceof Error ? err : new Error(String(err)),
            );
        }
    }

    /** 발송 결과에 따라 로그 상태를 갱신한다 */
    private async finalize(
        pending: PendingSmsLog,
        providerMsgId: string,
        sendErr: Error | null,
    ): Promise<void> {
        if (!this.querier) return;

        if (sendErr) {
            logger.warn(
                { err: sendErr, seq: pending.log_seq },
                `SMS send failed (provider=${pending.provider})`,
            );
            await this.querier.updateSmsLogStatus(
                pending.log_seq,
                "failed",
                "",
                sendErr.message,
            );
        } else {
            await this.querier.updateSmsLogStatus(
                pending.log_seq,
                "sent",
                providerMsgId,
                "",
            );
        }

        // sms_msg 참조가 있으면 상태 연동
        if (pending.sms_msg_seq > 0) {
            await this.querier.updateSmsMsgStatus(
                pending.sms_msg_seq,
                sendErr ? "failed" : "sent",
            );
        }
    }

    /** 프로바이더별 발신번호 오버라이드를 찾는다 */
    private findProviderSender(name: string): string {
        const prov = this.config.providers[name];
        return prov?.sender ?? "";
    }
}
