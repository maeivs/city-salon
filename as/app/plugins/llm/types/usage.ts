export interface LlmUsageRecord {
    providerName: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    callerService?: string;
    requestTimeMs: number;
    status: "success" | "error" | "timeout";
    errorMessage?: string;
    userSeq?: number;
    estimatedCost?: number;
    requestedAt: string;
}

export interface UsageFilter {
    providerName?: string;
    callerService?: string;
    dateFrom?: string;
    dateTo?: string;
}

export interface UsageSummary {
    totalRequests: number;
    totalTokens: number;
    estimatedCostUsd: number;
}
