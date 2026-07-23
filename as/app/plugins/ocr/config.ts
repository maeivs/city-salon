/**
 * OCR 설정 로더
 * 플러그인 디렉토리의 config.json 로드 + 환경변수 치환
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
    OcrConfig,
    OcrProviderConfig,
    OcrLlmFallbackConfig,
} from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG: Omit<OcrConfig, "providers"> = {
    enabled: false,
    default: "",
    workers: 2,
    queueSize: 50,
    maxFileSizeMB: 20,
    supportedFormats: [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/tiff",
        "application/pdf",
    ],
    cache: { enabled: false, ttlHours: 168 },
    quota: { dailyLimit: 0, monthlyLimit: 0, notify: [] },
    parsing: {
        templateDir: join(__dirname, "templates"),
        confidenceThreshold: 0.6,
    },
    llmFallback: {
        enabled: false,
        provider: "",
        confidenceThreshold: 0.85,
        promptDir: join(__dirname, "templates", "prompts"),
    },
};

/** 문자열 내 ${ENV} 패턴을 환경변수 값으로 치환한다 */
function expandEnv(val: string | undefined): string {
    if (!val) return "";
    return val.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
}

/** 프로바이더 설정의 모든 환경변수를 치환한다 */
function expandProviderEnv(p: OcrProviderConfig): OcrProviderConfig {
    return {
        ...p,
        apiKey: expandEnv(p.apiKey),
        apiUrl: expandEnv(p.apiUrl),
        apiEndpoint: expandEnv(p.apiEndpoint),
        secretKey: expandEnv(p.secretKey),
        credentialsPath: expandEnv(p.credentialsPath),
        accessKeyId: expandEnv(p.accessKeyId),
        secretAccessKey: expandEnv(p.secretAccessKey),
        region: expandEnv(p.region),
        endpoint: expandEnv(p.endpoint),
        dataPath: expandEnv(p.dataPath),
    };
}

/** OCR 설정 파일을 로드하고 환경변수를 치환하여 반환한다 */
export function loadOcrConfig(): OcrConfig | null {
    const filePath = join(__dirname, "config.json");
    if (!existsSync(filePath)) return null;

    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    const cfg: OcrConfig = { ...DEFAULT_CONFIG, ...raw };

    // JSON에서 snake_case → camelCase 변환
    cfg.maxFileSizeMB = raw.max_file_size_mb ?? cfg.maxFileSizeMB;
    cfg.queueSize = raw.queue_size ?? cfg.queueSize;
    cfg.supportedFormats = raw.supported_formats ?? cfg.supportedFormats;
    if (raw.cache) {
        cfg.cache = {
            enabled: raw.cache.enabled ?? false,
            ttlHours: raw.cache.ttl_hours ?? 168,
        };
    }
    if (raw.quota) {
        cfg.quota = {
            dailyLimit: raw.quota.daily_limit ?? 0,
            monthlyLimit: raw.quota.monthly_limit ?? 0,
            notify: raw.quota.notify ?? [],
        };
    }
    if (raw.parsing) {
        cfg.parsing = {
            templateDir:
                raw.parsing.template_dir ?? join(__dirname, "templates"),
            confidenceThreshold: raw.parsing.confidence_threshold ?? 0.6,
        };
    }
    if (raw.llm_fallback) {
        const lf = raw.llm_fallback as OcrLlmFallbackConfig &
            Record<string, unknown>;
        cfg.llmFallback = {
            enabled: (lf.enabled ?? false) as boolean,
            provider: (lf.provider ?? "") as string,
            confidenceThreshold: (lf.confidence_threshold ?? 0.85) as number,
            promptDir: (lf.prompt_dir ??
                join(__dirname, "templates", "prompts")) as string,
        };
    }

    if (!cfg.enabled) return null;

    // 환경변수 치환
    cfg.providers = (cfg.providers ?? []).map(expandProviderEnv);

    // 기본값 보정
    if (!cfg.default && cfg.providers.length === 1) {
        cfg.default = cfg.providers[0].driver;
    }

    if (cfg.providers.length === 0) {
        throw new Error("ocr config: at least one provider must be configured");
    }

    return cfg;
}
