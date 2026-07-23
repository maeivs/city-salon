/**
 * 알림톡 / 친구톡 발송 서비스
 *
 * Go의 goroutine+channel → Node.js의 setInterval + async queue 패턴으로 전환
 *
 * 흐름:
 *  1. EnqueueJob() → alimtalk_log(pending) DB 저장
 *  2. dispatchLoop (setInterval N초) → pending 조회 → processing으로 claim → processOne 호출
 *  3. processOne → 프로바이더 API 발송 → alimtalk_log 상태 갱신 (sent/failed)
 *  4. 서버 시작 시 → resetStaleLogs → processing → pending 되돌림
 */

import { logger } from "@system/api";
import type {
    AlimtalkConfig,
    AlimtalkClient,
    AlimtalkQuerier,
    FriendTalkQuerier,
    AlimtalkJob,
    FriendTalkJob,
    PendingAlimtalkLog,
    PendingFriendTalkLog,
    AlimtalkButton,
    FriendTalkItem,
    FriendTalkCarousel,
    FRIENDTALK_TYPE_TEXT as _,
} from "./types/index.ts";
import { FRIENDTALK_TYPE_TEXT } from "./types/index.ts";
import { TemplateCache } from "./template-cache.ts";
import { WebhookProcessor } from "./webhook.ts";

export class AlimtalkService {
    private readonly config: AlimtalkConfig;
    private readonly clients: Map<string, AlimtalkClient>;
    private readonly templateCache: TemplateCache;

    private querier: AlimtalkQuerier | null = null;
    private friendTalkQuerier: FriendTalkQuerier | null = null;

    private dispatchTimer: ReturnType<typeof setInterval> | null = null;
    private friendTalkDispatchTimer: ReturnType<typeof setInterval> | null =
        null;
    private running = false;

    /** AlimtalkService를 설정과 클라이언트로 초기화한다 */
    constructor(config: AlimtalkConfig, clients: Map<string, AlimtalkClient>) {
        this.config = config;
        this.clients = clients;
        this.templateCache = new TemplateCache();

        if (config.templates) {
            this.templateCache.loadFromConfig(config.templates);
        }
    }

    // ─── Inject ──────────────────────────────────────────────────────────

    /** 알림톡 Entity 어댑터를 설정한다 */
    setQuerier(q: AlimtalkQuerier): void {
        this.querier = q;
    }

    /** 친구톡 Entity 어댑터를 설정한다 */
    setFriendTalkQuerier(q: FriendTalkQuerier): void {
        this.friendTalkQuerier = q;
    }

    // ─── Start / Stop ────────────────────────────────────────────────────

    /** 발송 디스패치 루프를 시작한다 */
    async start(): Promise<void> {
        if (!this.querier) {
            logger.warn("Alimtalk: querier not set, service will not start");
            return;
        }

        // stale 레코드 복구
        try {
            await this.querier.resetStaleAlimtalkLogs();
        } catch (err) {
            logger.warn({ err }, "Alimtalk: failed to reset stale logs");
        }

        // 알림톡 디스패치 루프
        const intervalMs = (this.config.dispatch_interval_sec || 5) * 1000;
        this.dispatchTimer = setInterval(() => {
            this.dispatch().catch((err) =>
                logger.error({ err }, "Alimtalk dispatch error"),
            );
        }, intervalMs);

        // 친구톡 디스패치 루프
        if (this.config.friendtalk?.enabled && this.friendTalkQuerier) {
            try {
                await this.friendTalkQuerier.resetStaleFriendTalkLogs();
            } catch (err) {
                logger.warn({ err }, "FriendTalk: failed to reset stale logs");
            }

            this.friendTalkDispatchTimer = setInterval(() => {
                this.friendTalkDispatch().catch((err) =>
                    logger.error({ err }, "FriendTalk dispatch error"),
                );
            }, intervalMs);
        }

        this.running = true;
        logger.info(
            "Alimtalk service started (interval=%ds, workers=async)",
            this.config.dispatch_interval_sec || 5,
        );
    }

    /** 발송 디스패치 루프를 중지한다 */
    stop(): void {
        if (this.dispatchTimer) {
            clearInterval(this.dispatchTimer);
            this.dispatchTimer = null;
        }
        if (this.friendTalkDispatchTimer) {
            clearInterval(this.friendTalkDispatchTimer);
            this.friendTalkDispatchTimer = null;
        }
        this.running = false;
        logger.info("Alimtalk service stopped");
    }

    // ─── Alimtalk Enqueue / Dispatch ─────────────────────────────────────

    /** 알림톡 발송 작업을 큐에 등록한다 */
    async enqueueJob(job: AlimtalkJob): Promise<void> {
        if (!this.querier) throw new Error("alimtalk: querier not set");

        const provider = (job.provider || "").trim() || this.config.default;
        const variablesJSON = job.variables
            ? JSON.stringify(job.variables)
            : "";

        await this.querier.submitAlimtalkLog({
            status: "pending",
            template_code: job.templateCode,
            template_name: job.templateName,
            receiver: job.receiver,
            provider,
            variables_json: variablesJSON,
            alimtalk_msg_seq: job.msgSeq || 0,
            retry_count: 0,
        });
    }

    /** 대기 중인 알림톡을 일괄 발송한다 */
    private async dispatch(): Promise<void> {
        if (!this.querier) return;

        const queueSize = this.config.queue_size || 200;
        const pending = await this.querier.claimPendingAlimtalkLogs(queueSize);

        // 동시 처리 (Promise.allSettled로 개별 실패 허용)
        await Promise.allSettled(pending.map((p) => this.processOne(p)));
    }

    /** 알림톡 한 건을 발송 처리한다 */
    private async processOne(pending: PendingAlimtalkLog): Promise<void> {
        const providerKey =
            (pending.provider || "").trim() || this.config.default;
        const client = this.clients.get(providerKey);

        if (!client) {
            await this.finalize(
                pending,
                "",
                new Error(`alimtalk: unknown provider "${providerKey}"`),
            );
            return;
        }

        // 변수 파싱
        let variables: Record<string, string> = {};
        if (pending.variablesJSON) {
            try {
                variables = JSON.parse(pending.variablesJSON);
            } catch {
                /* empty */
            }
        }

        try {
            const result = await client.send({
                senderKey: this.config.sender_key,
                templateCode: pending.templateCode,
                receiver: pending.receiver,
                variables,
                buttons: [],
            });

            await this.finalize(pending, result.providerMsgId, null);
        } catch (err) {
            await this.finalize(pending, "", err as Error);
        }
    }

    /** 알림톡 발송 결과를 저장한다 */
    private async finalize(
        pending: PendingAlimtalkLog,
        providerMsgId: string,
        sendErr: Error | null,
    ): Promise<void> {
        const status = sendErr ? "failed" : "sent";
        const errMsg = sendErr?.message ?? "";

        if (sendErr) {
            logger.warn(
                `Alimtalk send failed (seq=${pending.logSeq}, receiver=${pending.receiver}): ${errMsg}`,
            );
        }

        try {
            await this.querier!.updateAlimtalkLogStatus(
                pending.logSeq,
                status,
                providerMsgId,
                errMsg,
            );
        } catch (err) {
            logger.error(
                { err },
                `Alimtalk: failed to update alimtalk_log seq=${pending.logSeq}`,
            );
        }

        if (pending.msgSeq > 0) {
            this.querier!.updateAlimtalkMsgStatus(pending.msgSeq, status).catch(
                (err) =>
                    logger.warn(
                        { err },
                        `Alimtalk: failed to update alimtalk_msg seq=${pending.msgSeq}`,
                    ),
            );
        }
    }

    // ─── FriendTalk Enqueue / Dispatch ───────────────────────────────────

    /** 친구톡 발송 작업을 큐에 등록한다 */
    async enqueueFriendTalkJob(job: FriendTalkJob): Promise<void> {
        if (!this.friendTalkQuerier)
            throw new Error("friendtalk: querier not set");

        const provider = (job.provider || "").trim() || this.config.default;
        const msgType = (job.msgType || "").trim() || FRIENDTALK_TYPE_TEXT;

        await this.friendTalkQuerier.submitFriendTalkLog({
            status: "pending",
            provider,
            msg_type: msgType,
            receiver: job.receiver,
            content: job.content,
            image_url: job.imageUrl,
            image_link: job.imageLink,
            is_ad: job.isAd,
            buttons_json: job.buttonsJSON,
            carousel_json: job.carouselJSON,
            items_json: job.itemsJSON,
            header: job.header,
            friendtalk_msg_seq: job.msgSeq || 0,
            retry_count: 0,
        });
    }

    /** 대기 중인 친구톡을 일괄 발송한다 */
    private async friendTalkDispatch(): Promise<void> {
        if (!this.friendTalkQuerier) return;

        const queueSize = this.config.queue_size || 200;
        const pending =
            await this.friendTalkQuerier.claimPendingFriendTalkLogs(queueSize);

        await Promise.allSettled(
            pending.map((p) => this.processFriendTalkOne(p)),
        );
    }

    /** 친구톡 한 건을 발송 처리한다 */
    private async processFriendTalkOne(
        pending: PendingFriendTalkLog,
    ): Promise<void> {
        const providerKey =
            (pending.provider || "").trim() || this.config.default;
        const client = this.clients.get(providerKey);

        if (!client) {
            await this.finalizeFriendTalk(
                pending,
                "",
                new Error(`friendtalk: unknown provider "${providerKey}"`),
            );
            return;
        }

        // 버튼 파싱
        let buttons: AlimtalkButton[] = [];
        if (pending.buttonsJSON) {
            try {
                buttons = JSON.parse(pending.buttonsJSON);
            } catch {
                /* empty */
            }
        }

        // 와이드 아이템 파싱
        let items: FriendTalkItem[] = [];
        if (pending.itemsJSON) {
            try {
                items = JSON.parse(pending.itemsJSON);
            } catch {
                /* empty */
            }
        }

        // 캐러셀 파싱
        let carousel: FriendTalkCarousel | undefined;
        if (pending.carouselJSON) {
            try {
                carousel = JSON.parse(pending.carouselJSON);
            } catch {
                /* empty */
            }
        }

        try {
            const result = await client.sendFriendTalk({
                senderKey: this.config.sender_key,
                msgType: pending.msgType,
                receiver: pending.receiver,
                content: pending.content,
                imageUrl: pending.imageUrl,
                imageLink: pending.imageLink,
                isAd: pending.isAd,
                buttons,
                header: pending.header,
                items,
                carousel,
            });

            await this.finalizeFriendTalk(pending, result.providerMsgId, null);
        } catch (err) {
            await this.finalizeFriendTalk(pending, "", err as Error);
        }
    }

    /** 친구톡 발송 결과를 저장한다 */
    private async finalizeFriendTalk(
        pending: PendingFriendTalkLog,
        providerMsgId: string,
        sendErr: Error | null,
    ): Promise<void> {
        const status = sendErr ? "failed" : "sent";
        const errMsg = sendErr?.message ?? "";

        if (sendErr) {
            logger.warn(
                `FriendTalk send failed (seq=${pending.logSeq}, receiver=${pending.receiver}): ${errMsg}`,
            );
        }

        try {
            await this.friendTalkQuerier!.updateFriendTalkLogStatus(
                pending.logSeq,
                status,
                providerMsgId,
                errMsg,
            );
        } catch (err) {
            logger.error(
                { err },
                `FriendTalk: failed to update friendtalk_log seq=${pending.logSeq}`,
            );
        }

        if (pending.msgSeq > 0) {
            this.friendTalkQuerier!.updateFriendTalkMsgStatus(
                pending.msgSeq,
                status,
            ).catch((err) =>
                logger.warn(
                    { err },
                    `FriendTalk: failed to update friendtalk_msg seq=${pending.msgSeq}`,
                ),
            );
        }
    }

    // ─── Templates ───────────────────────────────────────────────────────

    /** 등록된 템플릿 목록을 반환한다 */
    listTemplates() {
        return this.templateCache.list();
    }

    // ─── Webhook ─────────────────────────────────────────────────────────

    /** 프로바이더 웹훅 콜백을 처리한다 */
    async processWebhook(
        provider: string,
        body: Buffer | string,
    ): Promise<void> {
        if (!this.querier) throw new Error("alimtalk: querier not set");
        const wp = new WebhookProcessor(this.querier);
        await wp.process(provider, body);
    }

    // ─── Getters ─────────────────────────────────────────────────────────

    /** 서비스 실행 상태를 반환한다 */
    isRunning(): boolean {
        return this.running;
    }

    /** 알림톡 설정을 반환한다 */
    getConfig(): AlimtalkConfig {
        return this.config;
    }
}
