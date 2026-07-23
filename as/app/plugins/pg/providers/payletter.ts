/**
 * 페이레터 (Payletter) 결제 클라이언트
 *
 * 페이레터는 리다이렉트 기반 결제 방식입니다.
 *   1. POST /v1.0/payments/request → token + online_url / mobile_url 반환
 *   2. 사용자가 결제창에서 결제 완료
 *   3. callback_url 로 결제 결과(tid, cid, amount, payhash …) 수신
 *   4. return_url 로 결제자 화면 복귀
 *
 * ref: https://www.payletter.com/ko/m/technical/index#payletter
 *
 * Authorization:
 *   결제(PAYMENT) — PLKEY {api_key}
 *   조회(SEARCH)  — PLKEY {api_key_search}
 *
 * 주요 엔드포인트:
 *   POST v1.0/payments/request       결제 요청 (token 발급)
 *   POST v1.0/payments/cancel        전체 취소
 *   POST v1.0/payments/cancel/partial 부분 취소
 *   POST v1.0/payments/status        거래 상태 조회 (order_no 기반)
 *   GET  v1.0/payments/transaction/list 결제 내역 조회 (SEARCH Key)
 */

import { createHash } from "node:crypto";
import type {
    PgClient,
    PgProviderConfig,
    ConfirmRequest,
    CancelRequest,
    PaymentResult,
    CancelResult,
} from "../types/index.ts";
import { PgError, ORDER_STATUS } from "../types/index.ts";

// ─── 내부 타입 ───────────────────────────────────────────────────────────────

interface PayletterErrorBody {
    code?: number;
    message?: string;
}

interface PayletterStatusResponse {
    code: number;
    message: string;
    client_id: string;
    order_no: string;
    token?: string;
    tid?: string;
    status_code: number; // 1:생성, 2:진입, 3:인증, 4:실패, 5:완료
}

interface PayletterCancelResponse {
    tid: string;
    cid: string;
    amount: number;
    cancel_date: string;
}

/** callback_url 로 수신되는 결제 결과 페이로드 */
export interface PayletterCallbackPayload {
    user_id: string;
    user_name?: string;
    amount: number;
    tax_amount?: number;
    taxfree_amount?: number;
    tid: string;
    cid: string;
    order_no: string;
    service_name?: string;
    product_name?: string;
    custom_parameter?: string;
    transaction_date: string;
    pay_info?: string;
    pgcode: string;
    domestic_flag?: string;
    billkey?: string;
    card_info?: string;
    payhash: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class PayletterClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly clientId: string;
    private readonly apiKey: string; // PAYMENT Key
    private readonly apiKeySearch: string; // SEARCH Key

    constructor(cfg: PgProviderConfig) {
        if (!cfg.client_id)
            throw new Error("payletter: client_id가 필요합니다");
        if (!cfg.api_key) throw new Error("payletter: api_key가 필요합니다");

        this._name = cfg.driver;
        this.apiUrl = cfg.api_url || "https://pgapi.payletter.com";
        this.clientId = cfg.client_id;
        this.apiKey = cfg.api_key;
        this.apiKeySearch = cfg.api_key_search || cfg.api_key;
    }

    name(): string {
        return this._name;
    }

    // ─── Auth ─────────────────────────────────────────────────────────────

    /** 결제(PAYMENT)용 헤더 */
    private paymentHeaders(): Record<string, string> {
        return {
            Authorization: `PLKEY ${this.apiKey}`,
            "Content-Type": "application/json",
        };
    }

    /** 조회(SEARCH)용 헤더 */
    private searchHeaders(): Record<string, string> {
        return {
            Authorization: `PLKEY ${this.apiKeySearch}`,
            "Content-Type": "application/json",
        };
    }

    // ─── PgClient 구현 ────────────────────────────────────────────────────

    /**
     * 결제 확인 — callback 수신 후 상태 검증에 사용
     *
     * req.paymentKey = tid (callback 에서 수신)
     * req.orderId    = order_no (가맹점 주문번호)
     *
     * POST /v1.0/payments/status 로 status_code === 5(완료) 검증 후 반환
     */
    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const resp = await fetch(`${this.apiUrl}/v1.0/payments/status`, {
            method: "POST",
            headers: this.paymentHeaders(),
            body: JSON.stringify({
                client_id: this.clientId,
                order_no: req.orderId,
            }),
            signal: _ctx ?? undefined,
        });

        const statusResp = await this.parseJson<PayletterStatusResponse>(
            resp,
            "confirmPayment",
        );

        if (statusResp.status_code !== 5) {
            throw new PgError(
                String(statusResp.status_code),
                `payletter: 결제 미완료 상태 (status_code=${statusResp.status_code})`,
            );
        }

        // tid 가 응답에 없으면 req.paymentKey 사용
        const tid = statusResp.tid || req.paymentKey;

        return {
            paymentKey: tid,
            orderId: statusResp.order_no,
            orderName: "",
            status: ORDER_STATUS.DONE,
            method: "payletter",
            totalAmount: req.amount,
            balanceAmount: req.amount,
            currency: "KRW",
            type: "PAYMENT",
            country: "KR",
            isPartialCancelable: true,
            _raw: statusResp as unknown as Record<string, unknown>,
        };
    }

    /**
     * 결제 취소
     *
     * cancelAmount 가 없거나 totalAmount 와 동일 → 전체 취소
     * cancelAmount < totalAmount → 부분 취소
     */
    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        const isPartial =
            req.cancelAmount != null &&
            req.originalAmount != null &&
            req.cancelAmount < req.originalAmount;

        const endpoint = isPartial
            ? `${this.apiUrl}/v1.0/payments/cancel/partial`
            : `${this.apiUrl}/v1.0/payments/cancel`;

        const body: Record<string, unknown> = {
            pgcode: req.method || "creditcard",
            client_id: this.clientId,
            user_id: "", // 서비스 레이어에서 채울 수 없으므로 빈 값 (필수)
            tid: req.paymentKey,
            ip_addr: "127.0.0.1",
        };

        if (isPartial) {
            body.amount = req.cancelAmount;
            if (req.taxFreeAmount != null)
                body.taxfree_amount = req.taxFreeAmount;
        }

        const resp = await fetch(endpoint, {
            method: "POST",
            headers: this.paymentHeaders(),
            body: JSON.stringify(body),
            signal: _ctx ?? undefined,
        });

        const cancelResp = await this.parseJson<PayletterCancelResponse>(
            resp,
            "cancelPayment",
        );

        return {
            paymentKey: cancelResp.tid,
            orderId: req.paymentKey,
            orderName: "",
            status: isPartial
                ? ORDER_STATUS.PARTIAL_CANCELED
                : ORDER_STATUS.CANCELED,
            method: req.method || "payletter",
            totalAmount: cancelResp.amount,
            balanceAmount: 0,
            currency: "KRW",
            type: "CANCEL",
            country: "KR",
            isPartialCancelable: isPartial,
            _raw: cancelResp as unknown as Record<string, unknown>,
            latestCancel: {
                transactionKey: cancelResp.cid,
                cancelReason: req.cancelReason,
                cancelAmount: cancelResp.amount,
                canceledAt: cancelResp.cancel_date,
                cancelStatus: "DONE",
                refundableAmount: 0,
            },
        };
    }

    /**
     * 결제 상태 조회
     *
     * paymentKey 를 order_no 로 사용해 POST /v1.0/payments/status 호출
     * (DB 에 최초 저장 시 payment_key = order_no → 이후 tid 로 갱신되는 흐름)
     */
    async getPayment(
        _ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        const resp = await fetch(`${this.apiUrl}/v1.0/payments/status`, {
            method: "POST",
            headers: this.paymentHeaders(),
            body: JSON.stringify({
                client_id: this.clientId,
                order_no: paymentKey,
            }),
            signal: _ctx ?? undefined,
        });

        const statusResp = await this.parseJson<PayletterStatusResponse>(
            resp,
            "getPayment",
        );

        return {
            paymentKey: statusResp.tid || paymentKey,
            orderId: statusResp.order_no,
            orderName: "",
            status: mapPayletterStatus(statusResp.status_code),
            method: "payletter",
            totalAmount: 0,
            balanceAmount: 0,
            currency: "KRW",
            type: "PAYMENT",
            country: "KR",
            isPartialCancelable: true,
            _raw: statusResp as unknown as Record<string, unknown>,
        };
    }

    /**
     * 웹훅(callback) 서명 검증
     *
     * 페이레터 payhash 검증:
     *   SHA256(user_id + amount + tid + api_key)
     *
     * payload 는 callback_url 로 수신된 JSON 본문 (Buffer)
     * signature 에는 검증할 payhash 를 전달
     */
    async verifyWebhook(
        _ctx: AbortSignal | null,
        payload: Buffer,
        signature: string,
    ): Promise<boolean> {
        try {
            const body = JSON.parse(
                payload.toString(),
            ) as PayletterCallbackPayload;
            const expected = createHash("sha256")
                .update(
                    `${body.user_id}${body.amount}${body.tid}${this.apiKey}`,
                )
                .digest("hex")
                .toUpperCase();

            // signature 가 없으면 payload 내 payhash 를 사용
            const actual = (signature || body.payhash || "").toUpperCase();
            return expected === actual;
        } catch {
            return false;
        }
    }

    // ─── 헬퍼 ─────────────────────────────────────────────────────────────

    private async parseJson<T>(resp: Response, ctx: string): Promise<T> {
        const text = await resp.text();
        if (resp.status >= 400) {
            try {
                const err = JSON.parse(text) as PayletterErrorBody;
                if (err.code != null)
                    throw new PgError(String(err.code), err.message ?? "");
            } catch (e) {
                if (e instanceof PgError) throw e;
            }
            throw new Error(
                `payletter/${ctx}: API error (status ${resp.status}): ${text}`,
            );
        }
        const data = JSON.parse(text) as T & {
            code?: number;
            message?: string;
        };
        // 페이레터는 200 OK 이지만 code !== 0 으로 실패를 내려보내기도 함
        if (typeof data.code === "number" && data.code !== 0) {
            throw new PgError(String(data.code), data.message ?? "");
        }
        return data;
    }
}

// ─── 상태 코드 매핑 ──────────────────────────────────────────────────────────

/**
 * 페이레터 status_code → 내부 ORDER_STATUS 매핑
 *
 * 1: 생성 → created
 * 2: 진입 → in_progress
 * 3: 인증 → in_progress
 * 4: 실패 → aborted
 * 5: 완료 → done
 */
function mapPayletterStatus(code: number): string {
    switch (code) {
        case 1:
            return ORDER_STATUS.CREATED;
        case 2:
        case 3:
            return ORDER_STATUS.IN_PROGRESS;
        case 4:
            return ORDER_STATUS.ABORTED;
        case 5:
            return ORDER_STATUS.DONE;
        default:
            return ORDER_STATUS.ABORTED;
    }
}
