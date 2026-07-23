/**
 * 뿌리오(Ppurio) SMS 프로바이더
 *
 * Go 엔티티서버 `internal/sms/client_ppurio.go`에서 포팅
 *
 * 인증: Bearer Token
 * URL: POST https://api.ppurio.com/v1/message
 * Content-Type: application/json
 */

import type { SmsClient, SendRequest, SendResult, SmsProviderConfig } from "../types/index.ts";

const PPURIO_API_URL = "https://api.ppurio.com/v1/message";
const TIMEOUT_MS = 30_000;

export class PpurioClient implements SmsClient {
    private readonly apiKey: string;
    private readonly account: string;

    constructor(cfg: SmsProviderConfig) {
        this.apiKey = cfg.api_key ?? "";
        this.account = cfg.account ?? "";
    }

    name(): string {
        return "ppurio";
    }

    async send(req: SendRequest): Promise<SendResult> {
        const body: Record<string, unknown> = {
            account: this.account,
            messageType: req.type.toUpperCase(),
            content: req.content,
            from: req.sender,
            duplicateFlag: "N",
            targetCount: 1,
            targets: [{ to: req.receiver }],
        };

        if (req.subject) body.subject = req.subject;
        if (req.image_url) body.fileUrl = req.image_url;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(PPURIO_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(
                    `Ppurio error: status=${response.status}, body=${text}`,
                );
            }

            const result = (await response.json()) as {
                code?: string;
                requestId?: string;
            };
            return {
                provider_msg_id: result.requestId ?? "",
                status_code: result.code ?? String(response.status),
            };
        } finally {
            clearTimeout(timeout);
        }
    }
}
