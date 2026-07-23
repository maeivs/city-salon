/**
 * register 설정 로더
 *
 * email-verify confirm/activate 등 외부 모듈에서도
 * register config(send_welcome_email, welcome_email_subject 등)를 읽을 수 있도록 분리.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RegisterConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadRegisterConfig(): RegisterConfig {
    const configPath = resolve(__dirname, "config.json");
    let raw: Record<string, unknown> = {};
    if (existsSync(configPath)) {
        const text = readFileSync(configPath, "utf-8").replace(
            /\$\{([^}]+)\}/g,
            (_m, name) => process.env[name] ?? "",
        );
        raw = JSON.parse(text) as Record<string, unknown>;
    }

    return {
        enabled: raw.enabled !== false,
        send_welcome_email: raw.send_welcome_email === true,
        welcome_email_subject: String(
            raw.welcome_email_subject ?? "가입을 환영합니다!",
        ),
        default_role: String(raw.default_role ?? "user"),
    };
}
