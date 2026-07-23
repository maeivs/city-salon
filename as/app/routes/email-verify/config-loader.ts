/**
 * email-verify 설정 로더
 *
 * `router.ts`와 외부 모듈(register 등) 모두에서 재사용하기 위해
 * 별도 파일로 분리.
 *
 * Usage:
 *   import { loadEmailVerifyConfig } from "../../email-verify/config-loader.ts";
 *   const cfg = loadEmailVerifyConfig();
 *   if (cfg.enabled) { ... }
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EmailVerifyConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** email-verify/config.json 로드 + 기본값 보정 */
export function loadEmailVerifyConfig(): EmailVerifyConfig {
    const configPath = resolve(__dirname, "config.json");
    let raw: Record<string, unknown> = {};
    if (existsSync(configPath)) {
        const text = readFileSync(configPath, "utf-8").replace(
            /\$\{([^}]+)\}/g,
            (_m, name) => process.env[name] ?? "",
        );
        raw = JSON.parse(text) as Record<string, unknown>;
    }

    const rl = (raw.rate_limit ?? {}) as Record<string, unknown>;

    return {
        enabled: raw.enabled !== false,
        required: raw.required === true,
        code_length: Number(raw.code_length) || 6,
        code_ttl_sec: Number(raw.code_ttl_sec) || 300,
        max_attempts: Number(raw.max_attempts) || 5,
        resend_cooldown_sec: Number(raw.resend_cooldown_sec) || 60,
        link_base_url: String(raw.link_base_url ?? ""),
        rate_limit: {
            per_email_per_hour: Number(rl.per_email_per_hour) || 5,
        },
        email_subject: String(raw.email_subject ?? "이메일 인증"),
    };
}
