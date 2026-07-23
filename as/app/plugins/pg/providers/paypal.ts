/**
 * PayPal REST API v2 클라이언트
 *
 * 인증: OAuth 2.0 Bearer Token
 *   POST /v1/oauth2/token  (Basic Auth: client_id:client_secret)
 *
 * 주요 엔드포인트:
 *   결제 승인:  POST /v2/checkout/orders/{orderId}/capture
 *   결제 환불:  POST /v2/payments/captures/{captureId}/refund
 *   결제 조회:  GET  /v2/checkout/orders/{orderId}
 *   웹훅 검증:  POST /v1/notifications/verify-webhook-signature
 *
 * Sandbox: https://api-m.sandbox.paypal.com
 * Live:    https://api-m.paypal.com
 *
 * 설정:
 *   client_id      : PayPal OAuth Client ID
 *   secret_key     : PayPal OAuth Client Secret
 *   api_url        : API 기본 URL (기본: sandbox)
 *   webhook_secret : PayPal Webhook ID (웹훅 서명 검증에 사용)
 *
 * ref: https://developer.paypal.com/docs/api/orders/v2/
 */

import type {
    PgClient,
    PgProviderConfig,
    ConfirmRequest,
    CancelRequest,
    PaymentResult,
    CancelResult,
    CancelInfo,
} from "../types/index.ts";
import { PgError, ORDER_STATUS } from "../types/index.ts";

// ─── PayPal API 응답 타입 ─────────────────────────────────────────────────────

interface PayPalTokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

interface PayPalAmount {
    currency_code: string;
    value: string;
}

interface PayPalCapture {
    id: string;
    status: string;
    amount: PayPalAmount;
    final_capture?: boolean;
    create_time?: string;
    update_time?: string;
}

interface PayPalRefund {
    id: string;
    status: string;
    amount: PayPalAmount;
    create_time?: string;
}

interface PayPalPurchaseUnit {
    reference_id?: string;
    payments?: {
        captures?: PayPalCapture[];
        refunds?: PayPalRefund[];
    };
}

interface PayPalOrder {
    id: string;
    status: string;
    purchase_units: PayPalPurchaseUnit[];
    create_time?: string;
    update_time?: string;
}

interface PayPalErrorResponse {
    name?: string;
    message?: string;
    details?: Array<{ issue?: string; description?: string }>;
}

// ─── PayPalClient ─────────────────────────────────────────────────────────────

export class PayPalClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly webhookId: string;

    // Access Token 인메모리 캐시
    private _accessToken = "";
    private _tokenExpiresAt = 0;

    constructor(cfg: PgProviderConfig) {
        this._name = cfg.driver;
        this.apiUrl = cfg.api_url ?? "https://api-m.sandbox.paypal.com";
        this.clientId = cfg.client_id ?? cfg.client_key ?? "";
        this.clientSecret = cfg.secret_key ?? "";
        this.webhookId = cfg.webhook_secret ?? "";
    }

    name(): string {
        return this._name;
    }

    // ─── 인증 ──────────────────────────────────────────────────────────────────

    /** OAuth 2.0 Access Token 취득 (캐시 포함, 만료 30초 전 갱신) */
    private async getAccessToken(ctx: AbortSignal | null): Promise<string> {
        if (this._accessToken && Date.now() < this._tokenExpiresAt) {
            return this._accessToken;
        }

        const cred = Buffer.from(
            `${this.clientId}:${this.clientSecret}`,
        ).toString("base64");

        const resp = await fetch(`${this.apiUrl}/v1/oauth2/token`, {
            method: "POST",
            headers: {
                Authorization: `Basic ${cred}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
            signal: ctx,
        });

        const text = await resp.text();
        if (!resp.ok) {
            throw new PgError(
                "PAYPAL_TOKEN_ERROR",
                `access token 발급 실패 (HTTP ${resp.status}): ${text}`,
            );
        }

        const data = JSON.parse(text) as PayPalTokenResponse;
        this._accessToken = data.access_token;
        this._tokenExpiresAt = Date.now() + (data.expires_in - 30) * 1000;
        return this._accessToken;
    }

    private async bearerHeaders(
        ctx: AbortSignal | null,
    ): Promise<Record<string, string>> {
        const token = await this.getAccessToken(ctx);
        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
    }

    // ─── PgClient 구현 ─────────────────────────────────────────────────────────

    /**
     * 결제 승인: PayPal Order 캡처
     *
     * req.paymentKey = PayPal Order ID (프론트에서 PayPal SDK로 생성한 주문 ID)
     * req.orderId    = 내부 주문 ID
     */
    async confirmPayment(
        ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const headers = await this.bearerHeaders(ctx);

        const resp = await fetch(
            `${this.apiUrl}/v2/checkout/orders/${req.paymentKey}/capture`,
            {
                method: "POST",
                headers,
                // PayPal capture는 body 없이 빈 JSON 전송
                body: "{}",
                signal: ctx,
            },
        );

        const order = await this.parseOrderResponse("capture", resp);
        return this.orderToResult(order, req.orderId);
    }

    /**
     * 결제 취소/환불: 캡처된 결제 환불
     *
     * req.paymentKey = Capture ID (confirmPayment 응답의 paymentKey)
     * req.currency   = 통화 코드 (기본: USD)
     */
    async cancelPayment(
        ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        const headers = await this.bearerHeaders(ctx);

        const body: Record<string, unknown> = {};
        if (req.cancelAmount != null) {
            // 부분 환불: 금액 지정
            body.amount = {
                currency_code: req.currency ?? "USD",
                value: req.cancelAmount.toFixed(2),
            };
        }
        if (req.cancelReason) {
            // PayPal note_to_payer 최대 255자
            body.note_to_payer = req.cancelReason.slice(0, 255);
        }

        const resp = await fetch(
            `${this.apiUrl}/v2/payments/captures/${req.paymentKey}/refund`,
            {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: ctx,
            },
        );

        const text = await resp.text();
        if (!resp.ok) {
            this.throwApiError("refund", resp.status, text);
        }

        const raw = JSON.parse(text) as Record<string, unknown>;
        const refundId = (raw.id as string) ?? "";
        const refundStatus = (raw.status as string) ?? "";
        const amountObj = raw.amount as PayPalAmount | undefined;
        const cancelAmount =
            req.cancelAmount ?? parseFloat(amountObj?.value ?? "0");
        const currency = amountObj?.currency_code ?? req.currency ?? "USD";

        const payResult: PaymentResult = {
            paymentKey: req.paymentKey,
            orderId: "",
            orderName: "",
            status: ORDER_STATUS.CANCELED,
            method: "PAYPAL",
            totalAmount: cancelAmount,
            balanceAmount: 0,
            currency,
            type: "PAYMENT",
            country: "US",
            isPartialCancelable: false,
            _raw: raw,
        };

        const latestCancel: CancelInfo = {
            transactionKey: refundId,
            cancelReason: req.cancelReason,
            cancelAmount,
            canceledAt: (raw.create_time as string) ?? new Date().toISOString(),
            cancelStatus: refundStatus,
            refundableAmount: 0,
        };

        return { ...payResult, latestCancel };
    }

    /**
     * 결제 조회: PayPal Order 상세
     *
     * paymentKey = PayPal Order ID
     */
    async getPayment(
        ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        const headers = await this.bearerHeaders(ctx);

        const resp = await fetch(
            `${this.apiUrl}/v2/checkout/orders/${paymentKey}`,
            { headers, signal: ctx },
        );

        const order = await this.parseOrderResponse("getPayment", resp);
        return this.orderToResult(order, "");
    }

    /**
     * 웹훅 서명 검증
     *
     * signature 형식 ("|" 구분자):
     *   "auth_algo|cert_url|transmission_id|transmission_sig|transmission_time"
     *
     * webhook_id(= webhook_secret 설정값) 미설정 시 항상 true 반환.
     */
    async verifyWebhook(
        ctx: AbortSignal | null,
        payload: Buffer,
        signature: string,
    ): Promise<boolean> {
        if (!this.webhookId) return true;

        try {
            const parts = signature.split("|");
            if (parts.length < 5) return false;
            const [
                authAlgo,
                certUrl,
                transmissionId,
                transmissionSig,
                transmissionTime,
            ] = parts;

            const headers = await this.bearerHeaders(ctx);
            const resp = await fetch(
                `${this.apiUrl}/v1/notifications/verify-webhook-signature`,
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        auth_algo: authAlgo,
                        cert_url: certUrl,
                        transmission_id: transmissionId,
                        transmission_sig: transmissionSig,
                        transmission_time: transmissionTime,
                        webhook_id: this.webhookId,
                        webhook_event: JSON.parse(payload.toString()),
                    }),
                    signal: ctx,
                },
            );

            if (!resp.ok) return false;
            const data = (await resp.json()) as {
                verification_status?: string;
            };
            return data.verification_status === "SUCCESS";
        } catch {
            return false;
        }
    }

    // ─── 내부 헬퍼 ─────────────────────────────────────────────────────────────

    private async parseOrderResponse(
        op: string,
        resp: Response,
    ): Promise<PayPalOrder> {
        const text = await resp.text();
        if (!resp.ok) {
            this.throwApiError(op, resp.status, text);
        }
        return JSON.parse(text) as PayPalOrder;
    }

    private throwApiError(op: string, status: number, body: string): never {
        try {
            const err = JSON.parse(body) as PayPalErrorResponse;
            const detail = err.details?.length
                ? ` (${err.details[0].issue ?? ""}: ${err.details[0].description ?? ""})`
                : "";
            throw new PgError(
                err.name ?? "PAYPAL_ERROR",
                `${op}: ${err.message ?? ""}${detail}`,
            );
        } catch (e) {
            if (e instanceof PgError) throw e;
        }
        throw new PgError("PAYPAL_ERROR", `${op}: HTTP ${status} - ${body}`);
    }

    private orderToResult(order: PayPalOrder, orderId: string): PaymentResult {
        const unit = order.purchase_units?.[0];
        const capture = unit?.payments?.captures?.[0];
        const amountValue = parseFloat(capture?.amount?.value ?? "0");
        const currency = capture?.amount?.currency_code ?? "USD";

        // confirmPayment 후에는 capture ID를 paymentKey로 사용
        const paymentKey = capture?.id ?? order.id;

        const cancels = (unit?.payments?.refunds ?? []).map(
            (r): CancelInfo => ({
                transactionKey: r.id,
                cancelReason: "",
                cancelAmount: parseFloat(r.amount?.value ?? "0"),
                canceledAt: r.create_time ?? "",
                cancelStatus: r.status,
                refundableAmount: 0,
            }),
        );

        return {
            paymentKey,
            orderId: orderId || unit?.reference_id || "",
            orderName: "",
            status: mapPayPalStatus(order.status),
            method: "PAYPAL",
            totalAmount: amountValue,
            balanceAmount: amountValue,
            currency,
            requestedAt: order.create_time,
            approvedAt: capture?.create_time ?? order.update_time,
            type: "PAYMENT",
            country: "US",
            isPartialCancelable: true,
            cancels: cancels.length ? cancels : undefined,
            _raw: order as unknown as Record<string, unknown>,
        };
    }
}

// ─── PayPal status → ORDER_STATUS 매핑 ────────────────────────────────────────

function mapPayPalStatus(s: string): string {
    switch (s) {
        case "CREATED":
        case "SAVED":
            return ORDER_STATUS.READY;
        case "APPROVED":
        case "PAYER_ACTION_REQUIRED":
            return ORDER_STATUS.IN_PROGRESS;
        case "COMPLETED":
            return ORDER_STATUS.DONE;
        case "VOIDED":
            return ORDER_STATUS.ABORTED;
        default:
            return s;
    }
}
