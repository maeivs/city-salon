/**
 * PG 결제 설정 로더
 *
 * 플러그인 디렉토리의 config.json을 읽고 환경변수 치환을 수행합니다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type { PgConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

/** PG 결제 설정을 로드한다 */
export function loadPgConfig(): PgConfig | null {
    try {
        let raw = readFileSync(CONFIG_PATH, "utf-8");

        // 환경변수 치환: ${VAR} → process.env.VAR
        raw = raw.replace(
            /\$\{([^}]+)\}/g,
            (_match, name) => process.env[name] ?? "",
        );

        const cfg: PgConfig = JSON.parse(raw);

        if (cfg.enabled === false) {
            logger.info("PG plugin disabled in config");
            return null;
        }

        if (!cfg.providers || Object.keys(cfg.providers).length === 0) {
            logger.warn("PG: no providers configured, plugin disabled");
            return null;
        }

        // 기본값 보정
        if (!cfg.workers || cfg.workers <= 0) cfg.workers = 2;
        if (!cfg.order_id_prefix) cfg.order_id_prefix = "ORD";
        if (cfg.amount_limit) {
            if (!cfg.amount_limit.min || cfg.amount_limit.min <= 0)
                cfg.amount_limit.min = 100;
            if (!cfg.amount_limit.max || cfg.amount_limit.max <= 0)
                cfg.amount_limit.max = 10_000_000;
        }

        return cfg;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            logger.info("PG config not found, plugin skipped");
        } else {
            logger.error({ err }, "Failed to load pg config");
        }
        return null;
    }
}
