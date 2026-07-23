/**
 * NHN KCP 결제 클라이언트
 *
 * ref: https://developers.kcp.co.kr
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
import { getKcpErrorMessage } from "./kcp-codes.ts";

export class KcpClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly siteCD: string;
    private readonly secretKey: string;
    private readonly certInfo: string;

    constructor(cfg: PgProviderConfig) {
        this._name = cfg.driver;
        this.apiUrl = resolveKcpApiUrl(cfg);
        this.siteCD = cfg.site_cd || "";
        this.secretKey = cfg.secret_key || "";
        this.certInfo = (cfg.cert_info || cfg.secret_key || "").replace(
            /\\n/g,
            "\n",
        );
    }

    name(): string {
        return this._name;
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Secret ${this.secretKey}`,
            "Site-CD": this.siteCD,
            "Content-Type": "application/json",
        };
    }

    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const providerPayload = req.providerPayload ?? {};
        const encData = String(providerPayload.enc_data ?? "");
        const encInfo = String(providerPayload.enc_info ?? "");
        const tranCd = String(providerPayload.tran_cd ?? "");
        if (!encData || !encInfo || !tranCd) {
            throw new Error(
                "kcp: enc_data, enc_info, and tran_cd are required",
            );
        }

        const resp = await fetch(this.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify({
                tran_cd: tranCd,
                kcp_cert_info: this.certInfo,
                site_cd: this.siteCD,
                enc_data: encData,
                enc_info: encInfo,
                ordr_mony: String(req.amount),
                pay_type: String(providerPayload.pay_type ?? "PACA"),
                ordr_no: req.orderId,
            }),
            signal: _ctx,
        });
        return this.parseResponse(resp, "kcp");
    }

    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        const body: Record<string, unknown> = {
            tno: req.paymentKey,
            cancel_reason: req.cancelReason,
            site_cd: this.siteCD,
        };
        if (req.cancelAmount != null) body.cancel_amount = req.cancelAmount;

        const resp = await fetch(`${this.apiUrl}/v1/payment/cancel`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: _ctx,
        });
        const result = await this.parseResponse(resp, "kcp");
        return { ...result };
    }

    async getPayment(
        _ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        const resp = await fetch(
            `${this.apiUrl}/v1/payment/${paymentKey}?site_cd=${this.siteCD}`,
            {
                headers: this.headers(),
                signal: _ctx,
            },
        );
        return this.parseResponse(resp, "kcp");
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
                    res_cd?: string;
                    message?: string;
                    res_msg?: string;
                };
                const code = String(err.code ?? err.res_cd ?? "");
                if (code)
                    throw new PgError(
                        code,
                        getKcpErrorMessage(
                            code,
                            err.message ?? err.res_msg ?? "",
                        ),
                    );
            } catch (e) {
                if (e instanceof PgError) throw e;
            }
            throw new Error(
                `${prefix}: API error (status ${resp.status}): ${text}`,
            );
        }
        const raw = JSON.parse(text) as Record<string, unknown>;
        const resCd = String(raw.res_cd ?? "");
        if (resCd && resCd !== "0000") {
            throw new PgError(
                resCd,
                getKcpErrorMessage(resCd, String(raw.res_msg ?? "")),
            );
        }
        return normalizeKcpResponse(raw);
    }
}

/** KCP 설정의 실행 환경에 맞는 승인 API URL을 선택한다. */
function resolveKcpApiUrl(cfg: PgProviderConfig): string {
    const environment = cfg.environment || "development";
    const urls = cfg.api_urls?.[environment];
    if (typeof urls === "string") {
        return urls;
    }
    return (
        urls?.payment_approve ||
        cfg.api_url ||
        "https://stg-spl.kcp.co.kr/gw/enc/v1/payment"
    );
}

function normalizeKcpResponse(raw: Record<string, unknown>): PaymentResult {
    const amount = Number(raw.amount ?? 0);
    return {
        paymentKey: String(raw.tno ?? ""),
        orderId: String(raw.order_no ?? ""),
        orderName: String(raw.goods_name ?? ""),
        status: String(raw.res_cd === "0000" ? "done" : (raw.status ?? "")),
        method: String(raw.pay_method ?? ""),
        totalAmount: amount,
        balanceAmount: Number(raw.remain_amount ?? amount),
        currency: "KRW",
        type: "PAYMENT",
        country: "KR",
        isPartialCancelable: true,
        card: raw.card_no
            ? {
                  issuerCode: String(raw.card_cd ?? ""),
                  acquirerCode: String(raw.card_cd ?? ""),
                  number: String(raw.card_no ?? ""),
                  installmentPlanMonths: Number(raw.quota ?? 0),
                  cardType: "",
                  ownerType: "",
                  approveNo: String(raw.app_no ?? ""),
                  amount,
                  isInterestFree: String(raw.noinf ?? "") === "Y",
              }
            : undefined,
        _raw: raw,
    };
}
