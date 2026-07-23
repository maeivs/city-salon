/**
 * KG 이니시스 결제 클라이언트
 *
 * ref: https://manual.inicis.com
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

export class InicisClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly storeId: string;
    private readonly signKey: string;

    constructor(cfg: PgProviderConfig) {
        this._name = cfg.driver;
        this.apiUrl = cfg.api_url || "https://api.inicis.com";
        this.storeId = cfg.store_id || "";
        this.signKey = cfg.sign_key || "";
    }

    name(): string {
        return this._name;
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `SignKey ${this.signKey}`,
            "Content-Type": "application/json",
        };
    }

    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const resp = await fetch(`${this.apiUrl}/v1/formpay/approval`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
                tid: req.paymentKey,
                oid: req.orderId,
                price: req.amount,
                mid: this.storeId,
            }),
            signal: _ctx,
        });
        return this.parseResponse(resp, "inicis");
    }

    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        const body: Record<string, unknown> = {
            tid: req.paymentKey,
            msg: req.cancelReason,
            mid: this.storeId,
        };
        if (req.cancelAmount != null) body.price = req.cancelAmount;

        const resp = await fetch(`${this.apiUrl}/v1/refund`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: _ctx,
        });
        const result = await this.parseResponse(resp, "inicis");
        return { ...result };
    }

    async getPayment(
        _ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        const resp = await fetch(
            `${this.apiUrl}/v1/receipt/${paymentKey}?mid=${this.storeId}`,
            {
                headers: this.headers(),
                signal: _ctx,
            },
        );
        return this.parseResponse(resp, "inicis");
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
                    resultCode?: string;
                    resultMsg?: string;
                };
                if (err.resultCode && err.resultCode !== "00") {
                    throw new PgError(err.resultCode, err.resultMsg ?? "");
                }
            } catch (e) {
                if (e instanceof PgError) throw e;
            }
            throw new Error(
                `${prefix}: API error (status ${resp.status}): ${text}`,
            );
        }
        const raw = JSON.parse(text) as Record<string, unknown>;
        return normalizeInicisResponse(raw);
    }
}

function normalizeInicisResponse(raw: Record<string, unknown>): PaymentResult {
    const code = String(raw.resultCode ?? "");
    const result: PaymentResult = {
        paymentKey: String(raw.tid ?? ""),
        orderId: String(raw.oid ?? ""),
        orderName: String(raw.goods ?? ""),
        status: code === "00" ? "done" : "aborted",
        method: String(raw.payMethod ?? ""),
        totalAmount: Number(raw.price ?? 0),
        balanceAmount: Number(raw.price ?? 0),
        currency: "KRW",
        type: "PAYMENT",
        country: "KR",
        isPartialCancelable: false,
        _raw: raw,
    };
    if (code !== "00" && code !== "") {
        result.failure = {
            code,
            message: String(raw.resultMsg ?? ""),
        };
    }
    return result;
}
