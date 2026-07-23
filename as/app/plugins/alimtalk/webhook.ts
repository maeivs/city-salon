/**
 * 알림톡 웹훅 처리
 *
 * 각 프로바이더가 발송 결과를 POST로 통보하면
 * provider_msg_id로 alimtalk_log를 찾아 delivered/failed 상태 갱신
 *
 * 지원: aligo, solapi, ppurio, nhn_cloud
 */

import { logger } from "@system/api";
import type { AlimtalkQuerier } from "./types/index.ts";

interface CallbackResult {
    providerMsgId: string;
    status: string; // "delivered" | "failed"
    deliveredAt: string;
    errMsg: string;
}

export class WebhookProcessor {
    /** WebhookProcessor를 초기화한다 */
    constructor(private readonly querier: AlimtalkQuerier) {}

    /** 프로바이더 웹훅 콜백을 처리한다 */
    async process(provider: string, body: Buffer | string): Promise<void> {
        const result = this.parseCallback(provider, body);
        if (!result) return;
        if (!result.providerMsgId) {
            throw new Error(
                `alimtalk webhook (${provider}): provider_msg_id empty`,
            );
        }

        await this.querier.updateAlimtalkLogDelivery(
            result.providerMsgId,
            result.status,
            result.deliveredAt,
            result.errMsg,
        );

        logger.info(
            `Alimtalk webhook (${provider}): msg=${result.providerMsgId} status=${result.status}`,
        );
    }

    /** 프로바이더별 콜백 본문을 파싱한다 */
    private parseCallback(
        provider: string,
        body: Buffer | string,
    ): CallbackResult | null {
        const str = typeof body === "string" ? body : body.toString("utf-8");
        switch (provider.toLowerCase()) {
            case "aligo":
                return this.parseAligo(str);
            case "solapi":
                return this.parseSolapi(str);
            case "ppurio":
                return this.parsePpurio(str);
            case "nhn_cloud":
            case "nhn":
                return this.parseNHN(str);
            default:
                throw new Error(`Unknown webhook provider: ${provider}`);
        }
    }

    // ─── Aligo ───────────────────────────────────────────────────────────
    // res_code == "1000" → delivered

    /** 알리고 웹훅 응답을 파싱한다 */
    private parseAligo(body: string): CallbackResult {
        const trimmed = body.trim();
        let mid = "";
        let resCode = "";
        let resMsg = "";
        let recvTime = "";

        if (trimmed.startsWith("{")) {
            const data = JSON.parse(trimmed) as Record<string, string>;
            mid = data.mid ?? "";
            resCode = data.res_code ?? "";
            resMsg = data.res_msg ?? "";
            recvTime = data.recv_time ?? "";
        } else {
            const params = new URLSearchParams(trimmed);
            mid = params.get("mid") ?? "";
            resCode = params.get("res_code") ?? "";
            resMsg = params.get("res_msg") ?? "";
            recvTime = params.get("recv_time") ?? "";
        }

        if (!mid) throw new Error("aligo: mid is empty");

        return {
            providerMsgId: mid,
            status: resCode === "1000" ? "delivered" : "failed",
            deliveredAt: recvTime,
            errMsg: resCode !== "1000" ? `aligo(${resCode}): ${resMsg}` : "",
        };
    }

    // ─── Solapi ──────────────────────────────────────────────────────────
    // statusCode == "4000" → delivered

    /** Solapi 웹훅 응답을 파싱한다 */
    private parseSolapi(body: string): CallbackResult {
        const data = JSON.parse(body) as Record<string, unknown>;

        // 배열(messages) 형식
        const messages = data.messages as
            | Array<Record<string, string>>
            | undefined;
        if (messages?.length) {
            const m = messages[0];
            return solapiResult(
                m.messageId,
                m.statusCode,
                m.statusName,
                m.updatedAt,
            );
        }

        // 단일 형식
        const single = data as Record<string, string>;
        if (!single.messageId) throw new Error("solapi: messageId is empty");
        return solapiResult(
            single.messageId,
            single.statusCode,
            single.statusName,
            single.updatedAt,
        );
    }

    // ─── Ppurio ──────────────────────────────────────────────────────────
    // resultCode == "0" → delivered

    /** 뿀리오 웹훅 응답을 파싱한다 */
    private parsePpurio(body: string): CallbackResult {
        const data = JSON.parse(body) as {
            requestId?: string;
            receivers?: Array<{
                resultCode?: string;
                resultMessage?: string;
                receivedAt?: string;
            }>;
        };

        if (!data.requestId) throw new Error("ppurio: requestId is empty");

        const r = data.receivers?.[0];
        if (r) {
            return {
                providerMsgId: data.requestId,
                status: r.resultCode === "0" ? "delivered" : "failed",
                deliveredAt: r.receivedAt ?? "",
                errMsg:
                    r.resultCode !== "0"
                        ? `ppurio(${r.resultCode}): ${r.resultMessage ?? ""}`
                        : "",
            };
        }

        return {
            providerMsgId: data.requestId,
            status: "delivered",
            deliveredAt: "",
            errMsg: "",
        };
    }

    // ─── NHN Cloud ───────────────────────────────────────────────────────
    // resultCode == "MRC01" → delivered

    /** NHN Cloud 웹훅 응답을 파싱한다 */
    private parseNHN(body: string): CallbackResult {
        const data = JSON.parse(body) as {
            requestId?: string;
            resultCode?: string;
            resultMessage?: string;
            receiveDateTime?: string;
        };

        if (!data.requestId) throw new Error("nhn_cloud: requestId is empty");

        return {
            providerMsgId: data.requestId,
            status: data.resultCode === "MRC01" ? "delivered" : "failed",
            deliveredAt: data.receiveDateTime ?? "",
            errMsg:
                data.resultCode !== "MRC01"
                    ? `nhn_cloud(${data.resultCode}): ${data.resultMessage ?? ""}`
                    : "",
        };
    }
}

/** Solapi 콜백 결과를 생성한다 */
function solapiResult(
    msgId: string,
    code: string,
    name: string,
    updatedAt: string,
): CallbackResult {
    const isDelivered = code === "4000" || name?.toUpperCase() === "DELIVERED";
    return {
        providerMsgId: msgId ?? "",
        status: isDelivered ? "delivered" : "failed",
        deliveredAt: updatedAt ?? "",
        errMsg: isDelivered ? "" : `solapi(${code}): ${name}`,
    };
}
