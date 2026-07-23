/**
 * PG 결제 서비스
 *
 * 결제 흐름:
 *   1. createOrder     → pg_order(status=created) 생성
 *   2. confirmPayment  → 금액 재검증 + PgClient.confirmPayment → pg_order 상태 업데이트
 *   3. cancelPayment   → PgClient.cancelPayment → pg_cancel 생성 + pg_order 상태 업데이트
 *   4. syncStatus      → PgClient.getPayment → pg_order 상태 동기화
 */

import crypto from "node:crypto";
import {
    PgError,
    PgNotFoundError,
    PgConflictError,
    ORDER_STATUS,
} from "./types/index.ts";
import type {
    PgClient,
    PgQuerier,
    PgAmountLimit,
    ConfirmRequest,
    CancelRequest,
    PaymentResult,
    CancelResult,
    ClientConfig,
} from "./types/index.ts";

// ─── 글로벌 clientKey 맵 ──────────────────────────────────────────────────────
const globalClientKeys = new Map<string, string>();

export function registerClientKey(driver: string, clientKey: string): void {
    globalClientKeys.set(driver, clientKey);
}

// ─── 서비스 설정 ──────────────────────────────────────────────────────────────
export interface ServiceConfig {
    clients: Map<string, PgClient>;
    defaultClient: string;
    webhookSecret: string;
    amountLimit: PgAmountLimit | null;
    orderIdPrefix: string;
    successUrl: string;
    failUrl: string;
    webhookUrl: string;
    workers: number;
}

// ─── 주문 요청/응답 ───────────────────────────────────────────────────────────
export interface OrderRequest {
    amount: number;
    orderName: string;
    currency?: string;
    customerName?: string;
    customerEmail?: string;
    provider?: string;
    accountSeq?: number;
    metadata?: Record<string, unknown>;
}

export interface OrderResponse {
    orderId: string;
    amount: number;
    orderName: string;
    status: string;
    clientKey: string;
    successUrl: string;
    failUrl: string;
}

export interface RefundAccount {
    bank: string;
    accountNumber: string;
    holderName: string;
}

// ─── PG 서비스 ────────────────────────────────────────────────────────────────
export class PgService {
    private clients: Map<string, PgClient>;
    private defaultClient: string;
    private amountLimit: PgAmountLimit | null;
    private orderIdPrefix: string;
    private successUrl: string;
    private failUrl: string;
    private querier: PgQuerier | null = null;

    constructor(cfg: ServiceConfig) {
        this.clients = cfg.clients;
        this.defaultClient = cfg.defaultClient;
        this.amountLimit = cfg.amountLimit;
        this.orderIdPrefix = cfg.orderIdPrefix || "ORD";
        this.successUrl = cfg.successUrl;
        this.failUrl = cfg.failUrl;
    }

    setQuerier(q: PgQuerier): void {
        this.querier = q;
    }

    async start(): Promise<void> {
        if (!this.querier) throw new Error("pg: querier not set");
    }

    stop(): void {
        // cleanup
    }

    // ─── 주문 생성 ──────────────────────────────────────────────────────────
    async createOrder(req: OrderRequest): Promise<OrderResponse> {
        if (!this.querier) throw new Error("pg: service not initialized");

        // 금액 검증
        if (req.amount <= 0) throw new Error("pg: amount must be positive");
        if (this.amountLimit) {
            if (req.amount < this.amountLimit.min)
                throw new Error(
                    `pg: amount ${req.amount} is below minimum ${this.amountLimit.min}`,
                );
            if (this.amountLimit.max > 0 && req.amount > this.amountLimit.max)
                throw new Error(
                    `pg: amount ${req.amount} exceeds maximum ${this.amountLimit.max}`,
                );
        }

        if (!req.orderName) throw new Error("pg: orderName is required");
        if (req.orderName.length > 100)
            throw new Error("pg: orderName exceeds 100 characters");

        const currency = req.currency || "KRW";
        const provider = req.provider || this.defaultClient;
        if (!this.clients.has(provider))
            throw new Error(`pg: unknown provider "${provider}"`);

        const clientKey = this.requireClientKey(provider);

        const orderId = this.generateOrderId();

        const data: Record<string, unknown> = {
            order_id: orderId,
            status: ORDER_STATUS.CREATED,
            provider,
            amount: req.amount,
            balance_amount: req.amount,
            currency,
            order_name: req.orderName,
        };
        if (req.customerName) data.customer_name = req.customerName;
        if (req.customerEmail) data.customer_email = req.customerEmail;
        if (req.accountSeq) data.account_seq = req.accountSeq;
        if (req.metadata) data.metadata = req.metadata;

        await this.querier.createOrder(data);

        return {
            orderId,
            amount: req.amount,
            orderName: req.orderName,
            status: ORDER_STATUS.CREATED,
            clientKey,
            successUrl: this.successUrl,
            failUrl: this.failUrl,
        };
    }

    // ─── 결제 승인 ──────────────────────────────────────────────────────────
    async confirmPayment(
        paymentKey: string,
        orderId: string,
        amount: number,
        providerPayload?: Record<string, unknown>,
    ): Promise<PaymentResult> {
        if (!this.querier) throw new Error("pg: service not initialized");

        const order = await this.querier.getOrderById(orderId);
        if (!order) throw new PgNotFoundError(`pg: order ${orderId} not found`);

        const seq = toNumber(order.seq);
        const status = String(order.status ?? "");
        const storedAmount = toNumber(order.amount);
        const provider = String(order.provider ?? "");

        if (
            status !== ORDER_STATUS.CREATED &&
            status !== ORDER_STATUS.IN_PROGRESS
        )
            throw new PgConflictError(
                `pg: order ${orderId} status is ${status}, cannot confirm`,
            );

        if (amount !== storedAmount)
            throw new Error(
                `pg: amount mismatch (expected ${storedAmount}, got ${amount})`,
            );

        const client = this.clients.get(provider);
        if (!client) throw new Error(`pg: provider "${provider}" not found`);

        const confirmReq: ConfirmRequest = {
            paymentKey,
            orderId,
            amount,
            providerPayload,
            idempotencyKey: readStringProviderValue(
                providerPayload,
                "idempotency_key",
                "idempotencyKey",
            ),
        };

        let result: PaymentResult;
        try {
            result = await client.confirmPayment(null, confirmReq);
        } catch (err) {
            const patch: Record<string, unknown> = {
                status: ORDER_STATUS.ABORTED,
                payment_key: paymentKey,
                failure_code: "",
                failure_message:
                    err instanceof Error ? err.message : String(err),
            };
            if (err instanceof PgError) {
                patch.failure_code = err.code;
                patch.failure_message = err.message;
            }
            await this.querier.updateOrder(seq, status, patch);
            throw err;
        }

        const patch = buildOrderPatch(result);
        patch.payment_key = paymentKey;
        await this.querier.updateOrder(seq, status, patch);

        return result;
    }

    // ─── 결제 취소 ──────────────────────────────────────────────────────────
    async cancelPayment(
        orderId: string,
        cancelReason: string,
        cancelAmount?: number,
        refundAccount?: RefundAccount,
    ): Promise<CancelResult> {
        if (!this.querier) throw new Error("pg: service not initialized");

        const order = await this.querier.getOrderById(orderId);
        if (!order) throw new PgNotFoundError(`pg: order ${orderId} not found`);

        const seq = toNumber(order.seq);
        const status = String(order.status ?? "");
        const paymentKey = String(order.payment_key ?? "");
        const provider = String(order.provider ?? "");

        if (
            status !== ORDER_STATUS.DONE &&
            status !== ORDER_STATUS.PARTIAL_CANCELED
        )
            throw new PgConflictError(
                `pg: order ${orderId} status is ${status}, cannot cancel`,
            );

        if (!paymentKey)
            throw new Error(`pg: order ${orderId} has no payment_key`);

        const client = this.clients.get(provider);
        if (!client) throw new Error(`pg: provider "${provider}" not found`);

        const cancelReq: CancelRequest = {
            paymentKey,
            cancelReason,
            cancelAmount,
            originalAmount: toNumber(order.balance_amount),
            refundReceiveAccount: refundAccount,
            idempotencyKey: `cancel_${orderId}_${Date.now()}`,
        };

        let result: CancelResult;
        try {
            result = await client.cancelPayment(null, cancelReq);
        } catch (err) {
            await this.querier.createCancel({
                order_seq: seq,
                order_id: orderId,
                cancel_amount: cancelAmount ?? 0,
                cancel_reason: cancelReason,
                cancel_status: "failed",
                error_message: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }

        const cancelData: Record<string, unknown> = {
            order_seq: seq,
            order_id: orderId,
            cancel_reason: cancelReason,
            cancel_status: "done",
        };
        if (result.latestCancel) {
            cancelData.cancel_amount = result.latestCancel.cancelAmount;
            cancelData.transaction_key = result.latestCancel.transactionKey;
        }
        await this.querier.createCancel(cancelData);

        const patch = buildOrderPatch(result);
        await this.querier.updateOrder(seq, status, patch);

        return result;
    }

    // ─── 상태 동기화 ────────────────────────────────────────────────────────
    async syncStatus(orderId: string): Promise<PaymentResult> {
        if (!this.querier) throw new Error("pg: service not initialized");

        const order = await this.querier.getOrderById(orderId);
        if (!order) throw new PgNotFoundError(`pg: order ${orderId} not found`);

        const seq = toNumber(order.seq);
        const paymentKey = String(order.payment_key ?? "");
        const provider = String(order.provider ?? "");

        if (!paymentKey)
            throw new PgConflictError(
                `pg: order ${orderId} has no payment_key, cannot sync`,
            );

        const client = this.clients.get(provider);
        if (!client) throw new Error(`pg: provider "${provider}" not found`);

        const result = await client.getPayment(null, paymentKey);
        const patch = buildOrderPatch(result);
        await this.querier.updateOrderDirect(seq, patch);

        return result;
    }

    // ─── 주문 조회 ──────────────────────────────────────────────────────────
    async getOrder(orderId: string): Promise<Record<string, unknown>> {
        if (!this.querier) throw new Error("pg: service not initialized");
        const order = await this.querier.getOrderById(orderId);
        if (!order) throw new PgNotFoundError(`pg: order ${orderId} not found`);
        return order;
    }

    // ─── 웹훅 처리 ──────────────────────────────────────────────────────────
    async handleWebhook(
        payload: Buffer | string,
        signature: string,
    ): Promise<void> {
        if (!this.querier) throw new Error("pg: service not initialized");

        const rawStr =
            typeof payload === "string" ? payload : payload.toString("utf-8");
        let body: Record<string, unknown>;
        try {
            body = JSON.parse(rawStr) as Record<string, unknown>;
        } catch {
            throw new Error("pg: invalid webhook payload");
        }

        const paymentKey = String(body.paymentKey ?? body.payment_key ?? "");
        const orderId = String(body.orderId ?? body.order_id ?? "");
        const eventType = String(
            body.eventType ?? body.event_type ?? "payment",
        );
        const status = String(body.status ?? "");

        // 중복 웹훅 방지
        if (paymentKey) {
            const existing = await this.querier.findWebhookLog(
                paymentKey,
                eventType,
            );
            if (existing) return;
        }

        const logSeq = await this.querier.createWebhookLog({
            event_type: eventType,
            order_id: orderId,
            payment_key: paymentKey,
            status: "received",
            payload: rawStr,
            signature,
        });

        try {
            if (orderId) {
                const order = await this.querier.getOrderById(orderId);
                if (order) {
                    const seq = toNumber(order.seq);
                    const provider = String(order.provider ?? "");
                    const existingPaymentKey = String(order.payment_key ?? "");
                    const resolvedKey = paymentKey || existingPaymentKey;

                    // PG에 직접 결제 상태를 재조회하여 신뢰할 수 있는 상태를 얻는다
                    if (resolvedKey && provider) {
                        const client = this.clients.get(provider);
                        if (client) {
                            try {
                                const result = await client.getPayment(
                                    null,
                                    resolvedKey,
                                );
                                const patch = buildOrderPatch(result);
                                patch.payment_key = resolvedKey;
                                await this.querier.updateOrderDirect(
                                    seq,
                                    patch,
                                );
                            } catch {
                                // PG 재조회 실패 시 웹훅 payload의 status를 fallback으로 사용
                                const normalizedStatus =
                                    normalizeWebhookStatus(status);
                                if (normalizedStatus) {
                                    await this.querier.updateOrderDirect(seq, {
                                        status: normalizedStatus,
                                        payment_key: resolvedKey,
                                    });
                                }
                            }
                        }
                    } else {
                        const normalizedStatus = normalizeWebhookStatus(status);
                        if (normalizedStatus) {
                            await this.querier.updateOrderDirect(seq, {
                                status: normalizedStatus,
                                payment_key: resolvedKey,
                            });
                        }
                    }
                }
            }

            await this.querier.updateWebhookLog(logSeq, {
                status: "processed",
                processed_time: new Date().toISOString(),
            });
        } catch (err) {
            await this.querier.updateWebhookLog(logSeq, {
                status: "failed",
                error_message: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }

    // ─── 클라이언트 설정 ────────────────────────────────────────────────────
    getClientConfig(provider?: string): ClientConfig {
        const prov = provider || this.defaultClient;
        const client = this.clients.get(prov);
        return {
            driver: prov,
            clientKey: this.getClientKey(prov),
            apiVersion: client ? undefined : undefined,
        };
    }

    // ─── 내부 유틸 ──────────────────────────────────────────────────────────
    private generateOrderId(): string {
        const now = new Date();
        const pad = (n: number, len = 2) => String(n).padStart(len, "0");
        const ts = [
            now.getFullYear(),
            pad(now.getMonth() + 1),
            pad(now.getDate()),
            pad(now.getHours()),
            pad(now.getMinutes()),
            pad(now.getSeconds()),
        ].join("");
        const rand = crypto.randomBytes(4).toString("hex");
        return `${this.orderIdPrefix}_${ts}_${rand}`;
    }

    private getClientKey(provider: string): string {
        return globalClientKeys.get(provider) ?? "";
    }

    /** 결제창 호출에 필요한 공개 클라이언트 키 설정을 검증한다. */
    private requireClientKey(provider: string): string {
        const clientKey = this.getClientKey(provider);
        if (!clientKey) {
            throw new Error(
                `pg: provider "${provider}" client_key/site_cd is not configured`,
            );
        }
        return clientKey;
    }
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────
function toNumber(v: unknown): number {
    if (v == null) return 0;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
}

/** provider_payload의 문자열 옵션 값을 읽는다. */
function readStringProviderValue(
    payload: Record<string, unknown> | undefined,
    ...keys: string[]
): string | undefined {
    for (const key of keys) {
        const value = payload?.[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return undefined;
}

function buildOrderPatch(result: PaymentResult): Record<string, unknown> {
    const patch: Record<string, unknown> = {
        status: result.status,
        method: result.method,
        balance_amount: result.balanceAmount,
    };

    if (result.approvedAt) patch.approved_time = result.approvedAt;
    if (result.requestedAt) patch.requested_time = result.requestedAt;

    if (result.card) {
        patch.card_info = {
            issuer_code: result.card.issuerCode,
            acquirer_code: result.card.acquirerCode,
            number: result.card.number,
            installment: result.card.installmentPlanMonths,
            card_type: result.card.cardType,
            owner_type: result.card.ownerType,
            approve_no: result.card.approveNo,
        };
    }
    if (result.virtualAccount) {
        patch.virtual_account_info = {
            account_number: result.virtualAccount.accountNumber,
            bank_code: result.virtualAccount.bankCode,
            customer_name: result.virtualAccount.customerName,
            due_date: result.virtualAccount.dueDate,
        };
    }
    if (result.easyPay) {
        patch.easy_pay_info = {
            provider: result.easyPay.provider,
            amount: result.easyPay.amount,
            discount_amount: result.easyPay.discountAmount,
        };
    }
    if (result.receipt) patch.receipt_url = result.receipt.url;

    if (result.failure) {
        patch.failure_code = result.failure.code;
        patch.failure_message = result.failure.message;
    }
    if (result._raw) patch.pg_raw_response = result._raw;

    return patch;
}

function normalizeWebhookStatus(status: string): string | null {
    const map: Record<string, string> = {
        DONE: ORDER_STATUS.DONE,
        CANCELED: ORDER_STATUS.CANCELED,
        PARTIAL_CANCELED: ORDER_STATUS.PARTIAL_CANCELED,
        ABORTED: ORDER_STATUS.ABORTED,
        EXPIRED: ORDER_STATUS.EXPIRED,
    };
    return map[status.toUpperCase()] ?? null;
}
