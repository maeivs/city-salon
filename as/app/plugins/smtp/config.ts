/**
 * SMTP 플러그인 설정 로더
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type { SmtpPluginConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

/** SMTP 플러그인 설정을 로드한다 */
export function loadSmtpConfig(): SmtpPluginConfig | null {
    try {
        let raw = readFileSync(CONFIG_PATH, "utf-8");

        // 환경변수 치환: ${VAR} → process.env.VAR
        raw = raw.replace(
            /\$\{([^}]+)\}/g,
            (_match, name) => process.env[name] ?? "",
        );

        const cfg: SmtpPluginConfig = JSON.parse(raw);

        if (cfg.enabled === false) {
            logger.info("SMTP plugin routes disabled in config");
            return null;
        }

        return cfg;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            // config.json 없으면 기본값으로 활성화
            return { enabled: true };
        }
        logger.error({ err }, "Failed to load SMTP config");
        return null;
    }
}
