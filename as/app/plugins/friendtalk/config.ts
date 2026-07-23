/**
 * 친구톡 설정 로더
 *
 * 플러그인 디렉토리의 config.json을 읽습니다.
 *
 * ⚠️  친구톡은 알림톡과 달리 카카오 사전 등록 템플릿 코드가 필요하지 않습니다.
 *     자유 형식(content) 으로 발송하며, 본문 패턴은
 *     templates/notification/friendtalk.json에서 별도 로드합니다.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type {
    FriendTalkConfig,
    FriendTalkTemplate,
} from "../alimtalk/types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

const TEMPLATE_PATH = join(__dirname, "templates", "friendtalk.json");

const DEFAULTS: FriendTalkConfig = {
    enabled: false,
    workers: 2,
    ad_prefix: "(광고)",
    default_ad: true,
    templates: [],
};

/** 친구톡 본문 템플릿 목록을 templates/notification/friendtalk.json에서 로드한다 */
function loadFriendTalkTemplates(): FriendTalkTemplate[] {
    if (!existsSync(TEMPLATE_PATH)) {
        return [];
    }
    try {
        const raw = readFileSync(TEMPLATE_PATH, "utf-8");
        return JSON.parse(raw) as FriendTalkTemplate[];
    } catch (err) {
        logger.error({ err }, "Failed to load friendtalk templates");
        return [];
    }
}

/** 친구톡 설정을 로드한다 */
export function loadFriendTalkConfig(): FriendTalkConfig {
    if (!existsSync(CONFIG_PATH)) {
        return DEFAULTS;
    }

    try {
        const raw = readFileSync(CONFIG_PATH, "utf-8");
        const cfg = JSON.parse(raw) as FriendTalkConfig;
        return {
            enabled: cfg.enabled ?? DEFAULTS.enabled,
            workers: cfg.workers > 0 ? cfg.workers : DEFAULTS.workers,
            ad_prefix: cfg.ad_prefix || DEFAULTS.ad_prefix,
            default_ad: cfg.default_ad ?? DEFAULTS.default_ad,
            templates: loadFriendTalkTemplates(),
        };
    } catch (err) {
        logger.error(
            { err },
            "Failed to load friendtalk config, using defaults",
        );
        return DEFAULTS;
    }
}
