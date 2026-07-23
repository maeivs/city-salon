/**
 * QuotaManager — 일/월 단위 OCR 사용 쿼터 관리
 */

import type {
    OcrQuotaConfig,
    OcrEntityStore,
    OcrUsageRecord,
    QuotaStatus,
} from "./types/index.ts";
import { OcrError, ERR_QUOTA_EXCEEDED } from "./errors.ts";

export class QuotaManager {
    /** 쿼터 매니저를 설정과 엔티티 스토어로 초기화한다 */
    constructor(
        private readonly config: OcrQuotaConfig,
        private readonly entityStore: OcrEntityStore,
    ) {}

    /** 현재 사용량이 쿼터를 초과하는지 확인 (80% 경고, 100% 에러) */
    async check(): Promise<void> {
        if (this.config.dailyLimit <= 0 && this.config.monthlyLimit <= 0)
            return;

        const today = new Date().toISOString().slice(0, 10);
        const month = today.slice(0, 7);

        let dailyUsed = 0;
        let monthlyUsed = 0;

        try {
            dailyUsed = await this.entityStore.getDailyQuotaUsage(today);
        } catch {
            return; // 조회 실패 시 통과
        }
        try {
            monthlyUsed = await this.entityStore.getMonthlyQuotaUsage(month);
        } catch {
            return;
        }

        if (this.config.dailyLimit > 0) {
            const pct = (dailyUsed / this.config.dailyLimit) * 100;
            if (dailyUsed >= this.config.dailyLimit) {
                throw new OcrError(
                    `daily limit reached (${dailyUsed}/${this.config.dailyLimit})`,
                    ERR_QUOTA_EXCEEDED,
                );
            }
            if (pct >= 80) {
                console.log(
                    `[WARN] OCR daily quota at ${pct.toFixed(0)}% (${dailyUsed}/${this.config.dailyLimit})`,
                );
            }
        }

        if (this.config.monthlyLimit > 0) {
            const pct = (monthlyUsed / this.config.monthlyLimit) * 100;
            if (monthlyUsed >= this.config.monthlyLimit) {
                throw new OcrError(
                    `monthly limit reached (${monthlyUsed}/${this.config.monthlyLimit})`,
                    ERR_QUOTA_EXCEEDED,
                );
            }
            if (pct >= 80) {
                console.log(
                    `[WARN] OCR monthly quota at ${pct.toFixed(0)}% (${monthlyUsed}/${this.config.monthlyLimit})`,
                );
            }
        }
    }

    /** 사용량 카운터 1 증가 */
    async increment(
        provider: string,
        docType: string,
        pageCount: number,
    ): Promise<void> {
        const today = new Date().toISOString().slice(0, 10);
        await this.entityStore.incrementUsage({
            usageDate: today,
            provider,
            docType,
            requestCount: 1,
            pageCount,
        });
    }

    /** 현재 쿼터 상태 조회 */
    async getStatus(): Promise<QuotaStatus> {
        const today = new Date().toISOString().slice(0, 10);
        const month = today.slice(0, 7);

        const dailyUsed = await this.entityStore
            .getDailyQuotaUsage(today)
            .catch(() => 0);
        const monthlyUsed = await this.entityStore
            .getMonthlyQuotaUsage(month)
            .catch(() => 0);

        return {
            dailyUsed,
            dailyLimit: this.config.dailyLimit,
            monthlyUsed,
            monthlyLimit: this.config.monthlyLimit,
        };
    }
}
