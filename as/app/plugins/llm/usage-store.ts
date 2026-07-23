/**
 * LLM 사용량 추적 — Entity Server 어댑터
 *
 * llm_usage 엔티티를 통한 API 호출 사용량 기록 및 집계
 */

import { entityServer } from "@system/api";
import { logger } from "@system/api";
import type {
    UsageQuerier,
    LlmUsageRecord,
    UsageSummary,
    UsageFilter,
} from "./types/index.ts";

export class UsageEntityAdapter implements UsageQuerier {
    /** 사용량 기록을 저장한다 */
    async recordUsage(r: LlmUsageRecord): Promise<void> {
        const data: Record<string, unknown> = {
            provider_name: r.providerName,
            model: r.model,
            caller_service: r.callerService ?? "",
            prompt_tokens: r.promptTokens,
            completion_tokens: r.completionTokens,
            total_tokens: r.totalTokens,
            request_time_ms: r.requestTimeMs,
            status: r.status,
            estimated_cost: r.estimatedCost ?? 0,
        };
        if (r.userSeq) data.user_seq = r.userSeq;
        if (r.errorMessage) data.error_message = r.errorMessage;

        try {
            await entityServer.submit("llm_usage", data);
        } catch (err) {
            logger.error({ err }, "Failed to record LLM usage");
        }
    }

    /** 사용량 요약을 조회한다 */
    async getUsageSummary(filter: UsageFilter): Promise<UsageSummary> {
        const opts: Record<string, unknown> = { limit: 10000 };
        if (filter.providerName) opts.provider_name = filter.providerName;
        if (filter.callerService) opts.caller_service = filter.callerService;
        if (filter.dateFrom) opts.created_time_gte = filter.dateFrom;
        if (filter.dateTo) opts.created_time_lte = filter.dateTo;

        const resp = await entityServer.list("llm_usage", opts);
        const rows = (resp.data as any)?.items ?? [];

        let totalTokens = 0;
        let estimatedCostUsd = 0;
        for (const row of rows) {
            totalTokens += Number(row.total_tokens ?? 0);
            estimatedCostUsd += Number(row.estimated_cost ?? 0);
        }

        return {
            totalRequests: rows.length,
            totalTokens,
            estimatedCostUsd,
        };
    }
}
