/**
 * 카카오페이 결제 클라이언트
 *
 * ref: https://developers.kakaopay.com/docs/payment/online/common
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

export class KakaoPayClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly secretKey: string;
    private readonly cid: string;

    constructor(cfg: PgProviderConfig) {
        if (!cfg.secret_key)
            throw new Error("kakaopay: secret_key가 필요합니다");
        if (!cfg.mid) throw new Error("kakaopay: mid (cid)가 필요합니다");
        this._name = cfg.driver;
        this.apiUrl = cfg.api_url || "https://open-api.kakaopay.com";
        this.secretKey = cfg.secret_key;
        this.cid = cfg.mid;
    }

    name(): string {
        return this._name;
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `SECRET_KEY ${this.secretKey}`,
            "Content-Type": "application/json",
        };
    }

    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        // PaymentKey = "tid:pg_token" 형식 파싱
        const parts = req.paymentKey.split(":", 2);
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new Error(
                `kakaopay: invalid PaymentKey format, expected "tid:pg_token", got "${req.paymentKey}"`,
            );
        }
        const [tid, pgToken] = parts;

        const resp = await fetch(`${this.apiUrl}/online/v1/payment/approve`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
                cid: this.cid,
                tid,
                partner_order_id: req.orderId,
                partner_user_id: req.orderId, // fallback: orderID를 user id로 사용
                pg_token: pgToken,
            }),
            signal: _ctx,
        });
        return this.parseResponse(resp, "kakaopay");
    }

    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        // cancelAmount가 없으면 originalAmount로 전액 취소
        const cancelAmount = req.cancelAmount ?? req.originalAmount ?? 0;
        const taxFreeAmount = req.taxFreeAmount ?? 0;

        const body: Record<string, unknown> = {
            cid: this.cid,
            tid: req.paymentKey,
            cancel_amount: cancelAmount,
            cancel_tax_free_amount: taxFreeAmount,
        };

        const resp = await fetch(`${this.apiUrl}/online/v1/payment/cancel`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: _ctx,
        });
        const result = await this.parseResponse(resp, "kakaopay");
        return { ...result };
    }

    async getPayment(
        _ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        // 카카오페이 주문 조회: POST /online/v1/payment/order (JSON body)
        const resp = await fetch(`${this.apiUrl}/online/v1/payment/order`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
                cid: this.cid,
                tid: paymentKey,
            }),
            signal: _ctx,
        });
        return this.parseResponse(resp, "kakaopay");
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
        if (resp.status >= 500) {
            throw new Error(
                `${prefix}: server error (status ${resp.status}): ${text}`,
            );
        }
        if (resp.status !== 200) {
            try {
                const err = JSON.parse(text) as {
                    error_code?: number;
                    error_message?: string;
                };
                if (err.error_code != null)
                    throw new PgError(
                        String(err.error_code),
                        err.error_message ?? "",
                    );
            } catch (e) {
                if (e instanceof PgError) throw e;
            }
            throw new Error(
                `${prefix}: API error (status ${resp.status}): ${text}`,
            );
        }
        const raw = JSON.parse(text) as Record<string, unknown>;
        return normalizeKakaoPayResponse(raw);
    }
}

function normalizeKakaoPayResponse(
    raw: Record<string, unknown>,
): PaymentResult {
    const amount = (raw.amount ?? {}) as Record<string, unknown>;
    const cancelAvailable = (raw.cancel_available_amount ?? {}) as Record<
        string,
        unknown
    >;
    const cardInfo = raw.card_info as Record<string, unknown> | undefined;
    const status = mapKakaoStatus(String(raw.status ?? ""));

    const result: PaymentResult = {
        paymentKey: String(raw.tid ?? ""),
        orderId: String(raw.partner_order_id ?? ""),
        orderName: String(raw.item_name ?? ""),
        status,
        method: String(raw.payment_method_type ?? ""),
        totalAmount: Number(amount.total ?? 0),
        balanceAmount: Number(cancelAvailable.total ?? amount.total ?? 0),
        currency: "KRW",
        type: "PAYMENT",
        country: "KR",
        isPartialCancelable: Number(cancelAvailable.total ?? 0) > 0,
        easyPay: {
            provider: "KAKAOPAY",
            amount:
                Number(amount.total ?? 0) -
                Number(amount.point ?? 0) -
                Number(amount.discount ?? 0),
            discountAmount: Number(amount.discount ?? 0),
        },
        _raw: raw,
    };

    if (cardInfo) {
        let installMonths = 0;
        const im = cardInfo.install_month;
        if (typeof im === "string") installMonths = parseInt(im, 10) || 0;
        else if (typeof im === "number") installMonths = im;

        result.card = {
            issuerCode: String(cardInfo.kakaopay_issuer_corp_code ?? ""),
            acquirerCode: String(cardInfo.kakaopay_purchase_corp_code ?? ""),
            number: String(cardInfo.bin ?? ""),
            installmentPlanMonths: installMonths,
            cardType: String(cardInfo.card_type ?? ""),
            ownerType: "",
            approveNo: String(cardInfo.approved_id ?? ""),
            amount: Number(amount.total ?? 0),
            isInterestFree: cardInfo.interest_free_install === "Y",
        };
    }

    return result;
}

function mapKakaoStatus(s: string): string {
    switch (s) {
        case "READY":
            return "ready";
        case "SEND_TMS":
            return "in_progress";
        case "OPEN_PAYMENT":
            return "in_progress";
        case "SELECT_METHOD":
            return "in_progress";
        case "ARS_WAITING":
            return "waiting";
        case "AUTH_PASSWORD":
            return "in_progress";
        case "ISSUED_SID":
            return "in_progress";
        case "SUCCESS_PAYMENT":
            return "done";
        case "PART_CANCEL_PAYMENT":
            return "partial_canceled";
        case "CANCEL_PAYMENT":
            return "canceled";
        case "FAIL_AUTH_PASSWORD":
            return "aborted";
        case "QUIT_PAYMENT":
            return "aborted";
        case "FAIL_PAYMENT":
            return "aborted";
        default:
            return s.toLowerCase() || "aborted";
    }
}
