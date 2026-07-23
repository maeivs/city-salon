import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type { NtsBusinessmanConfig } from "./types/index.ts";

const CONFIG_PATH = join(
    dirname(fileURLToPath(import.meta.url)),
    "config.json",
);

const DEFAULT_CONFIG: NtsBusinessmanConfig = {
    enabled: true,
    apiBaseUrl: "https://api.odcloud.kr/api/nts-businessman/v1",
    timeoutMs: 10000,
    returnType: "JSON",
};

/** 문자열 안의 환경변수 참조를 실제 값으로 치환한다. */
function expandEnv(value: string | undefined): string | undefined {
    if (!value) return value;
    return value.replace(
        /\$\{([^}]+)\}/g,
        (_match, name) => process.env[name] ?? "",
    );
}

/** 국세청 사업자등록정보 플러그인 설정을 로드한다. */
export function loadNtsBusinessmanConfig(): NtsBusinessmanConfig | null {
    if (!existsSync(CONFIG_PATH)) {
        return null;
    }

    try {
        const raw = JSON.parse(
            readFileSync(CONFIG_PATH, "utf-8"),
        ) as Partial<NtsBusinessmanConfig>;
        if (raw.enabled === false) {
            logger.info("NTS businessman plugin disabled in config");
            return null;
        }

        return {
            ...DEFAULT_CONFIG,
            ...raw,
            apiKey: expandEnv(raw.apiKey) ?? process.env.DATAGOKR_API_KEY ?? "",
            apiBaseUrl: expandEnv(raw.apiBaseUrl) ?? DEFAULT_CONFIG.apiBaseUrl,
            returnType: raw.returnType ?? DEFAULT_CONFIG.returnType,
            timeoutMs: raw.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
        };
    } catch (err) {
        logger.error({ err }, "Failed to load NTS businessman config");
        return null;
    }
}
