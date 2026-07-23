/**
 * example 플러그인 설정 로더
 *
 * 플러그인 디렉토리의 config.json을 읽어 ExampleConfig를 반환합니다.
 * 파일이 없거나 enabled: false이면 null을 반환합니다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type { ExampleConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

/** example 설정을 로드한다 */
export function loadExampleConfig(): ExampleConfig | null {
    try {
        let raw = readFileSync(CONFIG_PATH, "utf-8");

        // 환경변수 치환: ${VAR} → process.env.VAR
        raw = raw.replace(
            /\$\{([^}]+)\}/g,
            (_match, name) => process.env[name] ?? "",
        );

        const cfg: ExampleConfig = JSON.parse(raw);

        if (cfg.enabled === false) {
            logger.info("Example plugin disabled in config");
            return null;
        }

        // TODO: 기본값 보정이 필요하면 여기에 추가합니다.

        return cfg;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            logger.info("Example config not found, plugin skipped");
        } else {
            logger.error({ err }, "Failed to load example config");
        }
        return null;
    }
}
