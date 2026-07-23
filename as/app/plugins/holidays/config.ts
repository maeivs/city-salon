/**
 * 공휴일 동기화 설정 로더
 *
 * 플러그인 디렉토리의 config.json을 읽어 HolidaysConfig를 반환합니다.
 * 파일이 없거나 enabled: false이면 null을 반환합니다.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type { HolidaysConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

/** 공휴일 설정을 로드한다 */
export function loadHolidaysConfig(): HolidaysConfig | null {
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

        const cfg = JSON.parse(raw) as HolidaysConfig;

        if (cfg.enabled === false) {
            logger.info("Holidays plugin disabled in config");
            return null;
        }

        return cfg;
    } catch (err) {
        logger.error({ err }, "Failed to load holidays config");
        return null;
    }
}
