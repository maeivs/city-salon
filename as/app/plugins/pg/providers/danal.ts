/**
 * 다날(Danal ONE API) 결제 클라이언트
 *
 * 공식 API 문서: https://developers.danalpay.com/reference/server/confirm
 * Base URL: https://one-api.danalpay.com
 * 인증: HTTP Basic Auth — "Basic " + base64(secretKey + ":")
 * 지원 결제수단: CARD, MOBILE, TRANSFER, VACCOUNT 등
 */

import type {
    PgClient,
    PgProviderConfig,
    ConfirmRequest,
    CancelRequest,
    PaymentResult,
    CancelResult,
    FailureInfo,
} from "../types/index.ts";

export class DanalClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly merchantId: string;
    private readonly authHeader: string;

    constructor(cfg: PgProviderConfig) {
        if (!cfg.cp_id) throw new Error("danal: cp_id is required");
        if (!cfg.secret_key) throw new Error("danal: secret_key is required");

        this._name = cfg.driver;
        this.apiUrl = cfg.api_url || "https://one-api.danalpay.com";
        this.merchantId = cfg.cp_id;
        this.authHeader =
            "Basic " + Buffer.from(cfg.secret_key + ":").toString("base64");
    }

    name(): string {
        return this._name;
    }

    private headers(): Record<string, string> {
        return {
            Authorization: this.authHeader,
            "Content-Type": "application/json",
        };
    }

    /**
     * 결제 승인
     *
     * POST /payments/confirm
     * 필수 파라미터: method, transactionId, merchantId, amount(문자열), orderId
     */
    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const method = req.method || "CARD";
        const resp = await fetch(`${this.apiUrl}/payments/confirm`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
                method,
                transactionId: req.paymentKey,
                merchantId: this.merchantId,
                amount: String(req.amount),
                orderId: req.orderId,
            }),
            signal: _ctx ?? AbortSignal.timeout(60_000),
        });
        return this.doRequest(resp);
    }

    /**
     * 결제 취소
     *
     * POST /payments/cancel
     * 전액 취소: cancelType "C", amount = originalAmount
     * 부분 취소: cancelType "P", amount = cancelAmount
     */
    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        const method = req.method || "CARD";
        let cancelType = "C";
        let amount: number;

        if (req.cancelAmount == null) {
            cancelType = "C";
            amount = req.originalAmount ?? 0;
        } else {
            cancelType = "P";
            amount = req.cancelAmount;
        }

        const resp = await fetch(`${this.apiUrl}/payments/cancel`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
                method,
                transactionId: req.paymentKey,
                merchantId: this.merchantId,
                amount: String(amount),
                cancelType,
                cancelReason: req.cancelReason,
            }),
            signal: _ctx ?? AbortSignal.timeout(60_000),
        });
        const result = await this.doRequest(resp);
        return { ...result };
    }

    /**
     * 결제 조회 — 다날 ONE API에는 공개된 조회 엔드포인트가 없습니다.
     */
    async getPayment(
        _ctx: AbortSignal | null,
        _paymentKey: string,
    ): Promise<PaymentResult> {
        throw new Error(
            "danal: 결제 조회 API는 공개 문서에 제공되지 않습니다. " +
                "다날 기술지원팀(developer@danal.co.kr)에 문의하여 inquiry 엔드포인트를 확인하세요",
        );
    }

    /**
     * 웹훅 검증 — 다날은 별도 서명을 공개하지 않으므로 항상 true 반환
     */
    async verifyWebhook(
        _ctx: AbortSignal | null,
        _payload: Buffer,
        _signature: string,
    ): Promise<boolean> {
        return true;
    }

    private async doRequest(resp: Response): Promise<PaymentResult> {
        const text = await resp.text();

        if (resp.status >= 500) {
            throw new Error(
                `danal: server error (status ${resp.status}): ${text}`,
            );
        }

        const raw = JSON.parse(text) as Record<string, unknown>;
        const result: PaymentResult = {
            paymentKey: "",
            orderId: "",
            orderName: "",
            status: "aborted",
            method: "",
            totalAmount: 0,
            balanceAmount: 0,
            currency: "KRW",
            type: "PAYMENT",
            country: "KR",
            isPartialCancelable: false,
            _raw: raw,
        };

        const code = String(raw.code ?? "");
        const message = String(raw.message ?? "");

        if (code === "SUCCESS") {
            result.status = "done";
            if (raw.transactionId)
                result.paymentKey = String(raw.transactionId);
            if (raw.orderId) result.orderId = String(raw.orderId);
        } else {
            result.status = "aborted";
            result.failure = { code, message } as FailureInfo;
        }

        return result;
    }
}
