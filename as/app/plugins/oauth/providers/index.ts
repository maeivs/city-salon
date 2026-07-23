/**
 * OAuth 프로바이더별 토큰 교환 + 사용자 정보 조회
 *
 * Go security/oauth.go ExchangeAndGetUserInfo / fetchXxxUserInfo 포팅
 */

import { fetchWithTimeout } from "@system/api";
import {
    getProvider,
    getEndpoints,
    getDefaultScopes,
    resolveClientSecret,
    buildCallbackUrl,
} from "../config.ts";
import type { OAuthUserInfo, TokenResponse } from "../types/index.ts";

/* ──────────────────────────────────────────────────────── helper ─── */

/** dot-notation으로 중첩 맵에서 값 추출 (e.g. "kakao_account.email") */
function getNestedField(obj: Record<string, unknown>, field: string): unknown {
    if (!field.includes(".")) return obj[field];
    const [head, ...rest] = field.split(".");
    const child = obj[head!];
    if (!child || typeof child !== "object") return undefined;
    return getNestedField(child as Record<string, unknown>, rest.join("."));
}

function toString(v: unknown): string {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(Math.round(v));
    return String(v);
}

function extractProfileImage(
    driver: string,
    info: Record<string, unknown>,
): string {
    switch (driver) {
        case "kakao":
            return toString(
                getNestedField(info, "kakao_account.profile.profile_image_url"),
            );
        case "naver":
            return toString(getNestedField(info, "profile_image"));
        case "google":
            return toString(getNestedField(info, "picture"));
        case "github":
            return toString(getNestedField(info, "avatar_url"));
        case "line":
            return toString(getNestedField(info, "pictureUrl"));
        default:
            for (const f of [
                "profile_image",
                "picture",
                "avatar_url",
                "photo",
            ]) {
                const v = toString(getNestedField(info, f));
                if (v) return v;
            }
            return "";
    }
}

function mapUserInfo(
    info: Record<string, unknown>,
    driver: string,
    idField: string,
    emailField: string,
    nameField: string,
    accessToken: string,
    refreshToken: string,
    tokenExpiresAt: string,
): OAuthUserInfo {
    return {
        provider: driver,
        provider_id: toString(getNestedField(info, idField)),
        email: toString(getNestedField(info, emailField)),
        name: toString(getNestedField(info, nameField)),
        profile_image: extractProfileImage(driver, info),
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
    };
}

function parseTokenExpiry(expiresIn?: number): string {
    if (!expiresIn) return "";
    return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/* ─────────────────────────────────────── 토큰 교환 ─── */

/**
 * authorization_code → access_token 교환
 * redirectUri: 이 요청에서 실제 사용된 redirect_uri (code 생성 때와 동일해야 함)
 */
export async function exchangeCode(params: {
    provider: string;
    code: string;
    redirectUri: string;
    codeVerifier?: string;
}): Promise<TokenResponse> {
    const p = getProvider(params.provider);
    if (!p) throw new Error(`Unknown OAuth provider: ${params.provider}`);

    const { tokenUrl } = getEndpoints(p);
    const clientSecret = resolveClientSecret(p);

    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: params.redirectUri,
        client_id: p.client_id,
        client_secret: clientSecret,
    });
    if (params.codeVerifier) {
        body.set("code_verifier", params.codeVerifier);
    }

    const accept =
        p.driver.toLowerCase() === "github"
            ? "application/json"
            : "application/x-www-form-urlencoded";

    const result = await fetchWithTimeout<TokenResponse>(tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: accept,
        },
        body: body.toString(),
        timeoutMs: 15_000,
    });

    if (!result.ok) {
        const err =
            typeof result.data === "object" && result.data
                ? (result.data as TokenResponse).error_description ||
                  (result.data as TokenResponse).error ||
                  `HTTP ${result.status}`
                : `HTTP ${result.status}`;
        throw new Error(`Token exchange failed: ${err}`);
    }

    // GitHub returns form-urlencoded by default; fetchWithTimeout may return string
    let data = result.data as TokenResponse;
    if (typeof data === "string") {
        const params = new URLSearchParams(data);
        data = Object.fromEntries(params.entries()) as unknown as TokenResponse;
    }
    return data;
}

/** refresh_token → 새 access_token 교환 */
export async function refreshProviderToken(
    provider: string,
    refreshToken: string,
): Promise<TokenResponse> {
    const p = getProvider(provider);
    if (!p) throw new Error(`Unknown OAuth provider: ${provider}`);

    const { tokenUrl } = getEndpoints(p);
    const clientSecret = resolveClientSecret(p);

    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: p.client_id,
        client_secret: clientSecret,
    });

    const result = await fetchWithTimeout<TokenResponse>(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        timeoutMs: 15_000,
    });

    if (!result.ok) {
        throw new Error(`Token refresh failed: HTTP ${result.status}`);
    }
    let data = result.data as TokenResponse;
    if (typeof data === "string") {
        const sp = new URLSearchParams(data);
        data = Object.fromEntries(sp.entries()) as unknown as TokenResponse;
    }
    return data;
}

/* ─────────────────────────────────────── user info ─── */

async function fetchJson<T = Record<string, unknown>>(
    url: string,
    accessToken: string,
): Promise<T> {
    const result = await fetchWithTimeout<T>(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeoutMs: 10_000,
    });
    if (!result.ok)
        throw new Error(`Failed to fetch user info: HTTP ${result.status}`);
    return result.data as T;
}

async function fetchGoogleUserInfo(
    token: TokenResponse,
): Promise<OAuthUserInfo> {
    // id_token payload에서 읽거나 userinfo 엔드포인트 호출
    let info: Record<string, unknown> = {};
    if (token.id_token) {
        const parts = token.id_token.split(".");
        if (parts.length === 3) {
            try {
                info = JSON.parse(
                    Buffer.from(parts[1]!, "base64url").toString(),
                );
            } catch {
                // fallthrough
            }
        }
    }
    if (!info.email) {
        info = await fetchJson(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            token.access_token,
        );
    }
    return mapUserInfo(
        info,
        "google",
        "sub",
        "email",
        "name",
        token.access_token,
        token.refresh_token ?? "",
        parseTokenExpiry(token.expires_in),
    );
}

async function fetchGithubUserInfo(
    token: TokenResponse,
): Promise<OAuthUserInfo> {
    const info = await fetchJson<Record<string, unknown>>(
        "https://api.github.com/user",
        token.access_token,
    );

    // email이 null인 경우 /user/emails 에서 primary email 조회
    if (!info.email) {
        try {
            const emails = await fetchJson<
                Array<{ email: string; primary: boolean }>
            >("https://api.github.com/user/emails", token.access_token);
            const primary = emails.find((e) => e.primary);
            if (primary) info.email = primary.email;
        } catch {
            // ignore
        }
    }

    return mapUserInfo(
        info,
        "github",
        "id",
        "email",
        "name",
        token.access_token,
        token.refresh_token ?? "",
        parseTokenExpiry(token.expires_in),
    );
}

async function fetchNaverUserInfo(
    token: TokenResponse,
): Promise<OAuthUserInfo> {
    const result = await fetchJson<{
        resultcode: string;
        message: string;
        response: Record<string, unknown>;
    }>("https://openapi.naver.com/v1/nid/me", token.access_token);

    if (result.resultcode !== "00") {
        throw new Error(`Naver userinfo error: ${result.message}`);
    }
    return mapUserInfo(
        result.response,
        "naver",
        "id",
        "email",
        "name",
        token.access_token,
        token.refresh_token ?? "",
        parseTokenExpiry(token.expires_in),
    );
}

async function fetchKakaoUserInfo(
    provider: string,
    token: TokenResponse,
    userInfoUrl?: string,
): Promise<OAuthUserInfo> {
    const p = getProvider(provider)!;
    const url = p.user_info_url || "https://kapi.kakao.com/v2/user/me";
    const emailField = p.email_field || "kakao_account.email";
    const nameField = p.name_field || "properties.nickname";

    const info = await fetchJson<Record<string, unknown>>(
        url,
        token.access_token,
    );
    return mapUserInfo(
        info,
        "kakao",
        "id",
        emailField,
        nameField,
        token.access_token,
        token.refresh_token ?? "",
        parseTokenExpiry(token.expires_in),
    );
}

async function fetchLineUserInfo(token: TokenResponse): Promise<OAuthUserInfo> {
    const p = getProvider("line");
    const profileUrl = p?.user_info_url || "https://api.line.me/v2/profile";
    const profile = await fetchJson<Record<string, unknown>>(
        profileUrl,
        token.access_token,
    );

    let email = "";
    if (token.id_token) {
        try {
            const parts = token.id_token.split(".");
            if (parts.length === 3) {
                const claims = JSON.parse(
                    Buffer.from(parts[1]!, "base64url").toString(),
                ) as Record<string, unknown>;
                email = toString(claims.email);
            }
        } catch {
            // ignore
        }
    }

    return {
        provider: "line",
        provider_id: toString(profile.userId),
        email,
        name: toString(profile.displayName),
        profile_image: toString(profile.pictureUrl),
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? "",
        token_expires_at: parseTokenExpiry(token.expires_in),
    };
}

function fetchAppleUserInfo(
    token: TokenResponse,
    extraUserJSON: string,
): OAuthUserInfo {
    // Apple은 id_token에서 sub/email 추출
    if (!token.id_token) {
        throw new Error("Apple did not return id_token");
    }
    const parts = token.id_token.split(".");
    if (parts.length !== 3) throw new Error("Invalid Apple id_token");

    const claims = JSON.parse(
        Buffer.from(parts[1]!, "base64url").toString(),
    ) as Record<string, unknown>;

    let name = "";
    if (extraUserJSON) {
        try {
            const userObj = JSON.parse(extraUserJSON) as {
                name?: { firstName?: string; lastName?: string };
                email?: string;
            };
            const first = (userObj.name?.firstName ?? "").trim();
            const last = (userObj.name?.lastName ?? "").trim();
            if (first || last) name = [first, last].filter(Boolean).join(" ");
            if (!claims.email && userObj.email) claims.email = userObj.email;
        } catch {
            // ignore
        }
    }

    return {
        provider: "apple",
        provider_id: toString(claims.sub),
        email: toString(claims.email),
        name,
        profile_image: "",
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? "",
        token_expires_at: parseTokenExpiry(token.expires_in),
    };
}

async function fetchLinkedInUserInfo(
    token: TokenResponse,
): Promise<OAuthUserInfo> {
    // LinkedIn OpenID Connect: id_token 또는 /v2/userinfo 엔드포인트 사용
    let info: Record<string, unknown> = {};
    if (token.id_token) {
        const parts = token.id_token.split(".");
        if (parts.length === 3) {
            try {
                info = JSON.parse(
                    Buffer.from(parts[1]!, "base64url").toString(),
                );
            } catch {
                // fallthrough
            }
        }
    }
    if (!info.sub) {
        info = await fetchJson(
            "https://api.linkedin.com/v2/userinfo",
            token.access_token,
        );
    }
    return mapUserInfo(
        info,
        "linkedin",
        "sub",
        "email",
        "name",
        token.access_token,
        token.refresh_token ?? "",
        parseTokenExpiry(token.expires_in),
    );
}

async function fetchGenericUserInfo(
    providerName: string,
    token: TokenResponse,
): Promise<OAuthUserInfo> {
    const p = getProvider(providerName);
    if (!p?.user_info_url) {
        throw new Error(
            `user_info_url is required for custom provider "${providerName}"`,
        );
    }
    const emailField = p.email_field || "email";
    const nameField = p.name_field || "name";
    const info = await fetchJson<Record<string, unknown>>(
        p.user_info_url,
        token.access_token,
    );
    return mapUserInfo(
        info,
        providerName,
        "sub",
        emailField,
        nameField,
        token.access_token,
        token.refresh_token ?? "",
        parseTokenExpiry(token.expires_in),
    );
}

/**
 * token 응답으로부터 사용자 정보를 조회한다.
 * extraUserJSON: Apple Sign-In 최초 콜백 시 form "user" 필드 값
 */
export async function getUserInfo(
    provider: string,
    token: TokenResponse,
    extraUserJSON = "",
): Promise<OAuthUserInfo> {
    const driver = provider.toLowerCase();
    switch (driver) {
        case "google":
            return fetchGoogleUserInfo(token);
        case "github":
            return fetchGithubUserInfo(token);
        case "naver":
            return fetchNaverUserInfo(token);
        case "kakao":
            return fetchKakaoUserInfo(driver, token);
        case "apple":
            return fetchAppleUserInfo(token, extraUserJSON);
        case "line":
            return fetchLineUserInfo(token);
        case "linkedin":
            return fetchLinkedInUserInfo(token);
        default:
            return fetchGenericUserInfo(driver, token);
    }
}

/** 인증 URL 빌더 */
export function buildAuthUrl(params: {
    provider: string;
    redirectUri: string;
    state: string;
    codeChallenge?: string;
}): string {
    const p = getProvider(params.provider);
    if (!p) throw new Error(`Unknown OAuth provider: ${params.provider}`);

    const { authUrl } = getEndpoints(p);
    const scopes = (p.scopes ?? getDefaultScopes(p.driver.toLowerCase())).join(
        " ",
    );

    const query = new URLSearchParams({
        response_type: "code",
        client_id: p.client_id,
        redirect_uri: params.redirectUri,
        scope: scopes,
        state: params.state,
    });

    // Apple은 response_mode=form_post 필요
    if (p.driver.toLowerCase() === "apple") {
        query.set("response_mode", "form_post");
    }

    if (params.codeChallenge) {
        query.set("code_challenge", params.codeChallenge);
        query.set("code_challenge_method", "S256");
    }

    return `${authUrl}?${query.toString()}`;
}
