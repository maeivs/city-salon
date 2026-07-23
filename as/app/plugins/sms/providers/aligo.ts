/**
 * 알리고(Aligo) SMS 프로바이더
 *
 * Go 엔티티서버 `internal/sms/client_aligo.go`에서 포팅
 *
 * 인증: API Key + User ID (폼 파라미터)
 * URL: POST https://apis.aligo.in/send/
 * Content-Type: application/x-www-form-urlencoded
 */

import type { SmsClient, SendRequest, SendResult, SmsProviderConfig } from "../types/index.ts";
import { logger } from "@system/api";

const ALIGO_API_URL = "https://apis.aligo.in/send/";
const TIMEOUT_MS = 30_000;

export class AligoClient implements SmsClient {
    private readonly apiKey: string;
    private readonly userId: string;

    constructor(cfg: SmsProviderConfig) {
        this.apiKey = cfg.api_key ?? "";
        this.userId = cfg.user_id ?? "";
    }

    name(): string {
        return "aligo";
    }

    async send(req: SendRequest): Promise<SendResult> {
        const params = new URLSearchParams();
        params.set("key", this.apiKey);
        params.set("user_id", this.userId);
        params.set("sender", req.sender);
        params.set("receiver", req.receiver);
        params.set("msg", req.content);
        params.set("msg_type", req.type.toUpperCase()); // SMS, LMS, MMS

        if (req.subject) params.set("title", req.subject);
        if (req.image_url) params.set("image", req.image_url);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(ALIGO_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString(),
                signal: controller.signal,
            });

            const body = (await response.json()) as {
                result_code: string;
                message: string;
                msg_id?: string;
            };

            if (body.result_code !== "1") {
                throw new Error(
                    `Aligo error: code=${body.result_code}, message=${body.message}`,
                );
            }

            return {
                provider_msg_id: body.msg_id ?? "",
                status_code: body.result_code,
            };
        } finally {
            clearTimeout(timeout);
        }
    }
}
