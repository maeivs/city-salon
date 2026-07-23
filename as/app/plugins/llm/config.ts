/**
 * LLM 플러그인 — 설정 로더
 *
 * 플러그인 디렉토리의 config.json 을 읽고 환경변수 치환 + 검증
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "@system/api";
import type { LlmConfig } from "./types/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");

/**
 * 환경변수 치환: "${VAR_NAME}" → process.env.VAR_NAME
 */
function substituteEnvVars(obj: unknown): unknown {
    if (typeof obj === "string") {
        return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] ?? "");
    }
    if (Array.isArray(obj)) {
        return obj.map(substituteEnvVars);
    }
    if (obj !== null && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(
            obj as Record<string, unknown>,
        )) {
            result[key] = substituteEnvVars(val);
        }
        return result;
    }
    return obj;
}

/**
 * LLM 설정 파일을 로드하고 환경변수를 치환합니다.
 * 설정 파일이 없거나 enabled=false 이면 null 반환
 */
export function loadLlmConfig(): LlmConfig | null {
    if (!existsSync(CONFIG_PATH)) {
        logger.info(
            "LLM config not found at %s — LLM plugin disabled",
            CONFIG_PATH,
        );
        return null;
    }

    try {
        const raw = readFileSync(CONFIG_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        const config = substituteEnvVars(parsed) as LlmConfig;

        if (config.enabled === false) {
            logger.info("LLM plugin disabled in config");
            return null;
        }

        // 기본값 보정
        if (!config.default) {
            const firstProvider = Object.keys(config.providers ?? {})[0];
            if (firstProvider) config.default = firstProvider;
        }

        if (!config.providers || Object.keys(config.providers).length === 0) {
            logger.warn("LLM config has no providers — LLM plugin disabled");
            return null;
        }

        // cache 기본값
        if (config.cache) {
            config.cache.ttl_seconds ??= 3600;
            config.cache.max_entries ??= 10000;
        }

        // rag 기본값
        if (config.rag) {
            config.rag.default_chunk_size ??= 500;
            config.rag.default_chunk_overlap ??= 50;
            config.rag.default_top_k ??= 5;
            config.rag.default_min_score ??= 0.7;
        }

        logger.info(
            "LLM config loaded: %d providers, default=%s, cache=%s, rag=%s",
            Object.keys(config.providers).length,
            config.default,
            config.cache?.enabled ? "on" : "off",
            config.rag?.enabled ? "on" : "off",
        );

        return config;
    } catch (err) {
        logger.error({ err }, "Failed to load LLM config");
        return null;
    }
}
