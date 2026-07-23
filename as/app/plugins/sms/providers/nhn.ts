/**
 * NHN Cloud SMS 프로바이더
 *
 * Go 엔티티서버 `internal/sms/client_nhn.go`에서 포팅
 *
 * 인증: X-Secret-Key 헤더
 * URL: POST https://api-sms.cloud.toast.com/sms/v3.0/appKeys/{appKey}/sender/sms (SMS)
 *      POST https://api-sms.cloud.toast.com/sms/v3.0/appKeys/{appKey}/sender/mms (LMS/MMS)
 */

import type { SmsClient, SendRequest, SendResult, SmsProviderConfig } from "../types/index.ts";

const NHN_BASE_URL = "https://api-sms.cloud.toast.com/sms/v3.0/appKeys";
const TIMEOUT_MS = 30_000;

export class NHNClient implements SmsClient {
    private readonly appKey: string;
    private readonly secretKey: string;

    constructor(cfg: SmsProviderConfig) {
        this.appKey = cfg.app_key ?? "";
        this.secretKey = cfg.secret_key ?? "";
    }

    name(): string {
        return "nhn_cloud";
    }

    async send(req: SendRequest): Promise<SendResult> {
        const isSms = req.type.toLowerCase() === "sms";
        const endpoint = isSms ? "sms" : "mms";
        const url = `${NHN_BASE_URL}/${this.appKey}/sender/${endpoint}`;

        const body: Record<string, unknown> = {
            sendNo: req.sender,
            recipientList: [{ recipientNo: req.receiver }],
            body: req.content,
        };

        if (!isSms && req.subject) body.title = req.subject;
        if (!isSms && req.image_url) {
            body.attachFileList = [{ fileUrl: req.image_url }];
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json;charset=UTF-8",
                    "X-Secret-Key": this.secretKey,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            const result = (await response.json()) as {
                header: {
                    isSuccessful: boolean;
                    resultCode: number;
                    resultMessage: string;
                };
                body?: { data?: { requestId?: string } };
            };

            if (!result.header.isSuccessful) {
                throw new Error(
                    `NHN error: code=${result.header.resultCode}, message=${result.header.resultMessage}`,
                );
            }

            return {
                provider_msg_id: result.body?.data?.requestId ?? "",
                status_code: String(result.header.resultCode),
            };
        } finally {
            clearTimeout(timeout);
        }
    }
}
