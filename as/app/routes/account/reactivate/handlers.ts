/**
 * 휴면 계정 재활성화 핸들러
 *
 * Go `POST /v1/account/reactivate` 대체 구현.
 * 이메일+비밀번호 또는 OAuth code 로 본인 확인 후 account.status 를 `active`로 복구하고
 * JWT 토큰 쌍을 즉시 발급한다.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    entityServer,
    fail,
    logger,
    ok,
    registerAuthenticatedSession,
} from "@system/api";
import { issueTokenPair } from "../../../plugins/2fa/handlers/utils.ts";
import {
    getProvider,
    buildCallbackUrl,
} from "../../../plugins/oauth/config.ts";
import { validateState } from "../../../plugins/oauth/state.ts";
import {
    exchangeCode,
    getUserInfo,
} from "../../../plugins/oauth/providers/index.ts";
import { upsertOAuthAccount } from "../../../plugins/oauth/upsert.ts";
import type {
    AccountTotpFields,
    TwoFactorConfig,
} from "../../../plugins/2fa/types.ts";
import { verifyPassword } from "../../password-reset/password-utils.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ReactivateBody {
    email?: string;
    passwd?: string;
    provider?: string;
    code?: string;
    state?: string;
    redirect_uri?: string;
}

interface ReactivateAccount extends AccountTotpFields {
    status?: string;
    dormancy_warned_days?: number;
}

function loadTokenConfig(): TwoFactorConfig {
    const configPath = resolve(
        __dirname,
        "..",
        "..",
        "..",
        "plugins",
        "2fa",
        "config.json",
    );
    let raw: Record<string, unknown> = {};

    if (existsSync(configPath)) {
        const text = readFileSync(configPath, "utf-8").replace(
            /\$\{([^}]+)\}/g,
            (_m, name: string) => process.env[name] ?? "",
        );
        raw = JSON.parse(text) as Record<string, unknown>;
    }

    return {
        enabled: raw.enabled !== false,
        issuer: String(raw.issuer ?? "EntityServer"),
        enforce_roles: Array.isArray(raw.enforce_roles)
            ? raw.enforce_roles.map(String)
            : [],
        code_digits: Number(raw.code_digits) || 6,
        period_sec: Number(raw.period_sec) || 30,
        skew: Number(raw.skew) ?? 1,
        recovery_code_count: Number(raw.recovery_code_count) || 10,
        setup_token_ttl_sec: Number(raw.setup_token_ttl_sec) || 300,
        max_verify_attempts: Number(raw.max_verify_attempts) || 5,
        verify_lockout_sec: Number(raw.verify_lockout_sec) || 300,
        jwt_access_ttl_sec: Number(raw.jwt_access_ttl_sec) || 3600,
        jwt_refresh_ttl_sec: Number(raw.jwt_refresh_ttl_sec) || 1209600,
        jwt_issuer: String(raw.jwt_issuer ?? "entity-server"),
    };
}

function nowSqlString(): string {
    return new Date()
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, "");
}

async function verifyOAuthOwnership(
    body: ReactivateBody,
    email: string,
    accountSeq: number,
): Promise<ReactivateAccount | null> {
    const provider = (body.provider ?? "").trim().toLowerCase();
    const code = (body.code ?? "").trim();
    if (!provider || !code) return null;
    if (!getProvider(provider)) {
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    let codeVerifier: string | undefined;
    if (body.state) {
        ({ codeVerifier } = validateState(body.state, provider));
    }

    const token = await exchangeCode({
        provider,
        code,
        redirectUri: body.redirect_uri || buildCallbackUrl(provider),
        codeVerifier,
    });
    const userInfo = await getUserInfo(provider, token);

    if (!userInfo.email) {
        throw new Error("OAuth provider did not return an email address");
    }
    if (userInfo.email.toLowerCase() !== email.toLowerCase()) {
        throw new Error("OAuth email does not match account email");
    }

    const linkedAccount = await upsertOAuthAccount(userInfo);
    if (Number(linkedAccount.seq) !== accountSeq) {
        throw new Error(
            "This OAuth account is already linked to another account",
        );
    }

    return linkedAccount as ReactivateAccount;
}

export async function handleReactivate(
    req: FastifyRequest<{ Body: ReactivateBody }>,
    reply: FastifyReply,
): Promise<void> {
    const email = (req.body?.email ?? "").trim();
    const passwd = (req.body?.passwd ?? "").trim();
    const provider = (req.body?.provider ?? "").trim().toLowerCase();
    const code = (req.body?.code ?? "").trim();

    if (!email) {
        reply.code(400).send(fail("email is required"));
        return;
    }
    if (!passwd && !(provider && code)) {
        reply.code(400).send(fail("passwd or (provider and code) is required"));
        return;
    }

    let account: ReactivateAccount | null = null;
    try {
        const result = await entityServer.find<ReactivateAccount>("account", {
            email,
        });
        account = result?.data ?? null;
    } catch {
        account = null;
    }

    if (!account) {
        reply.code(404).send(fail("Account not found"));
        return;
    }

    const status = String(account.status ?? "");
    if (status !== "dormant") {
        if (status === "active") {
            reply.code(409).send(fail("Account is already active"));
            return;
        }
        reply
            .code(403)
            .send(fail(`Account cannot be reactivated (status: ${status})`));
        return;
    }

    let tokenAccount = account;

    if (provider && code) {
        try {
            const linkedAccount = await verifyOAuthOwnership(
                req.body ?? {},
                email,
                Number(account.seq),
            );
            if (linkedAccount) {
                tokenAccount = { ...account, ...linkedAccount };
            }
        } catch (err) {
            logger.warn(
                { err, email, provider },
                "Account reactivate: OAuth verification failed",
            );
            const message =
                err instanceof Error
                    ? err.message
                    : "OAuth verification failed";
            const statusCode = message.startsWith("Unsupported OAuth provider")
                ? 400
                : message ===
                    "This OAuth account is already linked to another account"
                  ? 409
                  : 401;
            reply.code(statusCode).send(fail(message));
            return;
        }
    } else {
        if (!account.passwd || !verifyPassword(passwd, account.passwd)) {
            reply.code(401).send(fail("Invalid password"));
            return;
        }
    }

    try {
        await entityServer.submit("account", {
            seq: account.seq,
            status: "active",
            last_login_time: nowSqlString(),
            dormancy_warned_days: 0,
        });
    } catch (err) {
        logger.error(
            { err, accountSeq: account.seq },
            "Account reactivate: failed to update account",
        );
        reply.code(500).send(fail("Failed to reactivate account"));
        return;
    }

    const tokenPair = await issueTokenPair(
        {
            ...tokenAccount,
            name: tokenAccount.name ?? tokenAccount.email,
            rbac_role: (tokenAccount.rbac_role ?? "").trim() || "user",
            license_seq: Number(tokenAccount.license_seq ?? 0),
        },
        loadTokenConfig(),
    );

    logger.info(
        { accountSeq: account.seq, email },
        "Account reactivate: account reactivated",
    );

    await registerAuthenticatedSession(req, tokenPair.access_token);

    reply
        .header("X-Access-Token", tokenPair.access_token)
        .header("X-Refresh-Token", tokenPair.refresh_token)
        .send(ok(tokenPair));
}
