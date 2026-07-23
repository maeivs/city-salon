/**
 * FCM (Firebase Cloud Messaging) HTTP v1 API 프로바이더
 *
 * Go 엔티티서버 `internal/push/fcm.go` 에서 포팅
 *
 * 인증: 서비스 계정 JSON → RS256 JWT → Google OAuth2 → access token
 * API: https://fcm.googleapis.com/v1/projects/{projectId}/messages:send
 */

import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import type { PushProvider } from "../types/index.ts";
import { isFcmTokenExpiredError } from "./utils.ts";

const FCM_ENDPOINT = "https://fcm.googleapis.com/v1/projects/%s/messages:send";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** 토큰 캐시 갱신 여유 시간 (초): 만료 100초 전에 갱신 */
const TOKEN_REFRESH_BEFORE_SEC = 100;

interface ServiceAccount {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
}

interface TokenCache {
    token: string;
    expiresAt: number; // Unix timestamp (ms)
}

export class FcmProvider implements PushProvider {
    private readonly projectId: string;
    private readonly serviceAccount: ServiceAccount;
    private tokenCache: TokenCache | null = null;

    constructor(projectId: string, keyFile: string) {
        const raw = readFileSync(keyFile, "utf-8");
        const sa = JSON.parse(raw) as ServiceAccount;

        if (!sa.client_email || !sa.private_key) {
            throw new Error(
                `FCM: invalid service account JSON in '${keyFile}': missing client_email or private_key`,
            );
        }

        this.projectId = projectId;
        this.serviceAccount = sa;
    }

    /** 단일 디바이스에 푸시 알림을 전송한다 */
    async send(
        deviceToken: string,
        title: string,
        body: string,
        data?: Record<string, string>,
    ): Promise<void> {
        const accessToken = await this.getAccessToken();
        const url = FCM_ENDPOINT.replace("%s", this.projectId);

        const message: Record<string, unknown> = {
            token: deviceToken,
            notification: { title, body },
            android: { priority: "high" },
            apns: {
                payload: {
                    aps: { sound: "default" },
                },
            },
        };
        if (data && Object.keys(data).length > 0) {
            message.data = data;
        }

        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ message }),
        });

        if (resp.ok) return;

        let errBody: string;
        try {
            errBody = await resp.text();
        } catch {
            errBody = `HTTP ${resp.status}`;
        }

        // 구조화된 FCM 오류 파싱
        try {
            const parsed = JSON.parse(errBody) as {
                error?: { code?: number; status?: string; message?: string };
            };
            const e = parsed.error;
            if (e?.message) {
                throw new Error(
                    `FCM error [${e.code ?? resp.status}] ${e.status ?? ""}: ${e.message}`,
                );
            }
        } catch (parseErr) {
            if (parseErr instanceof SyntaxError) {
                // JSON 파싱 실패 → 원문 throw
            } else {
                throw parseErr;
            }
        }

        throw new Error(
            `FCM request failed with status ${resp.status}: ${errBody}`,
        );
    }

    /** OAuth2 Access Token을 반환한다 (캐시/갱신) */
    private async getAccessToken(): Promise<string> {
        const now = Date.now();
        if (
            this.tokenCache &&
            this.tokenCache.expiresAt > now + TOKEN_REFRESH_BEFORE_SEC * 1000
        ) {
            return this.tokenCache.token;
        }

        const nowSec = Math.floor(now / 1000);
        const assertion = jwt.sign(
            {
                iss: this.serviceAccount.client_email,
                sub: this.serviceAccount.client_email,
                aud: GOOGLE_TOKEN_URL,
                scope: FCM_SCOPE,
                iat: nowSec,
                exp: nowSec + 3600,
            },
            this.serviceAccount.private_key,
            {
                algorithm: "RS256",
                keyid: this.serviceAccount.private_key_id,
            },
        );

        const body = new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        });

        const resp = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });

        if (!resp.ok) {
            const text = await resp.text().catch(() => "");
            throw new Error(
                `FCM: failed to obtain access token (${resp.status}): ${text}`,
            );
        }

        const tokenResp = (await resp.json()) as {
            access_token: string;
            expires_in: number;
        };

        this.tokenCache = {
            token: tokenResp.access_token,
            expiresAt: now + tokenResp.expires_in * 1000,
        };

        return this.tokenCache.token;
    }
}

export { isFcmTokenExpiredError };
