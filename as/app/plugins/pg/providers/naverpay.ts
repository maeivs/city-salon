/**
 * 네이버페이 결제 클라이언트 (주문형)
 *
 * 인증: HTTP 헤더 방식
 *   X-Naver-Client-Id     : 가맹점 클라이언트 ID
 *   X-Naver-Client-Secret : 가맹점 클라이언트 시크릿
 *   X-NaverPay-Chain-Id   : 가맹점 체인 ID
 *
 * 운영 도메인: https://pay.paygate.naver.com
 *
 * 주요 API 엔드포인트:
 *   결제 승인: POST /naverpay-partner/naverpay/payments/v2.2/apply/payment (form-urlencoded)
 *   결제 취소: POST /naverpay-partner/naverpay/payments/v1/cancel (form-urlencoded)
 *   결제 조회: POST /naverpay-partner/naverpay/payments/v2.2/list/history/{paymentId} (JSON)
 *
 * ref: https://docs.pay.naver.com/docs/onetime-payment/onetime-payment-overview
 */

import type {
    PgClient,
    PgProviderConfig,
    ConfirmRequest,
    CancelRequest,
    PaymentResult,
    CancelResult,
    CardInfo,
    EasyPayInfo,
    CancelInfo,
} from "../types/index.ts";

export class NaverPayClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly chainId: string;

    constructor(cfg: PgProviderConfig) {
        if (!cfg.client_key || !cfg.secret_key || !cfg.mid)
            throw new Error(
                "naverpay: client_key, secret_key, mid (chain_id)가 필요합니다",
            );
        this._name = cfg.driver;
        this.apiUrl = cfg.api_url || "https://pay.paygate.naver.com";
        this.clientId = cfg.client_key;
        this.clientSecret = cfg.secret_key;
        this.chainId = cfg.mid;
    }

    name(): string {
        return this._name;
    }

    private setHeaders(contentType: string): Record<string, string> {
        return {
            "X-Naver-Client-Id": this.clientId,
            "X-Naver-Client-Secret": this.clientSecret,
            "X-NaverPay-Chain-Id": this.chainId,
            "Content-Type": contentType,
        };
    }

    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const params = new URLSearchParams();
        params.set("paymentId", req.paymentKey);

        const resp = await fetch(
            `${this.apiUrl}/naverpay-partner/naverpay/payments/v2.2/apply/payment`,
            {
                method: "POST",
                headers: this.setHeaders("application/x-www-form-urlencoded"),
                body: params.toString(),
                signal: _ctx,
            },
        );

        const raw = await this.parseApiResponse(resp, "naverpay", "confirm");
        const body = raw.body as {
            paymentId?: string;
            detail?: NaverPayDetail;
        };
        return this.detailToPaymentResult(
            body?.paymentId ?? "",
            body?.detail ?? ({} as NaverPayDetail),
        );
    }

    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        // 취소 금액: cancelAmount 없으면 originalAmount 전액 취소
        const cancelAmount = req.cancelAmount ?? req.originalAmount ?? 0;

        // 과세/면세 금액
        let taxScopeAmount = cancelAmount;
        let taxExScopeAmount = 0;
        if (req.taxFreeAmount != null) {
            taxExScopeAmount = req.taxFreeAmount;
            taxScopeAmount = cancelAmount - taxExScopeAmount;
        }

        const params = new URLSearchParams();
        params.set("paymentId", req.paymentKey);
        params.set("cancelAmount", String(cancelAmount));
        params.set("cancelReason", req.cancelReason);
        params.set("cancelRequester", "2"); // 2: 가맹점 관리자
        params.set("taxScopeAmount", String(taxScopeAmount));
        params.set("taxExScopeAmount", String(taxExScopeAmount));

        const resp = await fetch(
            `${this.apiUrl}/naverpay-partner/naverpay/payments/v1/cancel`,
            {
                method: "POST",
                headers: this.setHeaders("application/x-www-form-urlencoded"),
                body: params.toString(),
                signal: _ctx,
            },
        );

        const raw = await this.parseApiResponse(resp, "naverpay", "cancel");
        const body = raw.body as {
            paymentId?: string;
            payHistId?: string;
            primaryPayMeans?: string;
            primaryPayCancelAmount?: number;
            primaryPayRestAmount?: number;
            cancelYmdt?: string;
            totalRestAmount?: number;
        };

        const payResult: PaymentResult = {
            paymentKey: body?.paymentId ?? "",
            orderId: "",
            orderName: "",
            status: "canceled",
            method: body?.primaryPayMeans ?? "",
            totalAmount: cancelAmount,
            balanceAmount: body?.totalRestAmount ?? 0,
            currency: "KRW",
            type: "PAYMENT",
            country: "KR",
            isPartialCancelable: (body?.totalRestAmount ?? 0) > 0,
            _raw: raw as unknown as Record<string, unknown>,
        };

        const latestCancel: CancelInfo = {
            transactionKey: body?.payHistId ?? "",
            cancelReason: req.cancelReason,
            cancelAmount,
            canceledAt: body?.cancelYmdt ?? "",
            cancelStatus: "DONE",
            refundableAmount: body?.totalRestAmount ?? 0,
        };

        return { ...payResult, latestCancel };
    }

    async getPayment(
        _ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        // 결제 조회: POST (JSON body)
        const resp = await fetch(
            `${this.apiUrl}/naverpay-partner/naverpay/payments/v2.2/list/history/${paymentKey}`,
            {
                method: "POST",
                headers: this.setHeaders("application/json"),
                body: JSON.stringify({
                    pageNumber: 1,
                    rowsPerPage: 1,
                }),
                signal: _ctx,
            },
        );

        const raw = await this.parseApiResponse(resp, "naverpay", "getpayment");
        const body = raw.body as {
            list?: NaverPayDetail[];
            totalCount?: number;
        };
        if (!body?.list?.length) {
            throw new Error(`naverpay: payment not found: ${paymentKey}`);
        }

        return this.detailToPaymentResult(paymentKey, body.list[0]);
    }

    async verifyWebhook(
        _ctx: AbortSignal | null,
        _payload: Buffer,
        _signature: string,
    ): Promise<boolean> {
        // 네이버페이는 IP 화이트리스트 + HTTPS 기반 신뢰
        return true;
    }

    // ─── 내부 헬퍼 ───────────────────────────────────────────

    private async parseApiResponse(
        resp: Response,
        prefix: string,
        op: string,
    ): Promise<{ code: string; message: string; body: unknown }> {
        const text = await resp.text();
        if (resp.status >= 500) {
            throw new Error(`${prefix}: server error ${resp.status}: ${text}`);
        }

        const raw = JSON.parse(text) as {
            code?: string;
            message?: string;
            body?: unknown;
        };

        if (raw.code !== "Success") {
            throw new Error(
                `${prefix}: ${op} failed: code=${raw.code}, message=${raw.message}`,
            );
        }

        return {
            code: raw.code ?? "",
            message: raw.message ?? "",
            body: raw.body,
        };
    }

    private detailToPaymentResult(
        paymentId: string,
        d: NaverPayDetail,
    ): PaymentResult {
        let status = "done";
        switch (d.admissionTypeCode) {
            case "03":
                status = "canceled";
                break;
            case "04":
                status = "partial_canceled";
                break;
        }

        const result: PaymentResult = {
            paymentKey: paymentId,
            orderId: d.merchantPayKey ?? "",
            orderName: d.productName ?? "",
            status,
            method: d.primaryPayMeans ?? "",
            totalAmount: d.totalPayAmount ?? 0,
            balanceAmount: d.totalPayAmount ?? 0,
            currency: "KRW",
            approvedAt: d.admissionYmdt ?? undefined,
            type: "PAYMENT",
            country: "KR",
            isPartialCancelable: true,
            easyPay: {
                provider: "NAVER",
                amount: d.totalPayAmount ?? 0,
                discountAmount: 0,
            },
        };

        if (d.cardAuthNo) {
            result.card = {
                issuerCode: d.cardCorpCode ?? "",
                acquirerCode: "",
                number: d.cardNo ?? "",
                installmentPlanMonths: d.cardInstCount ?? 0,
                cardType: "",
                ownerType: "",
                approveNo: d.cardAuthNo,
                amount: d.totalPayAmount ?? 0,
                isInterestFree: false,
            };
        }

        return result;
    }
}

interface NaverPayDetail {
    paymentId?: string;
    payHistId?: string;
    merchantPayKey?: string;
    merchantUserKey?: string;
    admissionTypeCode?: string; // 01:원결제, 03:전액취소, 04:부분취소
    admissionYmdt?: string; // yyyyMMddHHmmss
    admissionState?: string; // SUCCESS / FAIL
    totalPayAmount?: number;
    primaryPayMeans?: string; // CARD / BANK
    cardCorpCode?: string;
    cardNo?: string;
    cardAuthNo?: string;
    cardInstCount?: number;
    productName?: string;
}
