/**
 * 알림톡 설정 로더
 *
 * 플러그인 디렉토리의 config.json을 읽고 환경변수 치환을 수행합니다.
 * 친구톡 설정은 friendtalk/config.json에서 별도 로드합니다.
 * 알림톡 템플릿은 templates/notification/alimtalk.json에서 별도 로드합니다.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type { AlimtalkConfig, AlimtalkTemplateMapping } from "./types/index.ts";
import { loadFriendTalkConfig } from "../friendtalk/config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

const TEMPLATE_PATH = join(__dirname, "templates", "alimtalk.json");

/** 알림톡 템플릿 목록을 templates/notification/alimtalk.json에서 로드한다 */
function loadAlimtalkTemplates(): AlimtalkTemplateMapping[] {
    if (!existsSync(TEMPLATE_PATH)) {
        return [];
    }
    try {
        const raw = readFileSync(TEMPLATE_PATH, "utf-8");
        return JSON.parse(raw) as AlimtalkTemplateMapping[];
    } catch (err) {
        logger.error({ err }, "Failed to load alimtalk templates");
        return [];
    }
}

/** 알림톡 설정을 로드한다 */
export function loadAlimtalkConfig(): AlimtalkConfig | null {
    try {
        let raw = readFileSync(CONFIG_PATH, "utf-8");

        // 환경변수 치환: ${VAR} → process.env.VAR
        raw = raw.replace(
            /\$\{([^}]+)\}/g,
            (_match, name) => process.env[name] ?? "",
        );

        const cfg: AlimtalkConfig = JSON.parse(raw);

        if (cfg.enabled === false) {
            logger.info("Alimtalk plugin disabled in config");
            return null;
        }

        // 기본값 보정
        if (!cfg.workers || cfg.workers <= 0) cfg.workers = 2;
        if (!cfg.dispatch_interval_sec || cfg.dispatch_interval_sec <= 0)
            cfg.dispatch_interval_sec = 5;
        if (!cfg.queue_size || cfg.queue_size <= 0) cfg.queue_size = 200;
        if (!cfg.max_retries || cfg.max_retries <= 0) cfg.max_retries = 3;

        // 친구톡 설정은 friendtalk.json에서 별도 로드
        cfg.friendtalk = loadFriendTalkConfig();

        // 알림톡 템플릿은 templates/notification/alimtalk.json에서 별도 로드
        cfg.templates = loadAlimtalkTemplates();

        return cfg;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            logger.info("Alimtalk config not found, plugin skipped");
        } else {
            logger.error({ err }, "Failed to load alimtalk config");
        }
        return null;
    }
}
