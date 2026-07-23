/**
 * PAYCO 결제 클라이언트
 *
 * 인증: HTTP 헤더 방식
 *   X-Nncp-Client-Id : 클라이언트 ID (cfg.client_key)
 *
 * 요청 바디에 sellerKey 포함 (cfg.secret_key)
 *
 * 기본 URL: https://crossplatform.payco.com
 *
 * 주요 API 엔드포인트:
 *   결제 승인: POST /v1/payment/completeConfirm
 *   결제 취소: POST /v1/payment/cancel
 *   결제 조회: POST /v1/payment/pay/info
 *
 * 성공 판별: header.isSuccessful == true
 *
 * ref: https://developers.payco.com
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

export class PaycoClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly clientId: string;
    private readonly sellerKey: string;

    constructor(cfg: PgProviderConfig) {
        if (!cfg.secret_key)
            throw new Error("payco: secret_key (sellerKey)가 필요합니다");
        this._name = cfg.driver;
        this.apiUrl = cfg.api_url || "https://crossplatform.payco.com";
        this.clientId = cfg.client_key || "";
        this.sellerKey = cfg.secret_key;
    }

    name(): string {
        return this._name;
    }

    private setHeaders(req: Record<string, string>): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...req,
        };
        if (this.clientId) {
            headers["X-Nncp-Client-Id"] = this.clientId;
        }
        return headers;
    }

    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const body: Record<string, unknown> = {
            sellerKey: this.sellerKey,
            orderId: req.orderId,
            totalPrice: req.amount,
        };
        if (this.clientId) body.clientId = this.clientId;

        const resp = await fetch(`${this.apiUrl}/v1/payment/completeConfirm`, {
            method: "POST",
            headers: this.setHeaders({}),
            body: JSON.stringify(body),
            signal: _ctx,
        });

        const apiResp = await this.parseApiResponse(resp, "payco", "confirm");
        const data = apiResp.data as {
            paymentDetail?: PaycoPaymentDetail;
        };
        return paycoDetailToResult(
            data?.paymentDetail ?? ({} as PaycoPaymentDetail),
        );
    }

    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        // cancelAmount 없으면 originalAmount로 전액 취소
        const cancelPrice = req.cancelAmount ?? req.originalAmount ?? 0;

        const body: Record<string, unknown> = {
            sellerKey: this.sellerKey,
            orderId: req.paymentKey,
            cancelPrice,
            cancelReason: req.cancelReason,
        };
        if (this.clientId) body.clientId = this.clientId;

        const resp = await fetch(`${this.apiUrl}/v1/payment/cancel`, {
            method: "POST",
            headers: this.setHeaders({}),
            body: JSON.stringify(body),
            signal: _ctx,
        });

        const apiResp = await this.parseApiResponse(resp, "payco", "cancel");
        const data = apiResp.data as {
            paymentDetail?: PaycoPaymentDetail;
            cancelPrice?: number;
            cancelYmdt?: string;
        };
        const d = data?.paymentDetail ?? ({} as PaycoPaymentDetail);
        const restAmount = (d.totalPrice ?? 0) - cancelPrice;

        const payResult: PaymentResult = {
            paymentKey: d.paymentNo ?? "",
            orderId: d.orderId ?? "",
            orderName: "",
            status: "canceled",
            method: d.payMethod ?? "",
            totalAmount: d.totalPrice ?? 0,
            balanceAmount: restAmount,
            currency: "KRW",
            type: "PAYMENT",
            country: "KR",
            isPartialCancelable: restAmount > 0,
        };

        const latestCancel: CancelInfo = {
            transactionKey: "",
            cancelReason: req.cancelReason,
            cancelAmount: cancelPrice,
            canceledAt: data?.cancelYmdt ?? "",
            cancelStatus: "DONE",
            refundableAmount: restAmount,
        };

        return { ...payResult, latestCancel };
    }

    async getPayment(
        _ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        const body: Record<string, unknown> = {
            sellerKey: this.sellerKey,
            orderId: paymentKey,
        };
        if (this.clientId) body.clientId = this.clientId;

        const resp = await fetch(`${this.apiUrl}/v1/payment/pay/info`, {
            method: "POST",
            headers: this.setHeaders({}),
            body: JSON.stringify(body),
            signal: _ctx,
        });

        const apiResp = await this.parseApiResponse(
            resp,
            "payco",
            "getpayment",
        );
        const data = apiResp.data as {
            paymentDetailList?: PaycoPaymentDetail[];
        };
        if (!data?.paymentDetailList?.length) {
            throw new Error(`payco: payment not found: ${paymentKey}`);
        }
        return paycoDetailToResult(data.paymentDetailList[0]);
    }

    async verifyWebhook(
        _ctx: AbortSignal | null,
        _payload: Buffer,
        _signature: string,
    ): Promise<boolean> {
        // PAYCO는 HTTPS + IP 화이트리스트 기반 신뢰
        return true;
    }

    private async parseApiResponse(
        resp: Response,
        prefix: string,
        op: string,
    ): Promise<{
        header: {
            isSuccessful: boolean;
            resultCode: number;
            resultMessage: string;
        };
        data: unknown;
    }> {
        const text = await resp.text();
        if (resp.status >= 500) {
            throw new Error(`${prefix}: server error ${resp.status}: ${text}`);
        }
        const raw = JSON.parse(text) as {
            header?: {
                isSuccessful?: boolean;
                resultCode?: number;
                resultMessage?: string;
            };
            data?: unknown;
        };
        const header = raw.header ?? {
            isSuccessful: false,
            resultCode: -1,
            resultMessage: "",
        };
        if (!header.isSuccessful) {
            throw new Error(
                `${prefix}: ${op} failed: code=${header.resultCode}, message=${header.resultMessage}`,
            );
        }
        return {
            header: {
                isSuccessful: header.isSuccessful ?? false,
                resultCode: header.resultCode ?? 0,
                resultMessage: header.resultMessage ?? "",
            },
            data: raw.data,
        };
    }
}

interface PaycoPaymentDetail {
    orderId?: string;
    paymentNo?: string;
    sellerKey?: string;
    totalPrice?: number;
    approvalYmdt?: string;
    paymentState?: string; // APPROVAL / CANCEL 등
    payMethod?: string;
    cardName?: string;
    cardNo?: string;
    installMonth?: number;
}

function paycoDetailToResult(d: PaycoPaymentDetail): PaymentResult {
    let status = "done";
    switch (d.paymentState) {
        case "CANCEL":
        case "PARTIAL_CANCEL":
            status = "canceled";
            break;
        case "READY":
            status = "ready";
            break;
    }

    const result: PaymentResult = {
        paymentKey: d.paymentNo ?? "",
        orderId: d.orderId ?? "",
        orderName: "",
        status,
        method: d.payMethod ?? "",
        totalAmount: d.totalPrice ?? 0,
        balanceAmount: d.totalPrice ?? 0,
        currency: "KRW",
        approvedAt: d.approvalYmdt ?? undefined,
        type: "PAYMENT",
        country: "KR",
        isPartialCancelable: true,
        easyPay: {
            provider: "PAYCO",
            amount: d.totalPrice ?? 0,
            discountAmount: 0,
        },
    };

    if (d.cardNo) {
        result.card = {
            issuerCode: "",
            acquirerCode: d.cardName ?? "",
            number: d.cardNo,
            installmentPlanMonths: d.installMonth ?? 0,
            cardType: "",
            ownerType: "",
            approveNo: "",
            amount: d.totalPrice ?? 0,
            isInterestFree: false,
        };
    }

    return result;
}
