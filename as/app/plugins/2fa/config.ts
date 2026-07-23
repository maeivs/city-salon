/**
 * 2FA (TOTP) 설정 로더
 *
 * config.json 을 읽어 TwoFactorConfig 를 반환한다.
 * enabled 가 true 일 때만 설정을 활성화한다.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { TwoFactorConfig } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** config.json 을 읽어 설정을 반환한다. enabled=true 일 때만 활성화한다. */
export function loadTwoFactorConfig(): TwoFactorConfig | null {
    const configPath = resolve(__dirname, "config.json");
    let raw: Record<string, unknown> = {};

    if (existsSync(configPath)) {
        const text = readFileSync(configPath, "utf-8").replace(
            /\$\{([^}]+)\}/g,
            (_m, name: string) => process.env[name] ?? "",
        );
        raw = JSON.parse(text) as Record<string, unknown>;
    }

    if (raw.enabled !== true) return null;

    return {
        enabled: true,
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
