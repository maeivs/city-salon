/**
 * SMS 설정 로더
 *
 * 플러그인 디렉토리의 config.json을 읽고 환경변수 치환을 수행합니다.
 * Go 엔티티서버 `internal/config/sms_loader.go`에서 포팅
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type { SmsConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

/** SMS 설정을 로드한다 */
export function loadSmsConfig(): SmsConfig | null {
    try {
        let raw = readFileSync(CONFIG_PATH, "utf-8");

        // 환경변수 치환: ${VAR} → process.env.VAR
        raw = raw.replace(
            /\$\{([^}]+)\}/g,
            (_match, name) => process.env[name] ?? "",
        );

        const cfg: SmsConfig = JSON.parse(raw);

        if (cfg.enabled === false) {
            logger.info("SMS plugin disabled in config");
            return null;
        }

        // 기본값 보정
        if (!cfg.workers || cfg.workers <= 0) cfg.workers = 2;
        if (!cfg.queue_size || cfg.queue_size <= 0) cfg.queue_size = 200;
        if (!cfg.dispatch_interval_sec || cfg.dispatch_interval_sec <= 0)
            cfg.dispatch_interval_sec = 5;
        if (!cfg.max_retries || cfg.max_retries <= 0) cfg.max_retries = 3;
        if (cfg.auto_lms === undefined) cfg.auto_lms = true;
        if (!cfg.lms_threshold_bytes || cfg.lms_threshold_bytes <= 0)
            cfg.lms_threshold_bytes = 80;

        // 프로바이더가 1개이고 default 미설정 시 자동 추론
        if (
            !cfg.default &&
            cfg.providers &&
            Object.keys(cfg.providers).length === 1
        ) {
            cfg.default = Object.keys(cfg.providers)[0];
        }

        // 검증
        if (!cfg.providers || Object.keys(cfg.providers).length === 0) {
            logger.error("SMS config: at least one provider is required");
            return null;
        }
        if (!cfg.default) {
            logger.error("SMS config: default provider must be specified");
            return null;
        }
        const driverNames = Object.keys(cfg.providers);
        if (!driverNames.includes(cfg.default)) {
            logger.error(
                `SMS config: default provider '${cfg.default}' not found in providers`,
            );
            return null;
        }

        // 드라이버별 필수 필드 검증
        for (const [name, p] of Object.entries(cfg.providers)) {
            if (!p.driver) {
                logger.error(
                    `SMS config: provider '${name}': driver is required`,
                );
                return null;
            }
            switch (p.driver) {
                case "aligo":
                    if (!p.api_key || !p.user_id) {
                        logger.error(
                            `SMS config: provider '${p.driver}' (aligo): api_key and user_id are required`,
                        );
                        return null;
                    }
                    break;
                case "solapi":
                    if (!p.api_key || !p.api_secret) {
                        logger.error(
                            `SMS config: provider '${p.driver}' (solapi): api_key and api_secret are required`,
                        );
                        return null;
                    }
                    break;
                case "ppurio":
                    if (!p.account || !p.api_key) {
                        logger.error(
                            `SMS config: provider '${p.driver}' (ppurio): account and api_key are required`,
                        );
                        return null;
                    }
                    break;
                case "nhn_cloud":
                    if (!p.app_key || !p.secret_key) {
                        logger.error(
                            `SMS config: provider '${p.driver}' (nhn_cloud): app_key and secret_key are required`,
                        );
                        return null;
                    }
                    break;
                case "aws_sns":
                    if (!p.region || !p.access_key || !p.secret_key) {
                        logger.error(
                            `SMS config: provider '${p.driver}' (aws_sns): region, access_key, and secret_key are required`,
                        );
                        return null;
                    }
                    break;
                default:
                    logger.error(
                        `SMS config: provider '${p.driver}': unknown driver`,
                    );
                    return null;
            }
        }

        // 인증번호 기본값 보정
        if (cfg.verification) {
            if (
                !cfg.verification.code_length ||
                cfg.verification.code_length <= 0
            )
                cfg.verification.code_length = 6;
            if (!cfg.verification.ttl_sec || cfg.verification.ttl_sec <= 0)
                cfg.verification.ttl_sec = 180;
            if (
                !cfg.verification.max_attempts ||
                cfg.verification.max_attempts <= 0
            )
                cfg.verification.max_attempts = 5;
            if (
                !cfg.verification.cooldown_sec ||
                cfg.verification.cooldown_sec <= 0
            )
                cfg.verification.cooldown_sec = 60;
        }

        return cfg;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            logger.info("SMS config not found, plugin skipped");
        } else {
            logger.error({ err }, "Failed to load SMS config");
        }
        return null;
    }
}
