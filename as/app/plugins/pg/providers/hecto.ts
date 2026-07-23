/**
 * 헥토파이낸셜(구 세틀뱅크) 결제 클라이언트
 *
 * 보안:
 *   - AES-256/ECB/PKCS5Padding + Base64 (금액/민감정보 암호화)
 *   - SHA-256 + Hex (pktHash 위변조 방지)
 *
 * ref: https://develop.sbsvc.online
 */

import { createCipheriv, createHash } from "node:crypto";
import type {
    PgClient,
    PgProviderConfig,
    ConfirmRequest,
    CancelRequest,
    PaymentResult,
    CancelResult,
} from "../types/index.ts";
import { PgError } from "../types/index.ts";

export class HectoClient implements PgClient {
    private readonly _name: string;
    private readonly apiUrl: string;
    private readonly merchantId: string;
    private readonly hashKey: string;
    private readonly aesKey: Buffer;

    constructor(cfg: PgProviderConfig) {
        const mid = cfg.mid || cfg.merchant_id || "";
        if (!mid) throw new Error("hecto: merchant_id (또는 mid)가 필요합니다");
        if (!cfg.sign_key)
            throw new Error("hecto: sign_key (hash key)가 필요합니다");

        const aesKeyStr = cfg.aes_key || "pgSettle30y739r82jtd709yOfZ2yK5K";
        if (aesKeyStr.length !== 32)
            throw new Error(
                `hecto: aes_key는 정확히 32바이트여야 합니다 (현재 ${aesKeyStr.length})`,
            );

        this._name = cfg.driver;
        this.apiUrl = cfg.api_url || "https://gw.settlebank.co.kr";
        this.merchantId = mid;
        this.hashKey = cfg.sign_key;
        this.aesKey = Buffer.from(aesKeyStr, "ascii");
    }

    name(): string {
        return this._name;
    }

    /** SHA-256(parts... + hashKey) → hex */
    private pktHash(...parts: string[]): string {
        const data = parts.join("") + this.hashKey;
        return createHash("sha256").update(data, "utf-8").digest("hex");
    }

    /** AES-256/ECB/PKCS5Padding + Base64 */
    private aesEncrypt(plaintext: string): string {
        const bs = 16;
        const input = Buffer.from(plaintext, "utf-8");
        const padLen = bs - (input.length % bs);
        const padded = Buffer.concat([input, Buffer.alloc(padLen, padLen)]);
        // ECB: 각 블록 독립 암호화
        const result = Buffer.alloc(padded.length);
        for (let i = 0; i < padded.length; i += bs) {
            const cipher = createCipheriv("aes-256-ecb", this.aesKey, null);
            cipher.setAutoPadding(false);
            const block = cipher.update(padded.slice(i, i + bs));
            block.copy(result, i);
        }
        return result.toString("base64");
    }

    /** 결제수단 문자열을 헥토 2자리 코드로 변환 */
    private mapMethod(method?: string): string {
        switch (method) {
            case "RA":
            case "bank":
            case "계좌이체":
                return "RA";
            case "VA":
            case "vbank":
            case "가상계좌":
                return "VA";
            case "MP":
            case "mobile":
            case "휴대폰":
                return "MP";
            case "PZ":
            case "easy":
            case "간편결제":
                return "PZ";
            default:
                return "CA";
        }
    }

    async confirmPayment(
        _ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult> {
        const now = new Date();
        const trdDt = formatDate(now);
        const trdTm = formatTime(now);
        const amtStr = String(req.amount);

        // pktHash = 거래일자 + 거래시간 + 상점아이디 + 상점주문번호 + 거래금액(평문) + 해쉬키
        const hash = this.pktHash(
            trdDt,
            trdTm,
            this.merchantId,
            req.orderId,
            amtStr,
        );
        const encAmt = this.aesEncrypt(amtStr);

        const body = {
            params: {
                mchtId: this.merchantId,
                ver: "0A19",
                method: this.mapMethod(req.method),
                bizType: "B0",
                encCd: "23",
                mchtTrdNo: req.orderId,
                trdDt,
                trdTm,
                mobileYn: "N",
                osType: "W",
            },
            data: {
                pktHash: hash,
                trdNo: req.paymentKey,
                trdAmt: encAmt,
                crcCd: "KRW",
            },
        };

        // 거래 조회 URL: nspay.settlebank.co.kr
        const queryUrl = `https://nspay.settlebank.co.kr/api/pg/${this.merchantId}/transInfo.do`;
        return this.doRequest(queryUrl, body, "hecto");
    }

    async cancelPayment(
        _ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult> {
        const now = new Date();
        const trdDt = formatDate(now);
        const trdTm = formatTime(now);
        // 취소 요청의 mchtTrdNo는 신규 고유 번호 (취소거래 식별자)
        const cancelTrdNo = `CL${trdDt}${trdTm}`;

        // 취소 금액 결정
        const cancelAmt = req.cancelAmount ?? req.originalAmount ?? 0;
        const amtStr = String(cancelAmt);

        // pktHash = 취소요청일자 + 취소요청시간 + 상점아이디 + 상점주문번호(취소용) + 취소금액(평문) + 해쉬키
        const hash = this.pktHash(
            trdDt,
            trdTm,
            this.merchantId,
            cancelTrdNo,
            amtStr,
        );
        const encAmt = this.aesEncrypt(amtStr);

        const body = {
            params: {
                mchtId: this.merchantId,
                ver: "0A19",
                method: this.mapMethod(req.method),
                bizType: "C0",
                encCd: "23",
                mchtTrdNo: cancelTrdNo,
                trdDt,
                trdTm,
                mobileYn: "N",
                osType: "W",
            },
            data: {
                pktHash: hash,
                orgTrdNo: req.paymentKey,
                crcCd: "KRW",
                cnclOrd: "001",
                cnclAmt: encAmt,
                cnclRsn: req.cancelReason,
            },
        };

        const result = await this.doRequest(
            `${this.apiUrl}/spay/APICancel.do`,
            body,
            "hecto",
        );
        return { ...result };
    }

    async getPayment(
        _ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult> {
        const now = new Date();
        const trdDt = formatDate(now);
        const trdTm = formatTime(now);
        // 금액 미지정 시 "0" 사용 (조회는 금액 불필요)
        const hash = this.pktHash(
            trdDt,
            trdTm,
            this.merchantId,
            paymentKey,
            "0",
        );

        const body = {
            params: {
                mchtId: this.merchantId,
                ver: "0A19",
                mchtTrdNo: paymentKey,
                trdDt,
                trdTm,
            },
            data: { pktHash: hash },
        };

        // 거래 조회 URL: nspay.settlebank.co.kr
        const queryUrl = `https://nspay.settlebank.co.kr/api/pg/${this.merchantId}/transInfo.do`;
        return this.doRequest(queryUrl, body, "hecto");
    }

    async verifyWebhook(
        _ctx: AbortSignal | null,
        payload: Buffer,
        signature: string,
    ): Promise<boolean> {
        // 노티 pktHash 검증
        // SHA256(거래상태코드 + 거래일자 + 거래시간 + 상점아이디 + 상점주문번호 + 거래금액 + 해쉬키)
        try {
            const noti = JSON.parse(payload.toString()) as Record<
                string,
                string
            >;
            const expected = this.pktHash(
                noti.outStatCd ?? "",
                noti.trdDt ?? "",
                noti.trdTm ?? "",
                noti.mchtId ?? "",
                noti.mchtTrdNo ?? "",
                noti.trdAmt ?? "",
            );
            return expected === signature;
        } catch {
            return false;
        }
    }

    private async doRequest(
        url: string,
        body: unknown,
        prefix: string,
    ): Promise<PaymentResult> {
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const text = await resp.text();
        if (resp.status >= 400) {
            throw new Error(
                `${prefix}: API error (status ${resp.status}): ${text}`,
            );
        }
        const raw = JSON.parse(text) as Record<string, unknown>;
        const hResp = raw as {
            params?: {
                outStatCd?: string;
                outRsltCd?: string;
                outRsltMsg?: string;
                trdNo?: string;
                mchtTrdNo?: string;
            };
            data?: Record<string, unknown>;
        };
        const params = hResp.params ?? {};
        const outStatCd = params.outStatCd ?? "";

        const result = normalizeHectoResponse(raw);

        // 거래 상태 판단: 성공=0021, 실패=0031 등
        if (outStatCd === "0021") {
            result.status = "done";
        } else if (outStatCd !== "") {
            result.status = "aborted";
            result.failure = {
                code: params.outRsltCd ?? "UNKNOWN",
                message: params.outRsltMsg ?? "",
            };
            throw new PgError(
                params.outRsltCd ?? "UNKNOWN",
                params.outRsltMsg ?? "",
            );
        }
        return result;
    }
}

function normalizeHectoResponse(raw: Record<string, unknown>): PaymentResult {
    const p = (raw.params ?? {}) as Record<string, unknown>;
    const d = (raw.data ?? {}) as Record<string, unknown>;
    return {
        paymentKey: String(p.trdNo ?? ""),
        orderId: String(p.mchtTrdNo ?? ""),
        orderName: String(d.goodsNm ?? ""),
        status: "done",
        method: String(d.method ?? p.method ?? ""),
        totalAmount: Number(d.trdAmt ?? 0),
        balanceAmount: Number(d.remainAmt ?? d.trdAmt ?? 0),
        currency: String(d.crcCd ?? "KRW"),
        type: "PAYMENT",
        country: "KR",
        isPartialCancelable: true,
        _raw: raw,
    };
}

function formatDate(d: Date): string {
    return (
        d.getFullYear().toString() +
        String(d.getMonth() + 1).padStart(2, "0") +
        String(d.getDate()).padStart(2, "0")
    );
}

function formatTime(d: Date): string {
    return (
        String(d.getHours()).padStart(2, "0") +
        String(d.getMinutes()).padStart(2, "0") +
        String(d.getSeconds()).padStart(2, "0")
    );
}
