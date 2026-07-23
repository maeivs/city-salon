import type { OcrResult } from "./driver.ts";

export interface OcrResultRecord {
    ocrId: string;
    fileSeq?: number;
    fileHash: string;
    provider: string;
    docType: string;
    state: string; // pending/processing/completed/failed
    refTable?: string;
    refSeq?: number;
    text?: string;
    pages?: unknown;
    parsed?: unknown;
    confidence?: number;
    processingMs?: number;
    providerRaw?: unknown;
    errorMessage?: string;
    parseMethod?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface OcrUsageRecord {
    usageDate: string;
    provider: string;
    docType: string;
    requestCount: number;
    pageCount: number;
    successCount?: number;
    failCount?: number;
    totalMs?: number;
    avgConfidence?: number;
}

export interface OcrResultFilter {
    provider?: string;
    docType?: string;
    state?: string;
    fileSeq?: number;
    refTable?: string;
    refSeq?: number;
    offset?: number;
    limit?: number;
}

export interface OcrEntityStore {
    createResult(record: OcrResultRecord): Promise<string>;
    updateResultState(
        id: string,
        state: string,
        result: OcrResult | null,
        errMsg: string,
    ): Promise<void>;
    getResult(id: string): Promise<OcrResultRecord | null>;
    listResults(
        filter: OcrResultFilter,
    ): Promise<{ items: OcrResultRecord[]; total: number }>;
    deleteResult(id: string): Promise<void>;
    incrementUsage(record: OcrUsageRecord): Promise<void>;
    getDailyQuotaUsage(date: string): Promise<number>;
    getMonthlyQuotaUsage(month: string): Promise<number>;
}

export interface QuotaStatus {
    dailyUsed: number;
    dailyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
}
