/**
 * Solapi(CoolSMS) SMS 프로바이더
 *
 * Go 엔티티서버 `internal/sms/client_solapi.go`에서 포팅
 *
 * 인증: HMAC-SHA256
 *   Authorization: HMAC-SHA256 apiKey={key}, date={ISO8601}, salt={random}, signature={hmac(date+salt)}
 * URL: POST https://api.solapi.com/messages/v4/send
 * Content-Type: application/json
 */

import { buildSolapiAuthorization } from "../../shared/solapi-auth.ts";
import type {
    SmsClient,
    SendRequest,
    SendResult,
    SmsProviderConfig,
} from "../types/index.ts";

const SOLAPI_API_URL = "https://api.solapi.com/messages/v4/send";
const TIMEOUT_MS = 30_000;

export class SolapiClient implements SmsClient {
    private readonly apiKey: string;
    private readonly apiSecret: string;

    constructor(cfg: SmsProviderConfig) {
        this.apiKey = cfg.api_key ?? "";
        this.apiSecret = cfg.api_secret ?? "";
    }

    name(): string {
        return "solapi";
    }

    async send(req: SendRequest): Promise<SendResult> {
        const { authorization } = buildSolapiAuthorization(
            this.apiKey,
            this.apiSecret,
        );

        const body: Record<string, unknown> = {
            message: {
                to: req.receiver,
                from: req.sender,
                text: req.content,
                type: req.type.toUpperCase(),
                ...(req.subject ? { subject: req.subject } : {}),
                ...(req.image_url ? { imageUrl: req.image_url } : {}),
            },
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(SOLAPI_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: authorization,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(
                    `Solapi error: status=${response.status}, body=${text}`,
                );
            }

            const result = (await response.json()) as { groupId?: string };
            return {
                provider_msg_id: result.groupId ?? "",
                status_code: String(response.status),
            };
        } finally {
            clearTimeout(timeout);
        }
    }
}
