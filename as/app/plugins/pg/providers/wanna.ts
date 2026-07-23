/**
 * 워너페이먼츠(Wanna Payments) 결제 클라이언트
 *
 * ref: https://api.wannapayments.co.kr
 */

import type {
    PgClient,
    PgProviderConfig,
    ConfirmRequest,
    CancelRequest,
    PaymentResult,
    CancelResult,
} from "../types/index.ts";
import { PgError } from "../types/index.ts";

export class WannaClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly merchantId: string;
    private readonly apiKey: string;

    constructor(cfg: PgProviderConfig) {
        const mid = cfg.mid || cfg.merchant_id || "";
        const key = cfg.secret_key || cfg.merchant_key || "";
        if (!mid || !key)
            throw new Error(
                "wanna: merchant_id (또는 mid)와 secret_key가 필요합니다",
            );

        this._name = cfg.driver;
        this.apiUrl = cfg.api_url || "https://api.wannapayments.co.kr";
        this.merchantId = mid;
        this.apiKey = key;
    }

    name(): string {
        return this._name;
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
        };
    }

    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const resp = await fetch(`${this.apiUrl}/v1/payments/approval`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
                mid: this.merchantId,
                tid: req.paymentKey,
                orderId: req.orderId,
                amount: req.amount,
            }),
            signal: _ctx,
        });
        return this.parseResponse(resp, "wanna");
    }

    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        const body: Record<string, unknown> = {
            mid: this.merchantId,
            tid: req.paymentKey,
            cancelReason: req.cancelReason,
        };
        if (req.cancelAmount != null) body.cancelAmount = req.cancelAmount;

        const resp = await fetch(`${this.apiUrl}/v1/payments/cancel`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: _ctx,
        });
        const result = await this.parseResponse(resp, "wanna");
        return { ...result };
    }

    async getPayment(
        _ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        const resp = await fetch(`${this.apiUrl}/v1/payments/${paymentKey}`, {
            headers: this.headers(),
            signal: _ctx,
        });
        return this.parseResponse(resp, "wanna");
    }

    async verifyWebhook(
        _ctx: AbortSignal | null,
        _payload: Buffer,
        _signature: string,
    ): Promise<boolean> {
        return true;
    }

    private async parseResponse(
        resp: Response,
        prefix: string,
    ): Promise<PaymentResult> {
        const text = await resp.text();
        if (resp.status >= 400) {
            try {
                const err = JSON.parse(text) as {
                    code?: string;
                    message?: string;
                };
                if (err.code) throw new PgError(err.code, err.message ?? "");
            } catch (e) {
                if (e instanceof PgError) throw e;
            }
            throw new Error(
                `${prefix}: API error (status ${resp.status}): ${text}`,
            );
        }
        const raw = JSON.parse(text) as Record<string, unknown>;
        return normalizeWannaResponse(raw);
    }
}

function normalizeWannaResponse(raw: Record<string, unknown>): PaymentResult {
    return {
        paymentKey: String(raw.tid ?? raw.paymentKey ?? ""),
        orderId: String(raw.orderId ?? ""),
        orderName: String(raw.goodsName ?? ""),
        status: mapWannaStatus(String(raw.status ?? "")),
        method: String(raw.payMethod ?? raw.method ?? ""),
        totalAmount: Number(raw.amount ?? raw.totalAmount ?? 0),
        balanceAmount: Number(raw.remainAmount ?? raw.amount ?? 0),
        currency: String(raw.currency ?? "KRW"),
        type: "PAYMENT",
        country: "KR",
        isPartialCancelable: true,
        _raw: raw,
    };
}

function mapWannaStatus(s: string): string {
    switch (s.toUpperCase()) {
        case "PAID":
        case "APPROVED":
            return "done";
        case "CANCELED":
            return "canceled";
        case "PARTIAL_CANCELED":
            return "partial_canceled";
        case "READY":
            return "ready";
        case "FAILED":
            return "aborted";
        default:
            return s.toLowerCase() || "aborted";
    }
}
