/**
 * Push 알림 설정 로더
 *
 * 플러그인 디렉토리의 config.json을 읽고 환경변수 치환을 수행합니다.
 * SMS config 로더 패턴에서 포팅
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type { PushConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

/** Push 설정을 로드한다 */
export function loadPushConfig(): PushConfig | null {
    if (!existsSync(CONFIG_PATH)) {
        return null;
    }

    try {
        let raw = readFileSync(CONFIG_PATH, "utf-8");

        // 환경변수 치환: ${VAR} → process.env.VAR
        raw = raw.replace(
            /\$\{([^}]+)\}/g,
            (_match, name) => process.env[name] ?? "",
        );

        const cfg: PushConfig = JSON.parse(raw);

        if (cfg.enabled === false) {
            logger.info("Push plugin disabled in config");
            return null;
        }

        // 기본값 보정
        if (!cfg.workers || cfg.workers <= 0) cfg.workers = 2;
        if (!cfg.queue_size || cfg.queue_size <= 0) cfg.queue_size = 50;
        if (!cfg.dispatch_interval_sec || cfg.dispatch_interval_sec <= 0)
            cfg.dispatch_interval_sec = 5;
        if (!cfg.max_retries || cfg.max_retries <= 0) cfg.max_retries = 3;

        // 프로바이더가 1개이고 default 미설정 시 자동 추론
        if (
            !cfg.default &&
            cfg.providers &&
            Object.keys(cfg.providers).length === 1
        ) {
            cfg.default = Object.keys(cfg.providers)[0]!;
        }

        // 검증
        if (!cfg.providers || Object.keys(cfg.providers).length === 0) {
            logger.error("Push config: at least one provider is required");
            return null;
        }
        if (!cfg.default) {
            logger.error("Push config: default provider must be specified");
            return null;
        }
        if (!(cfg.default in cfg.providers)) {
            logger.error(
                `Push config: default provider '${cfg.default}' not found in providers`,
            );
            return null;
        }

        // 드라이버별 필수 필드 검증
        for (const [name, p] of Object.entries(cfg.providers)) {
            if (!p.driver) {
                logger.error(
                    `Push config: provider '${name}': driver is required`,
                );
                return null;
            }
            if (p.driver === "fcm") {
                if (!p.project_id) {
                    logger.error(
                        `Push config: provider '${name}' (fcm): project_id is required`,
                    );
                    return null;
                }
                if (!p.key_file) {
                    logger.error(
                        `Push config: provider '${name}' (fcm): key_file is required`,
                    );
                    return null;
                }
            } else if (p.driver === "apns") {
                if (!p.key_id || !p.team_id || !p.bundle_id) {
                    logger.error(
                        `Push config: provider '${name}' (apns): key_id, team_id, bundle_id are required`,
                    );
                    return null;
                }
                if (!p.key_file) {
                    logger.error(
                        `Push config: provider '${name}' (apns): key_file is required`,
                    );
                    return null;
                }
            } else {
                const unknownDriver = (p as { driver: string }).driver;
                logger.error(
                    `Push config: provider '${name}': unsupported driver '${unknownDriver}'`,
                );
                return null;
            }
        }

        return cfg;
    } catch (err) {
        logger.error({ err }, "Push config: failed to load config.json");
        return null;
    }
}
