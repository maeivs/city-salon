/** OCR 서비스 전체 설정 */
export interface OcrConfig {
    enabled: boolean;
    default: string;
    workers: number;
    queueSize: number;
    maxFileSizeMB: number;
    supportedFormats: string[];
    cache: OcrCacheConfig;
    quota: OcrQuotaConfig;
    parsing: OcrParsingConfig;
    llmFallback: OcrLlmFallbackConfig;
    providers: OcrProviderConfig[];
}

export interface OcrCacheConfig {
    enabled: boolean;
    ttlHours: number;
}

export interface OcrQuotaConfig {
    dailyLimit: number;
    monthlyLimit: number;
    notify: string[];
}

export interface OcrParsingConfig {
    templateDir: string;
    confidenceThreshold: number;
}

export interface OcrLlmFallbackConfig {
    enabled: boolean;
    provider: string;
    confidenceThreshold: number;
    promptDir: string;
}

/** 개별 OCR 프로바이더 연결 설정 */
export interface OcrProviderConfig {
    driver: string; // google, naver, aws_textract, azure, upstage, tesseract
    credentialsPath?: string;
    projectId?: string;
    secretKey?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    endpoint?: string;
    apiVersion?: string;
    dataPath?: string;
    defaultLang?: string;
    psm?: number;
    oem?: number;
    apiKey?: string;
    apiUrl?: string;
    apiEndpoint?: string;
    timeoutSec?: number;
    maxRetries?: number;
    retryDelayMs?: number;
}
