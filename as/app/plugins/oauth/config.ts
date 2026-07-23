/**
 * OAuth 설정 로더 + 프로바이더별 유틸리티
 *
 * plugins/oauth/config.json 을 읽어 파싱한다.
 * Apple client_secret JWT 자동 생성도 담당.
 */

import jwt from "jsonwebtoken";
import { env } from "@system/api";
import { serverConfig } from "@system/api";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { substituteEnvVars } from "@system/api";
import type { OAuthConfig, OAuthProviderConfig } from "./types/index.ts";

let _cfg: OAuthConfig | null | undefined;
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

export function getOAuthConfig(): OAuthConfig | null {
    if (_cfg !== undefined) return _cfg;
    try {
        const raw = substituteEnvVars(readFileSync(CONFIG_PATH, "utf-8"));
        _cfg = JSON.parse(raw) as OAuthConfig;
        return _cfg;
    } catch {
        _cfg = null;
        return _cfg;
    }
}

export function isOAuthEnabled(): boolean {
    return getOAuthConfig()?.enabled === true;
}

export function getProvider(name: string): OAuthProviderConfig | undefined {
    const cfg = getOAuthConfig();
    if (!cfg?.enabled) return undefined;
    return cfg.providers.find(
        (p) => p.driver.toLowerCase() === name.toLowerCase(),
    );
}

export function getStateSecret(): string {
    return getOAuthConfig()?.state_secret || env.JWT_SECRET;
}

/** 게이트웨이 자체 callback URL — oauth.json 의 redirect_url 을 덮어씀 */
export function buildCallbackUrl(provider: string): string {
    const base = serverConfig.baseUrl.replace(/\/$/, "");
    return `${base}/v1/oauth/${provider}/callback`;
}

export function getDefaultScopes(driver: string): string[] {
    switch (driver) {
        case "google":
            return ["openid", "email", "profile"];
        case "github":
            return ["read:user", "user:email"];
        case "naver":
            return ["name", "email"];
        case "apple":
            return ["name", "email"];
        case "line":
            return ["openid", "profile", "email"];
        case "linkedin":
            return ["openid", "profile", "email"];
        default:
            return ["email", "profile"];
    }
}

export interface ProviderEndpoints {
    authUrl: string;
    tokenUrl: string;
}

export function getEndpoints(p: OAuthProviderConfig): ProviderEndpoints {
    const driver = p.driver.toLowerCase();
    switch (driver) {
        case "google":
            return {
                authUrl:
                    p.auth_url ||
                    "https://accounts.google.com/o/oauth2/v2/auth",
                tokenUrl: p.token_url || "https://oauth2.googleapis.com/token",
            };
        case "github":
            return {
                authUrl:
                    p.auth_url || "https://github.com/login/oauth/authorize",
                tokenUrl:
                    p.token_url ||
                    "https://github.com/login/oauth/access_token",
            };
        case "naver":
            return {
                authUrl:
                    p.auth_url || "https://nid.naver.com/oauth2.0/authorize",
                tokenUrl: p.token_url || "https://nid.naver.com/oauth2.0/token",
            };
        case "kakao":
            return {
                authUrl:
                    p.auth_url || "https://kauth.kakao.com/oauth/authorize",
                tokenUrl: p.token_url || "https://kauth.kakao.com/oauth/token",
            };
        case "apple":
            return {
                authUrl:
                    p.auth_url || "https://appleid.apple.com/auth/authorize",
                tokenUrl: p.token_url || "https://appleid.apple.com/auth/token",
            };
        case "line":
            return {
                authUrl:
                    p.auth_url ||
                    "https://access.line.me/oauth2/v2.1/authorize",
                tokenUrl:
                    p.token_url || "https://api.line.me/oauth2/v2.1/token",
            };
        case "linkedin":
            return {
                authUrl:
                    p.auth_url ||
                    "https://www.linkedin.com/oauth/v2/authorization",
                tokenUrl:
                    p.token_url ||
                    "https://www.linkedin.com/oauth/v2/accessToken",
            };
        default:
            if (!p.auth_url || !p.token_url) {
                throw new Error(
                    `auth_url and token_url are required for custom provider "${p.driver}"`,
                );
            }
            return { authUrl: p.auth_url, tokenUrl: p.token_url };
    }
}

/**
 * Apple Sign-In client_secret JWT (ES256) 자동 생성
 * jsonwebtoken이 ES256을 지원하므로 PEM 키를 그대로 sign에 전달
 */
export function generateAppleClientSecret(p: OAuthProviderConfig): string {
    if (!p.apple_team_id || !p.apple_key_id || !p.apple_private_key) {
        throw new Error(
            "apple_team_id, apple_key_id, apple_private_key are required",
        );
    }
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
        {
            iss: p.apple_team_id,
            iat: now,
            exp: now + 15_552_000, // 6개월 (Apple 최대)
            aud: "https://appleid.apple.com",
            sub: p.client_id,
        },
        p.apple_private_key,
        {
            algorithm: "ES256",
            header: { alg: "ES256", kid: p.apple_key_id },
        } as jwt.SignOptions,
    );
}

/** Apple 또는 다른 프로바이더의 실제 client_secret 반환 */
export function resolveClientSecret(p: OAuthProviderConfig): string {
    const driver = p.driver.toLowerCase();
    if (
        driver === "apple" &&
        !p.client_secret &&
        p.apple_team_id &&
        p.apple_key_id &&
        p.apple_private_key
    ) {
        return generateAppleClientSecret(p);
    }
    return p.client_secret;
}
