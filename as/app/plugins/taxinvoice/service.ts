/**
 * 전자세금계산서 서비스
 *
 * 비즈니스 로직 오케스트레이터:
 * - RegistIssue: 등록 + 즉시 발행
 * - Register: 임시 저장
 * - Issue: 저장 건 발행
 * - CancelIssue: 발행 취소
 * - Dispatch Loop: 비동기 큐 처리 (setInterval)
 * - Sync Loop: 프로바이더 상태 동기화
 */

import { logger } from "@system/api";
import type {
    TaxInvoiceConfig,
    TaxInvoiceDriver,
    TaxInvoiceQuerier,
    InvoiceRequest,
    IssueOptions,
    IssueResult,
    PendingTaxInvoiceLog,
    Party,
} from "./types/index.ts";

/** 값을 문자열로 변환한다 */
function toString(v: unknown): string {
    if (v == null) return "";
    return String(v);
}

/** 값을 숫자로 변환한다 */
function toNumber(v: unknown): number {
    if (v == null) return 0;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
}

export class TaxInvoiceService {
    private cfg: TaxInvoiceConfig;
    private drivers: Map<string, TaxInvoiceDriver>;
    private querier!: TaxInvoiceQuerier;

    private dispatchTimer: ReturnType<typeof setInterval> | null = null;
    private syncTimer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    /** TaxInvoiceService를 설정과 클라이언트로 초기화한다 */
    constructor(cfg: TaxInvoiceConfig, drivers: Map<string, TaxInvoiceDriver>) {
        this.cfg = cfg;
        this.drivers = drivers;
    }

    /** 엔티티 어댑터를 주입한다 */
    setQuerier(querier: TaxInvoiceQuerier): void {
        this.querier = querier;
    }

    // ────────── Service Operations ──────────

    /** 프로바이더 드라이버를 반환한다 */
    getDriver(provider?: string): TaxInvoiceDriver {
        const name = provider || this.cfg.default;
        const driver = this.drivers.get(name);
        if (!driver) throw new Error(`taxinvoice: unknown provider "${name}"`);
        return driver;
    }

    /**
     * 세금계산서 등록 + 즉시 발행
     */
    async registIssue(req: InvoiceRequest): Promise<IssueResult> {
        if (!req.provider) req.provider = this.cfg.default;
        const driver = this.getDriver(req.provider);

        const invoicerSeq = await this.resolveParty(req.invoicer);
        const invoiceeSeq = await this.resolveParty(req.invoicee);

        const providerState = await driver.registIssue(req);

        const seq = await this.persistInvoice(
            req,
            invoicerSeq,
            invoiceeSeq,
            providerState,
        );
        this.logAction(seq, "regist_issue", req.provider, req.mgt_key, "");

        // NTS 자동 전송
        if (this.cfg.nts?.auto_send) {
            try {
                await this.querier.submitTaxInvoiceLog({
                    tax_invoice_seq: seq,
                    log_type: "issue",
                    provider: req.provider,
                    mgt_key: req.mgt_key,
                });
            } catch (err) {
                logger.warn(
                    `[taxinvoice] failed to queue NTS send for seq=${seq}: ${err}`,
                );
            }
        }

        return {
            seq,
            mgt_key: req.mgt_key,
            state: providerState.state,
            nts_state: providerState.nts_state,
            nts_confirm_num: providerState.nts_confirm_num,
        };
    }

    /**
     * 세금계산서 임시 저장
     */
    async register(req: InvoiceRequest): Promise<IssueResult> {
        if (!req.provider) req.provider = this.cfg.default;
        const driver = this.getDriver(req.provider);

        const invoicerSeq = await this.resolveParty(req.invoicer);
        const invoiceeSeq = await this.resolveParty(req.invoicee);

        const providerState = await driver.register(req);

        const seq = await this.persistInvoice(
            req,
            invoicerSeq,
            invoiceeSeq,
            providerState,
        );
        this.logAction(seq, "register", req.provider, req.mgt_key, "");

        return {
            seq,
            mgt_key: req.mgt_key,
            state: providerState.state,
            nts_state: providerState.nts_state,
        };
    }

    /**
     * 임시 저장된 세금계산서 발행
     */
    async issue(seq: number, opts: IssueOptions): Promise<IssueResult> {
        const invoice = await this.querier.getTaxInvoice(seq);
        const provider = toString(invoice.provider);
        const mgtKey = toString(invoice.mgt_key);
        const driver = this.getDriver(provider);

        const providerState = await driver.issue(mgtKey, opts);

        await this.querier.updateTaxInvoice(seq, {
            state: providerState.state,
            nts_state: providerState.nts_state,
        });

        this.logAction(seq, "issue", provider, mgtKey, opts.memo ?? "");

        return {
            seq,
            mgt_key: mgtKey,
            state: providerState.state,
            nts_state: providerState.nts_state,
        };
    }

    /**
     * 발행 취소
     */
    async cancelIssue(seq: number, memo: string): Promise<void> {
        const invoice = await this.querier.getTaxInvoice(seq);
        const provider = toString(invoice.provider);
        const mgtKey = toString(invoice.mgt_key);
        const driver = this.getDriver(provider);

        await driver.cancelIssue(mgtKey, memo);

        await this.querier.updateTaxInvoice(seq, { state: "issue_cancelled" });
        this.logAction(seq, "cancel_issue", provider, mgtKey, memo);
    }

    /**
     * 상태 조회
     */
    async getState(seq: number): Promise<Record<string, unknown>> {
        const invoice = await this.querier.getTaxInvoice(seq);
        const provider = toString(invoice.provider);
        const mgtKey = toString(invoice.mgt_key);
        const driver = this.getDriver(provider);

        const providerState = await driver.getState(mgtKey);

        // DB도 동기화
        const updates: Record<string, unknown> = {};
        if (
            providerState.state &&
            providerState.state !== toString(invoice.state)
        ) {
            updates.state = providerState.state;
        }
        if (
            providerState.nts_state &&
            providerState.nts_state !== toString(invoice.nts_state)
        ) {
            updates.nts_state = providerState.nts_state;
        }
        if (
            providerState.nts_confirm_num &&
            providerState.nts_confirm_num !== toString(invoice.nts_confirm_num)
        ) {
            updates.nts_confirm_num = providerState.nts_confirm_num;
        }
        if (Object.keys(updates).length > 0) {
            await this.querier.updateTaxInvoice(seq, updates);
        }

        return {
            seq,
            mgt_key: mgtKey,
            provider,
            state: providerState.state,
            nts_state: providerState.nts_state,
            nts_confirm_num: providerState.nts_confirm_num,
        };
    }

    // ────────── Dispatch Loop ──────────

    /** 디스패치 및 동기화 루프를 시작한다 */
    async start(): Promise<void> {
        this.running = true;
        const intervalMs = (this.cfg.dispatch_interval_sec || 10) * 1000;

        this.dispatchTimer = setInterval(() => {
            if (this.running)
                this.dispatch().catch((e) =>
                    logger.error(e, "[taxinvoice] dispatch error"),
                );
        }, intervalMs);

        // Sync Loop
        if (this.cfg.sync?.enabled && this.cfg.sync.interval_sec > 0) {
            const syncMs = this.cfg.sync.interval_sec * 1000;
            this.syncTimer = setInterval(() => {
                if (this.running)
                    this.syncStates().catch((e) =>
                        logger.error(e, "[taxinvoice] sync error"),
                    );
            }, syncMs);
        }

        logger.info(
            `[taxinvoice] service started: dispatch_interval=${this.cfg.dispatch_interval_sec}s`,
        );
    }

    /** 디스패치 및 동기화 루프를 정지한다 */
    stop(): void {
        this.running = false;
        if (this.dispatchTimer) {
            clearInterval(this.dispatchTimer);
            this.dispatchTimer = null;
        }
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        logger.info("[taxinvoice] service stopped");
    }

    /** 대기 큐의 로그를 처리한다 */
    private async dispatch(): Promise<void> {
        const logs = await this.querier.claimPendingTaxInvoiceLogs(
            this.cfg.queue_size,
        );
        if (logs.length === 0) return;

        // Promise.allSettled로 동시 처리 (Go의 goroutine worker pool 대체)
        const results = await Promise.allSettled(
            logs.map((log) => this.processOne(log)),
        );
        for (const r of results) {
            if (r.status === "rejected") {
                logger.error(
                    r.reason,
                    "[taxinvoice] processOne unhandled error",
                );
            }
        }
    }

    /** 단일 로그 항목을 처리한다 */
    private async processOne(logEntry: PendingTaxInvoiceLog): Promise<void> {
        try {
            const driver = this.getDriver(logEntry.provider);

            switch (logEntry.log_type) {
                case "issue":
                    await driver.sendToNTS(logEntry.mgt_key);
                    break;
                default:
                    throw new Error(`unknown log_type: ${logEntry.log_type}`);
            }

            await this.querier.updateTaxInvoiceLogStatus(
                logEntry.log_seq,
                "completed",
            );

            await this.querier.updateTaxInvoice(logEntry.tax_invoice_seq, {
                nts_state: "sending",
            });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (logEntry.retry_count < this.cfg.max_retries) {
                await this.querier.updateTaxInvoiceLogStatus(
                    logEntry.log_seq,
                    "pending",
                    { error: errMsg },
                );
            } else {
                await this.querier.updateTaxInvoiceLogStatus(
                    logEntry.log_seq,
                    "failed",
                    { error: errMsg },
                );
            }
        }
    }

    // ────────── Sync Loop ──────────

    /** 프로바이더 상태를 동기화한다 */
    private async syncStates(): Promise<void> {
        for (const [providerName, driver] of this.drivers) {
            if (providerName === "esero") continue; // esero는 직접 제출이므로 sync 불필요

            try {
                const invoices =
                    await this.querier.listTaxInvoicesForSync(providerName);
                for (const inv of invoices) {
                    const mgtKey = toString(inv.mgt_key);
                    const seq = toNumber(inv.seq);

                    try {
                        const ps = await driver.getState(mgtKey);
                        const updates: Record<string, unknown> = {};

                        if (
                            ps.nts_state &&
                            ps.nts_state !== toString(inv.nts_state)
                        ) {
                            updates.nts_state = ps.nts_state;
                        }
                        if (
                            ps.nts_confirm_num &&
                            ps.nts_confirm_num !== toString(inv.nts_confirm_num)
                        ) {
                            updates.nts_confirm_num = ps.nts_confirm_num;
                        }
                        if (ps.state && ps.state !== toString(inv.state)) {
                            updates.state = ps.state;
                        }
                        if (Object.keys(updates).length > 0) {
                            await this.querier.updateTaxInvoice(seq, updates);
                            this.logAction(
                                seq,
                                "state_sync",
                                providerName,
                                mgtKey,
                                "",
                            );
                        }
                    } catch (err) {
                        logger.warn(
                            `[taxinvoice] sync: GetState error for ${providerName} mgt_key=${mgtKey}: ${err}`,
                        );
                    }
                }
            } catch (err) {
                logger.warn(
                    `[taxinvoice] sync: list error for ${providerName}: ${err}`,
                );
            }
        }
    }

    // ────────── Helpers ──────────

    /** 거래처를 조회하거나 생성한다 */
    private async resolveParty(party: Party): Promise<number> {
        if (!party) throw new Error("party is null");
        return this.querier.findOrCreateParty(party);
    }

    /** 세금계산서를 DB에 저장한다 */
    private async persistInvoice(
        req: InvoiceRequest,
        invoicerSeq: number,
        invoiceeSeq: number,
        ps: {
            state: string;
            nts_state: string;
            nts_confirm_num: string;
        } | null,
    ): Promise<number> {
        req.invoicer_seq = invoicerSeq;
        req.invoicee_seq = invoiceeSeq;
        if (ps) {
            req.state = ps.state;
            req.nts_state = ps.nts_state;
            req.nts_confirm_num = ps.nts_confirm_num;
        }
        return this.querier.submitTaxInvoice(req);
    }

    /** 세금계산서 액션 로그를 기록한다 */
    private logAction(
        seq: number,
        logType: string,
        provider: string,
        mgtKey: string,
        memo: string,
    ): void {
        this.querier
            .submitTaxInvoiceLog({
                tax_invoice_seq: seq,
                log_type: logType,
                provider,
                mgt_key: mgtKey,
                memo,
            })
            .catch((err) => {
                logger.warn(
                    `[taxinvoice] logAction: failed to write log for seq=${seq} type=${logType}: ${err}`,
                );
            });
    }
}
