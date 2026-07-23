import type { FastifyReply, FastifyRequest } from "fastify";
import {
    appendSetCookie,
    env,
    registerAuthenticatedSession,
    revokeAuthenticatedSession,
} from "@system/api";
import { loadPasswordPolicyConfig } from "../../../utils/passwordPolicyConfig.ts";

/** hop-by-hop 헤더 이름 집합이다. */
const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "content-length",
    "content-encoding",
    "transfer-encoding",
    "host",
]);

/** 업스트림으로 전달할 요청 헤더를 조립한다. */
function buildUpstreamHeaders(req: FastifyRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lowerKey)) {
            continue;
        }

        if (typeof value === "string") {
            headers[key] = value;
            continue;
        }

        if (Array.isArray(value)) {
            headers[key] = value.join(", ");
        }
    }
    return headers;
}

/** 업스트림으로 전달할 요청 바디를 조립한다. */
function buildUpstreamBody(
    req: FastifyRequest,
): RequestInit["body"] | undefined {
    if (req.method === "GET" || req.method === "HEAD") {
        return undefined;
    }

    if (typeof req.body === "undefined" || req.body === null) {
        return undefined;
    }

    if (typeof req.body === "string") {
        return req.body;
    }

    if (req.body instanceof Uint8Array || req.body instanceof ArrayBuffer) {
        return req.body;
    }

    return JSON.stringify(req.body);
}

/** 업스트림 응답 헤더를 현재 응답으로 복사한다. */
function copyUpstreamHeaders(response: Response, reply: FastifyReply): void {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
        appendSetCookie(reply, cookie);
    }

    for (const [key, value] of response.headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lowerKey) || lowerKey === "set-cookie") {
            continue;
        }
        reply.header(key, value);
    }
}

/** JSON 응답 문자열을 안전하게 파싱한다. */
function parseJsonText(bodyText: string): unknown | null {
    try {
        return JSON.parse(bodyText);
    } catch {
        return null;
    }
}

/** 로그인 응답에서 access_token을 추출한다. */
function extractAccessToken(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const data = (payload as Record<string, unknown>).data;
    if (!data || typeof data !== "object") return null;
    const token = (data as Record<string, unknown>).access_token;
    return typeof token === "string" && token.trim() ? token : null;
}

/** 현재 프록시 요청이 로그인 요청인지 판별한다. */
function isLoginRequest(req: FastifyRequest): boolean {
    const path = req.raw.url || req.url;
    return req.method === "POST" && path.startsWith("/v1/auth/login");
}

/** 현재 프록시 요청이 로그아웃 요청인지 판별한다. */
function isLogoutRequest(req: FastifyRequest): boolean {
    const path = req.raw.url || req.url;
    return req.method === "POST" && path.startsWith("/v1/auth/logout");
}

/** 현재 프록시 요청이 내 계정 조회 요청인지 판별한다. */
function isMeRequest(req: FastifyRequest): boolean {
    const path = (req.raw.url || req.url).split("?")[0];
    return req.method === "GET" && path === "/v1/auth/me";
}

/** me 응답에 클라이언트 검증용 비밀번호 정책을 추가한다. */
async function attachPasswordPolicyToMeResponse(
    req: FastifyRequest,
    payload: unknown,
): Promise<unknown> {
    if (!isMeRequest(req) || !payload || typeof payload !== "object") {
        return payload;
    }

    const record = payload as Record<string, unknown>;
    if (!record.data || typeof record.data !== "object") {
        return payload;
    }

    (record.data as Record<string, unknown>).password_policy =
        await loadPasswordPolicyConfig();
    return record;
}

/** 인증 프록시 응답 후 세션 후처리를 수행한다. */
async function handleSessionSideEffects(
    req: FastifyRequest,
    response: Response,
    bodyText: string,
): Promise<unknown | null> {
    const payload = parseJsonText(bodyText);
    if (response.status >= 400 || !payload) {
        return payload;
    }

    if (isLoginRequest(req)) {
        await registerAuthenticatedSession(req, extractAccessToken(payload));
    }

    if (isLogoutRequest(req)) {
        await revokeAuthenticatedSession(req, "logout");
    }

    return await attachPasswordPolicyToMeResponse(req, payload);
}

/** ES 인증 라우트로 요청을 프록시 전달한다. */
export async function forwardToEntityServer(
    req: FastifyRequest,
    reply: FastifyReply,
) {
    const upstreamUrl = `${env.ENTITY_SERVER_URL}${req.raw.url || req.url}`;
    const response = await fetch(upstreamUrl, {
        method: req.method,
        headers: buildUpstreamHeaders(req),
        body: buildUpstreamBody(req),
    });

    reply.status(response.status);
    copyUpstreamHeaders(response, reply);

    const contentType = response.headers.get("content-type") ?? "";
    if (
        contentType.includes("application/json") ||
        contentType.startsWith("text/")
    ) {
        const bodyText = await response.text();
        if (!contentType.includes("application/json")) {
            return reply.send(bodyText);
        }

        const payload = await handleSessionSideEffects(req, response, bodyText);
        return reply.send(payload ?? bodyText);
    }

    return reply.send(Buffer.from(await response.arrayBuffer()));
}
