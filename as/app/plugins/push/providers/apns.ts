/**
 * APNs (Apple Push Notification service) HTTP/2 JWT 프로바이더
 *
 * Go 엔티티서버 `internal/push/apns.go` 에서 포팅
 *
 * 인증: .p8 ECDSA(ES256) 비공개 키 → JWT → APNs Authorization 헤더
 * API: https://api.push.apple.com/3/device/{token} (production)
 *      https://api.sandbox.push.apple.com/3/device/{token} (sandbox)
 *
 * Node.js 18+ 의 net/http 는 HTTP/2를 자동 협상하지 않으므로
 * undici fetch (Node.js 내장)를 사용하고, apns-collapse-id 미사용 단순 알림에는
 * HTTP/1.1 fallback도 실제로는 작동하지만 Apple 권장은 HTTP/2.
 *
 * JWT는 ~55분 캐시 후 자동 갱신 (Apple 권장: 최대 1시간).
 */

import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import type { PushProvider } from "../types/index.ts";
import { isApnsTokenExpiredError } from "./utils.ts";

const APNS_ENDPOINT_PRODUCTION = "https://api.push.apple.com/3/device/%s";
const APNS_ENDPOINT_SANDBOX = "https://api.sandbox.push.apple.com/3/device/%s";
/** JWT 갱신 여유 시간 (ms): 55분 */
const TOKEN_TTL_MS = 55 * 60 * 1000;

interface TokenCache {
    token: string;
    issuedAt: number; // Date.now()
}

export class ApnsProvider implements PushProvider {
    private readonly keyId: string;
    private readonly teamId: string;
    private readonly bundleId: string;
    private readonly production: boolean;
    private readonly privateKey: string;
    private tokenCache: TokenCache | null = null;

    constructor(
        keyFile: string,
        keyId: string,
        teamId: string,
        bundleId: string,
        production = false,
    ) {
        const raw = readFileSync(keyFile, "utf-8");
        // .p8 PEM 검증
        if (!raw.includes("PRIVATE KEY")) {
            throw new Error(
                `APNs: '${keyFile}' does not appear to be a valid .p8 PEM private key`,
            );
        }

        this.privateKey = raw;
        this.keyId = keyId;
        this.teamId = teamId;
        this.bundleId = bundleId;
        this.production = production;
    }

    /** 단일 APNs 디바이스 토큰에 푸시 알림을 전송한다 */
    async send(
        deviceToken: string,
        title: string,
        body: string,
        data?: Record<string, string>,
    ): Promise<void> {
        const authToken = this.getToken();
        const endpoint = this.production
            ? APNS_ENDPOINT_PRODUCTION
            : APNS_ENDPOINT_SANDBOX;
        const url = endpoint.replace("%s", deviceToken);

        const payload: Record<string, unknown> = {
            aps: {
                alert: { title, body },
                sound: "default",
            },
        };
        if (data && Object.keys(data).length > 0) {
            payload.data = data;
        }

        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                authorization: `bearer ${authToken}`,
                "apns-topic": this.bundleId,
                "apns-push-type": "alert",
                "apns-priority": "10",
            },
            body: JSON.stringify(payload),
        });

        if (resp.status === 200) return;

        let errBody: string;
        try {
            errBody = await resp.text();
        } catch {
            errBody = `HTTP ${resp.status}`;
        }

        try {
            const parsed = JSON.parse(errBody) as { reason?: string };
            if (parsed.reason) {
                throw new Error(`apns error [${resp.status}] ${parsed.reason}`);
            }
        } catch (parseErr) {
            if (parseErr instanceof SyntaxError) {
                // JSON 파싱 실패 → 원문 throw
            } else {
                throw parseErr;
            }
        }

        throw new Error(
            `apns request failed with status ${resp.status}: ${errBody}`,
        );
    }

    /** 캐시된 JWT를 반환하거나 만료 시 새 토큰을 발급한다 */
    private getToken(): string {
        const now = Date.now();
        if (this.tokenCache && now - this.tokenCache.issuedAt < TOKEN_TTL_MS) {
            return this.tokenCache.token;
        }

        const nowSec = Math.floor(now / 1000);
        const token = jwt.sign(
            {
                iss: this.teamId,
                iat: nowSec,
            },
            this.privateKey,
            {
                algorithm: "ES256",
                header: {
                    alg: "ES256",
                    kid: this.keyId,
                },
            } as jwt.SignOptions,
        );

        this.tokenCache = { token, issuedAt: now };
        return token;
    }
}

export { isApnsTokenExpiredError };
