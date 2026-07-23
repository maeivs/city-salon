import type { FastifyReply, FastifyRequest } from "fastify";
import { entityServer, fail } from "@system/api";
import { loadTwoFactorConfig } from "../../../plugins/2fa/config.ts";
import type { LoginAccountRow, LoginBody } from "../types/loginFirstFactor.ts";
import {
    generateSetupToken,
    generateTwoFactorToken,
    isRoleEnforced,
} from "../../../plugins/2fa/handlers/utils.ts";
import { verifyPassword } from "../../password-reset/password-utils.ts";

/** 요청 경로에서 쿼리스트링을 제거한 값을 반환한다. */
function getRequestPath(req: FastifyRequest): string {
    return (req.raw.url || req.url).split("?")[0] || req.url;
}

/** 이메일로 계정을 조회한다. */
async function findAccountByEmail(
    email: string,
): Promise<LoginAccountRow | null> {
    try {
        const res = await entityServer.list<LoginAccountRow>("account", {
            conditions: { email },
            limit: 1,
        });
        return (res?.data?.items ?? [])[0] ?? null;
    } catch {
        return null;
    }
}

/** 임시 비밀번호의 유효성을 검증한다. */
function verifyTempPassword(account: LoginAccountRow, passwd: string): boolean {
    const tempHash = String(account.temp_password_hash ?? "").trim();
    if (
        !tempHash ||
        tempHash === "<nil>" ||
        !verifyPassword(passwd, tempHash)
    ) {
        return false;
    }

    const expiresStr = String(account.password_reset_expires ?? "").trim();
    if (expiresStr && expiresStr !== "<nil>") {
        const expiresAt = new Date(expiresStr);
        if (
            !Number.isNaN(expiresAt.getTime()) &&
            Date.now() > expiresAt.getTime()
        ) {
            return false;
        }
    }

    const issuedStr = String(account.temp_password_issued_time ?? "").trim();
    if (!issuedStr || issuedStr === "<nil>") {
        return false;
    }

    const issuedAt = new Date(issuedStr.replace(" ", "T") + "Z");
    if (Number.isNaN(issuedAt.getTime())) {
        return false;
    }

    return Date.now() <= issuedAt.getTime() + 300 * 1000;
}

/** 계정의 일반 비밀번호와 임시 비밀번호를 함께 검증한다. */
function verifyAccountPassword(
    account: LoginAccountRow,
    passwd: string,
): boolean {
    const storedPasswd = String(account.passwd ?? "").trim();
    if (storedPasswd && verifyPassword(passwd, storedPasswd)) {
        return true;
    }
    return verifyTempPassword(account, passwd);
}

/** 로그인 요청에서 2FA 첫 단계를 처리한다. */
export async function handleLoginFirstFactor(
    req: FastifyRequest,
    reply: FastifyReply,
): Promise<boolean> {
    if (req.method !== "POST" || getRequestPath(req) !== "/v1/auth/login") {
        return false;
    }

    const cfg = loadTwoFactorConfig();
    if (!cfg) {
        return false;
    }

    const body = (req.body ?? {}) as LoginBody;
    const email = String(body.email ?? "").trim();
    const passwd = String(body.passwd ?? "").trim();
    if (!email || !passwd) {
        return false;
    }

    const account = await findAccountByEmail(email);
    if (!account) {
        return false;
    }

    const entityRole = String(account.rbac_role ?? "").trim();
    const totpEnabled = account.totp_enabled === true;
    const setupRequired = isRoleEnforced(cfg, entityRole) && !totpEnabled;

    if (!totpEnabled && !setupRequired) {
        return false;
    }

    if (!verifyAccountPassword(account, passwd)) {
        reply.code(401).send(fail("Invalid email or password"));
        return true;
    }

    const status = String(account.status ?? "").trim();
    if (status && status !== "active") {
        if (status === "dormant") {
            reply
                .code(403)
                .send(
                    fail(
                        "Account is dormant. Use POST /api/v1/auth/reactivate to reactivate.",
                    ),
                );
            return true;
        }

        reply.code(403).send(fail("Account is not active"));
        return true;
    }

    if (totpEnabled) {
        reply.code(200).send({
            ok: true,
            requires_2fa: true,
            data: {
                two_factor_token: generateTwoFactorToken(
                    account.seq,
                    "2fa_verify",
                    cfg.setup_token_ttl_sec,
                ),
                expires_in: cfg.setup_token_ttl_sec,
            },
        });
        return true;
    }

    reply.code(403).send({
        ok: false,
        error: "2fa_setup_required",
        message: "이 계정은 2FA 설정이 필수입니다.",
        data: {
            setup_token: generateSetupToken(
                account.seq,
                cfg.setup_token_ttl_sec,
            ),
            expires_in: cfg.setup_token_ttl_sec,
        },
    });
    return true;
}
