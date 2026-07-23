/**
 * Health 핸들러 구현
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import {
    issueCsrfToken,
    loadCsrfConfig,
    issuePacketCookies,
    appendSetCookie,
    loadPacketEncryptConfig,
    decodeAuthTokenClaims,
    env,
} from "@system/api";

/** Authorization 헤더에서 Bearer 토큰을 추출한다. 없으면 빈 문자열. */
function extractBearerFromHeader(authorization?: string): string {
    if (!authorization?.startsWith("Bearer ")) {
        return "";
    }
    return authorization.slice(7).trim();
}

function hasCookie(
    cookieHeader: string | undefined,
    cookieName: string,
): boolean {
    if (!cookieHeader) {
        return false;
    }

    return cookieHeader
        .split(";")
        .some((part) => part.trim().startsWith(`${cookieName}=`));
}

function dedupeSetCookieHeaders(reply: FastifyReply): void {
    const current = reply.getHeader("Set-Cookie");
    if (!current) {
        return;
    }

    const cookies = Array.isArray(current)
        ? current.map(String)
        : [String(current)];
    const dedupedByName = new Map<string, string>();
    for (const cookie of cookies) {
        const cookieName = cookie.split(";")[0]?.split("=")[0]?.trim();
        if (!cookieName) {
            continue;
        }
        dedupedByName.set(cookieName, cookie);
    }
    const dedupedCookies = [...dedupedByName.values()];
    reply.raw.setHeader(
        "Set-Cookie",
        dedupedCookies.length === 1 ? dedupedCookies[0] : dedupedCookies,
    );
}

function parseCookies(
    cookieHeader: string | undefined,
): Record<string, string> {
    if (!cookieHeader) {
        return {};
    }

    const result: Record<string, string> = {};
    for (const part of cookieHeader.split(";")) {
        const idx = part.indexOf("=");
        if (idx < 0) {
            continue;
        }
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        result[key] = decodeURIComponent(value);
    }
    return result;
}

function readCookieValueFromSetCookie(
    setCookieHeader: string,
    cookieName: string,
): string | null {
    const firstPart = setCookieHeader.split(";")[0] ?? "";
    const prefix = `${cookieName}=`;
    if (!firstPart.startsWith(prefix)) {
        return null;
    }

    return decodeURIComponent(firstPart.slice(prefix.length));
}

/** 토큰 갱신 응답에서 access token 을 추출한다. */
function extractAccessToken(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const directToken = record.access_token;
    if (typeof directToken === "string" && directToken.trim()) {
        return directToken;
    }

    const data = record.data;
    if (!data || typeof data !== "object") {
        return null;
    }

    const nestedToken = (data as Record<string, unknown>).access_token;
    return typeof nestedToken === "string" && nestedToken.trim()
        ? nestedToken
        : null;
}

function resolveCsrfToken(
    req: FastifyRequest,
    reply: FastifyReply,
): string | null {
    const csrfConfig = loadCsrfConfig();
    const cookies = parseCookies(req.headers.cookie);
    const existingToken = cookies[csrfConfig.cookieName];
    if (existingToken) {
        return existingToken;
    }

    if (!csrfConfig.enabled) {
        return null;
    }

    issueCsrfToken(reply, csrfConfig);
    const current = reply.getHeader("Set-Cookie");
    const cookieHeaders = Array.isArray(current)
        ? current.map(String)
        : current
          ? [String(current)]
          : [];

    for (const header of cookieHeaders) {
        const token = readCookieValueFromSetCookie(
            header,
            csrfConfig.cookieName,
        );
        if (token) {
            return token;
        }
    }

    return null;
}

async function tryBootstrapAuth(
    req: FastifyRequest,
    reply: FastifyReply,
): Promise<string | null> {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
        return null;
    }

    const cookies = parseCookies(cookieHeader);
    if (!cookies.token_refresh) {
        return null;
    }

    const response = await fetch(
        `${env.ENTITY_SERVER_URL}/v1/auth/token_refresh`,
        {
            method: "POST",
            headers: {
                Cookie: cookieHeader,
            },
        },
    );

    if (response.status === 400 || response.status === 401) {
        return null;
    }

    if (!response.ok) {
        throw new Error(
            `Health auth bootstrap failed: HTTP ${response.status}`,
        );
    }

    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookie) {
        appendSetCookie(reply, cookie);
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    return extractAccessToken(payload);
}

/** 서버 기본 상태를 반환한다 */
export async function getHealth(req: FastifyRequest, reply: FastifyReply) {
    const csrfConfig = loadCsrfConfig();
    const cookieHeader = req.headers.cookie;
    if (csrfConfig.enabled && !hasCookie(cookieHeader, csrfConfig.cookieName)) {
        issueCsrfToken(reply, csrfConfig);
    }

    // 패킷 암호화 활성 여부를 헤더로 알려, entity-client 가 마운트 시 자동으로 모드를 맞춘다.
    if (loadPacketEncryptConfig().enabled) {
        reply.header("X-Packet-Encryption", "1");
    }

    let accessToken: string | null = null;

    // 로그인 사용자(JWT): refresh 쿠키가 "같은 계정" 소유일 때만 세션을 갱신한다.
    // 같은 도메인에서 다른 라이선스/계정으로 로그인한 탭이 남긴 공유 쿠키로
    // 교차 계정 access token 이 발급·채택되는 세션 오염을 서버 단에서 차단한다.
    const bearerToken = extractBearerFromHeader(req.headers.authorization);
    if (bearerToken) {
        const bearerClaims = decodeAuthTokenClaims(bearerToken);
        const bearerSub = String(bearerClaims?.sub ?? "").trim();
        const cookies = parseCookies(cookieHeader);
        const refreshSub = String(
            decodeAuthTokenClaims(cookies.token_refresh)?.sub ?? "",
        ).trim();

        if (bearerSub && refreshSub && bearerSub === refreshSub) {
            accessToken = await tryBootstrapAuth(req, reply);
        }
        if (accessToken) {
            reply.header("X-Access-Token", accessToken);
        }
        dedupeSetCookieHeaders(reply);

        // 갱신에 실패했으면(다른 계정 쿠키·쿠키 없음) bearer 자체의 만료로 판정한다.
        const bearerExp = Number(bearerClaims?.exp ?? 0);
        const bearerAlive =
            bearerExp > 0 ? bearerExp * 1000 > Date.now() : Boolean(bearerClaims);
        return reply.send({
            status: "ok",
            authenticated: Boolean(accessToken) || bearerAlive,
        });
    }

    accessToken = await tryBootstrapAuth(req, reply);

    if (accessToken) {
        reply.header("X-Access-Token", accessToken);
        dedupeSetCookieHeaders(reply);
        return reply.send({ status: "ok", authenticated: true });
    }

    if (
        !hasCookie(cookieHeader, "_device_id") ||
        !hasCookie(cookieHeader, "anon_token")
    ) {
        issuePacketCookies(req, reply);
    }

    dedupeSetCookieHeaders(reply);

    return reply.send({ status: "ok", authenticated: false });
}

/** DB 연결 등 준비 상태를 반환한다 */
export async function getReady(req: FastifyRequest, reply: FastifyReply) {
    const dbOk = (req.server as any).db !== null;
    const status = dbOk ? "ready" : "degraded";

    return reply.code(dbOk ? 200 : 503).send({
        ok: dbOk,
        data: {
            status,
            db: dbOk ? "connected" : "not configured",
            timestamp: new Date().toISOString(),
        },
    });
}
