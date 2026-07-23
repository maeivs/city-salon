/**
 * Toss Payments V2 클라이언트
 *
 * ref: https://docs.tosspayments.com/reference
 */

import type {
    PgClient,
    PgProviderConfig,
    ConfirmRequest,
    CancelRequest,
    PaymentResult,
    CancelResult,
} from "../types/index.ts";
import { PgError, ORDER_STATUS } from "../types/index.ts";
import {
    TOSS_PAYMENTS_API_BASE_URL,
    TOSS_PAYMENTS_API_PATHS,
    TOSS_PAYMENTS_STATUSES,
} from "./toss-constants.ts";

export class TossClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly secretKey: string;

    constructor(cfg: PgProviderConfig) {
        this._name = cfg.driver;
        this.apiUrl = cfg.api_url || TOSS_PAYMENTS_API_BASE_URL;
        this.secretKey = cfg.secret_key || "";
    }

    name(): string {
        return this._name;
    }

    /** Basic Auth 헤더: base64(secretKey + ":") */
    private authHeader(): string {
        return "Basic " + Buffer.from(this.secretKey + ":").toString("base64");
    }

    private headers(idempotencyKey?: string): Record<string, string> {
        const h: Record<string, string> = {
            Authorization: this.authHeader(),
            "Content-Type": "application/json",
        };
        if (idempotencyKey) h["Idempotency-Key"] = idempotencyKey;
        return h;
    }

    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const resp = await fetch(
            `${this.apiUrl}${TOSS_PAYMENTS_API_PATHS.confirm}`,
            {
                method: "POST",
                headers: this.headers(resolveConfirmIdempotencyKey(req)),
                body: JSON.stringify({
                    paymentKey: req.paymentKey,
                    orderId: req.orderId,
                    amount: req.amount,
                }),
                signal: _ctx,
            },
        );
        return this.parseResponse(resp);
    }

    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        const body: Record<string, unknown> = {
            cancelReason: req.cancelReason,
        };
        if (req.cancelAmount != null) body.cancelAmount = req.cancelAmount;
        if (req.taxFreeAmount != null) body.taxFreeAmount = req.taxFreeAmount;
        if (req.currency) body.currency = req.currency;
        if (req.refundReceiveAccount)
            body.refundReceiveAccount = req.refundReceiveAccount;

        const resp = await fetch(
            `${this.apiUrl}${TOSS_PAYMENTS_API_PATHS.payment}/${encodePathSegment(req.paymentKey)}/cancel`,
            {
                method: "POST",
                headers: this.headers(resolveCancelIdempotencyKey(req)),
                body: JSON.stringify(body),
                signal: _ctx,
            },
        );
        const result = await this.parseResponse(resp);
        const cancelResult: CancelResult = { ...result };
        if (result.cancels?.length) {
            cancelResult.latestCancel =
                result.cancels[result.cancels.length - 1];
        }
        return cancelResult;
    }

    async getPayment(
        _ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        const resp = await fetch(
            `${this.apiUrl}${TOSS_PAYMENTS_API_PATHS.payment}/${encodePathSegment(paymentKey)}`,
            {
                headers: this.headers(),
                signal: _ctx,
            },
        );
        return this.parseResponse(resp);
    }

    /** orderId로 Toss Payments 결제 상태를 조회한다. */
    async getPaymentByOrderId(
        _ctx: AbortSignal | null,
        orderId: string,
    ): Promise<PaymentResult> {
        const resp = await fetch(
            `${this.apiUrl}${TOSS_PAYMENTS_API_PATHS.paymentByOrderId}/${encodePathSegment(orderId)}`,
            {
                headers: this.headers(),
                signal: _ctx,
            },
        );
        return this.parseResponse(resp);
    }

    /** 일반 결제 웹훅은 서명 헤더가 없어 서비스 레이어에서 재조회로 검증한다. */
    async verifyWebhook(
        _ctx: AbortSignal | null,
        _payload: Buffer,
        _signature: string,
    ): Promise<boolean> {
        return true;
    }

    private async parseResponse(resp: Response): Promise<PaymentResult> {
        const text = await resp.text();
        if (resp.status >= 400) {
            try {
                const err = JSON.parse(text) as {
                    code?: string;
                    message?: string;
                };
                if (err.code) throw new PgError(err.code, err.message ?? "");
            } catch (err) {
                if (err instanceof PgError) throw err;
            }
            throw new Error(`toss: API error (status ${resp.status}): ${text}`);
        }
        const raw = JSON.parse(text) as Record<string, unknown>;
        const result = raw as unknown as PaymentResult;
        result._raw = raw;
        result.status = mapTossStatus(result.status);
        return result;
    }
}

function mapTossStatus(s: string): string {
    switch (s) {
        case TOSS_PAYMENTS_STATUSES.READY:
            return ORDER_STATUS.READY;
        case TOSS_PAYMENTS_STATUSES.IN_PROGRESS:
            return ORDER_STATUS.IN_PROGRESS;
        case TOSS_PAYMENTS_STATUSES.WAITING_FOR_DEPOSIT:
            return ORDER_STATUS.WAITING;
        case TOSS_PAYMENTS_STATUSES.DONE:
            return ORDER_STATUS.DONE;
        case TOSS_PAYMENTS_STATUSES.CANCELED:
            return ORDER_STATUS.CANCELED;
        case TOSS_PAYMENTS_STATUSES.PARTIAL_CANCELED:
            return ORDER_STATUS.PARTIAL_CANCELED;
        case TOSS_PAYMENTS_STATUSES.ABORTED:
            return ORDER_STATUS.ABORTED;
        case TOSS_PAYMENTS_STATUSES.EXPIRED:
            return ORDER_STATUS.EXPIRED;
        default:
            return s;
    }
}

/** confirm API에 사용할 안정적인 멱등키를 만든다. */
function resolveConfirmIdempotencyKey(req: ConfirmRequest): string {
    return req.idempotencyKey || `confirm_${req.orderId}`;
}

/** cancel API에 사용할 안정적인 멱등키를 만든다. */
function resolveCancelIdempotencyKey(req: CancelRequest): string {
    return (
        req.idempotencyKey ||
        `cancel_${req.paymentKey}_${req.cancelAmount ?? "all"}`
    );
}

/** URL path segment를 안전하게 인코딩한다. */
function encodePathSegment(value: string): string {
    return encodeURIComponent(value);
}
