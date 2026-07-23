/**
 * AWS SNS SMS 프로바이더 (국제 SMS)
 *
 * Go 엔티티서버 `internal/sms/client_aws_sns.go`에서 포팅
 *
 * 인증: AWS Signature V4 (직접 구현, SDK 미사용)
 * URL: POST https://sns.{region}.amazonaws.com
 * Content-Type: application/x-www-form-urlencoded; charset=utf-8
 * MMS 미지원
 */

import { createHmac, createHash } from "node:crypto";
import type { SmsClient, SendRequest, SendResult, SmsProviderConfig } from "../types/index.ts";

const TIMEOUT_MS = 30_000;

export class AWSSNSClient implements SmsClient {
    private readonly region: string;
    private readonly accessKey: string;
    private readonly secretKey: string;
    /** Transactional | Promotional */
    private readonly smsType: string;

    constructor(cfg: SmsProviderConfig) {
        this.region = cfg.region ?? "ap-northeast-2";
        this.accessKey = cfg.access_key ?? "";
        this.secretKey = cfg.secret_key ?? "";
        // api_key 필드를 SMS 타입으로 재활용 (Go 원본 동일)
        this.smsType = cfg.api_key || "Transactional";
    }

    name(): string {
        return "aws_sns";
    }

    async send(req: SendRequest): Promise<SendResult> {
        if (req.type.toLowerCase() === "mms") {
            throw new Error("AWS SNS does not support MMS");
        }

        const phoneNumber = normalizePhoneE164(req.receiver);
        const host = `sns.${this.region}.amazonaws.com`;
        const url = `https://${host}`;

        const params = new URLSearchParams();
        params.set("Action", "Publish");
        params.set("Message", req.content);
        params.set("PhoneNumber", phoneNumber);
        params.set("Version", "2010-03-31");
        params.set(
            "MessageAttributes.entry.1.Name",
            "AWS.SNS.SMS.SMSType",
        );
        params.set(
            "MessageAttributes.entry.1.Value.DataType",
            "String",
        );
        params.set(
            "MessageAttributes.entry.1.Value.StringValue",
            this.smsType,
        );

        if (req.sender) {
            params.set(
                "MessageAttributes.entry.2.Name",
                "AWS.SNS.SMS.SenderID",
            );
            params.set(
                "MessageAttributes.entry.2.Value.DataType",
                "String",
            );
            params.set(
                "MessageAttributes.entry.2.Value.StringValue",
                req.sender,
            );
        }

        const bodyStr = params.toString();
        const now = new Date();
        const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
        const dateStamp = amzDate.slice(0, 8);

        // AWS Signature V4
        const contentType =
            "application/x-www-form-urlencoded; charset=utf-8";
        const payloadHash = sha256(bodyStr);

        const canonicalRequest = [
            "POST",
            "/",
            "",
            `content-type:${contentType}`,
            `host:${host}`,
            `x-amz-date:${amzDate}`,
            "",
            "content-type;host;x-amz-date",
            payloadHash,
        ].join("\n");

        const credentialScope = `${dateStamp}/${this.region}/sns/aws4_request`;
        const stringToSign = [
            "AWS4-HMAC-SHA256",
            amzDate,
            credentialScope,
            sha256(canonicalRequest),
        ].join("\n");

        const signingKey = deriveSigningKey(
            this.secretKey,
            dateStamp,
            this.region,
            "sns",
        );
        const signature = hmac(signingKey, stringToSign).toString("hex");

        const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": contentType,
                    Host: host,
                    "X-Amz-Date": amzDate,
                    Authorization: authorization,
                },
                body: bodyStr,
                signal: controller.signal,
            });

            const text = await response.text();

            if (!response.ok) {
                throw new Error(
                    `AWS SNS error: status=${response.status}, body=${text}`,
                );
            }

            // XML에서 <MessageId>...</MessageId> 추출
            const match = text.match(/<MessageId>([^<]+)<\/MessageId>/);
            return {
                provider_msg_id: match?.[1] ?? "",
                status_code: String(response.status),
            };
        } finally {
            clearTimeout(timeout);
        }
    }
}

/** 한국 전화번호를 E.164 형식으로 정규화 */
function normalizePhoneE164(phone: string): string {
    if (phone.startsWith("+")) return phone;
    const cleaned = phone.replace(/[^0-9]/g, "");
    if (cleaned.startsWith("0")) {
        return "+82" + cleaned.slice(1);
    }
    return "+" + cleaned;
}

function sha256(data: string): string {
    return createHash("sha256").update(data, "utf-8").digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
    return createHmac("sha256", key).update(data, "utf-8").digest();
}

function deriveSigningKey(
    secret: string,
    dateStamp: string,
    region: string,
    service: string,
): Buffer {
    const kDate = hmac(Buffer.from("AWS4" + secret, "utf-8"), dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    return hmac(kService, "aws4_request");
}
