/**
 * GET/POST /v1/oauth/:provider/callback
 *
 * OAuth 콜백 처리 → JWT 발급 (또는 2FA 토큰)
 *
 * Go auth_handler.go HandleOAuthCallback 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import {
    entityServer,
    env,
    issueAuthTokenPair,
    logger,
    registerAuthenticatedSession,
} from "@system/api";
import { getOAuthConfig, getProvider, buildCallbackUrl } from "../config.ts";
import { validateState } from "../state.ts";
import { exchangeCode, getUserInfo } from "../providers/index.ts";
import { upsertOAuthAccount } from "../upsert.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ──────────── 2FA config 지연 로드 ──────────── */

interface TwoFactorConfig {
    enabled: boolean;
    setup_token_ttl_sec: number;
    jwt_access_ttl_sec: number;
    jwt_refresh_ttl_sec: number;
    jwt_issuer: string;
}

let _twoFactorConfig: TwoFactorConfig | null | undefined;

function loadTwoFactorConfig(): TwoFactorConfig | null {
    if (_twoFactorConfig !== undefined) return _twoFactorConfig;
    const cfgPath = resolve(
        __dirname,
        "..",
        "..",
        "account",
        "2fa",
        "config.json",
    );
    if (!existsSync(cfgPath)) {
        _twoFactorConfig = null;
        return null;
    }
    try {
        const parsed = JSON.parse(
            readFileSync(cfgPath, "utf-8"),
        ) as Partial<TwoFactorConfig>;
        _twoFactorConfig =
            parsed.enabled === true ? (parsed as TwoFactorConfig) : null;
    } catch {
        _twoFactorConfig = null;
    }
    return _twoFactorConfig;
}

/* ──────────── 토큰 발급 ──────────── */

function issueTokenPair(
    account: Record<string, unknown>,
    cfg: TwoFactorConfig,
): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
}> {
    return issueAuthTokenPair(account, cfg);
}

function generateSpecialToken(
    accountSeq: number,
    purpose: "2fa_verify" | "2fa_setup",
    ttlSec: number,
): string {
    return jwt.sign({ purpose }, env.JWT_SECRET, {
        subject: String(accountSeq),
        expiresIn: ttlSec,
    });
}

/* ──────────── 리다이렉트 헬퍼 ──────────── */

function appendQuery(base: string, params: Record<string, string>): string {
    const url = new URL(base.includes("://") ? base : `http://dummy${base}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const result = url.toString();
    return base.includes("://") ? result : result.replace("http://dummy", "");
}

function failureRedirect(
    reply: FastifyReply,
    failureUrl: string | undefined,
    message: string,
): void {
    if (failureUrl) {
        reply.redirect(appendQuery(failureUrl, { error: message }), 302);
    } else {
        reply.code(400).send({ ok: false, error: message });
    }
}

/* ──────────── 콜백 핸들러 ──────────── */

export async function handleOAuthCallback(
    req: FastifyRequest<{ Params: { provider: string } }>,
    reply: FastifyReply,
): Promise<void> {
    const cfg = getOAuthConfig();
    const provider = req.params.provider.toLowerCase();
    const successUrl = cfg?.success_redirect_url;
    const failureUrl = cfg?.failure_redirect_url;

    if (!cfg?.enabled || !getProvider(provider)) {
        return failureRedirect(reply, failureUrl, "OAuth is not configured");
    }

    // state 검증 (Apple은 POST form)
    const rawState =
        (req.query as Record<string, string>).state ||
        (req.body as Record<string, string>)?.state ||
        "";
    let codeVerifier = "";
    if (rawState) {
        try {
            ({ codeVerifier } = validateState(rawState, provider));
        } catch (err) {
            logger.warn({ provider, err }, "OAuth state validation failed");
            return failureRedirect(reply, failureUrl, "Invalid OAuth state");
        }
    }

    // authorization code
    const code =
        (req.query as Record<string, string>).code ||
        (req.body as Record<string, string>)?.code ||
        "";
    if (!code) {
        const errMsg =
            (req.query as Record<string, string>).error_description ||
            (req.body as Record<string, string>)?.error_description ||
            (req.query as Record<string, string>).error ||
            "OAuth authorization denied";
        logger.warn({ provider, errMsg }, "OAuth callback: no code");
        return failureRedirect(reply, failureUrl, errMsg);
    }

    const extraUserJSON = (req.body as Record<string, string>)?.user || ""; // Apple

    // 토큰 교환
    let token;
    try {
        token = await exchangeCode({
            provider,
            code,
            redirectUri: buildCallbackUrl(provider),
            codeVerifier: codeVerifier || undefined,
        });
    } catch (err) {
        logger.error({ provider, err }, "OAuth token exchange failed");
        return failureRedirect(
            reply,
            failureUrl,
            "Failed to retrieve OAuth user info",
        );
    }

    // 사용자 정보 조회
    let userInfo;
    try {
        userInfo = await getUserInfo(provider, token, extraUserJSON);
    } catch (err) {
        logger.error({ provider, err }, "OAuth getUserInfo failed");
        return failureRedirect(
            reply,
            failureUrl,
            "Failed to retrieve OAuth user info",
        );
    }

    if (!userInfo.email) {
        return failureRedirect(
            reply,
            failureUrl,
            "OAuth provider did not return an email address",
        );
    }

    // account upsert
    let account: Record<string, unknown>;
    try {
        account = (await upsertOAuthAccount(userInfo)) as Record<
            string,
            unknown
        >;
    } catch (err) {
        logger.error({ provider, err }, "OAuth upsert account failed");
        return failureRedirect(
            reply,
            failureUrl,
            "Failed to register OAuth user",
        );
    }

    // 계정 상태 확인
    const status = String(account.status ?? "");
    if (status && status !== "active") {
        if (status === "dormant") {
            return failureRedirect(
                reply,
                failureUrl,
                "Account is dormant. Use POST /v1/account/reactivate to reactivate.",
            );
        }
        return failureRedirect(reply, failureUrl, "Account is not active");
    }

    const accountSeq = Number(account.seq);
    const entityRole = String(account.rbac_role ?? "").trim();
    if (!entityRole) {
        logger.error({ email: userInfo.email }, "OAuth: missing rbac_role");
        return failureRedirect(
            reply,
            failureUrl,
            "Account role is not configured",
        );
    }

    // 2FA 분기
    const tfaCfg = loadTwoFactorConfig();
    if (tfaCfg?.enabled) {
        const totpEnabled = account.totp_enabled === true;

        if (totpEnabled) {
            const twoFactorToken = generateSpecialToken(
                accountSeq,
                "2fa_verify",
                tfaCfg.setup_token_ttl_sec,
            );
            if (successUrl) {
                return reply.redirect(
                    appendQuery(successUrl, {
                        "2fa_required": "true",
                        "2fa_token": twoFactorToken,
                    }),
                    302,
                );
            }
            reply.send({
                ok: true,
                requires_2fa: true,
                data: {
                    two_factor_token: twoFactorToken,
                    expires_in: tfaCfg.setup_token_ttl_sec,
                },
            });
            return;
        }
    }

    // JWT 발급
    const tokenConfig = tfaCfg ?? {
        jwt_access_ttl_sec: 3600,
        jwt_refresh_ttl_sec: 1_209_600,
        jwt_issuer: "entity-server",
    };

    const tokenPair = await issueTokenPair(
        account,
        tokenConfig as TwoFactorConfig,
    );
    await registerAuthenticatedSession(req, tokenPair.access_token);

    if (successUrl) {
        return reply.redirect(
            appendQuery(successUrl, {
                access_token: tokenPair.access_token,
                refresh_token: tokenPair.refresh_token,
            }),
            302,
        );
    }

    reply
        .header("X-Access-Token", tokenPair.access_token)
        .header("X-Refresh-Token", tokenPair.refresh_token)
        .send({ ok: true, data: tokenPair });
}
