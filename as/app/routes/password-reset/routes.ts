/**
 * 비밀번호 재설정 라우트 플러그인
 *
 * 자동 로더가 `app/routes/password-reset/routes.ts`를 탐색하여
 * prefix `/v1/password-reset` 으로 등록한다.
 *
 * 엔드포인트:
 *   POST /request           — 비밀번호 재설정 요청 (회원)
 *   GET  /validate/:token   — 토큰 유효성 확인 (link 모드 전용)
 *   POST /verify            — 토큰 검증 + 새 비밀번호 설정 (link 모드 전용)
 */

import type { FastifyInstance } from "fastify";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import { ensurePluginEntities } from "@system/api";
import type { PasswordResetConfig } from "./types/index.ts";
import {
    createRequestHandler,
    createValidateHandler,
    createVerifyHandler,
} from "./handlers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const suppressRouteRegisterLog = true;

/** config.json 로드 + 기본값 보정 */
function loadConfig(): PasswordResetConfig {
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
        mode: (raw.mode as PasswordResetConfig["mode"]) ?? "temp_password",
        temp_password_ttl_sec: Number(raw.temp_password_ttl_sec) || 300,
        temp_password_length: Number(raw.temp_password_length) || 12,
        link_base_url: String(raw.link_base_url ?? ""),
        link_token_ttl_sec: Number(raw.link_token_ttl_sec) || 300,
        rate_limit: {
            per_email_per_hour: Number(rl.per_email_per_hour) || 5,
            per_ip_per_minute: Number(rl.per_ip_per_minute) || 10,
        },
        email_subject: String(raw.email_subject ?? "비밀번호 재설정"),
    };
}

export default async function passwordResetRoutes(
    app: FastifyInstance,
): Promise<void> {
    const cfg = loadConfig();

    if (!cfg.enabled) {
        return;
    }

    await ensurePluginEntities(__dirname).catch((err) =>
        logger.warn({ err }, "password-reset: ensureEntities failed"),
    );

    const handleRequest = createRequestHandler(cfg);
    const handleValidate = createValidateHandler(cfg);
    const handleVerify = createVerifyHandler(cfg);

    // POST /request — 비밀번호 재설정 요청
    app.post("/request", handleRequest);

    // GET /validate/:token — 토큰 유효성 확인 (link 모드 전용)
    app.get("/validate/:token", handleValidate);

    // POST /verify — 토큰 검증 + 새 비밀번호 설정 (link 모드 전용)
    app.post("/verify", handleVerify);
}
