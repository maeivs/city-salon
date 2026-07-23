/**
 * LLM 응답 캐시 — 키 생성 + 인메모리 TTL 스토어 + 통계
 */

import { createHash } from "crypto";
import type { Message } from "./types/index.ts";

// ─── Cache Key ───────────────────────────────────────────────────────────────

export interface CacheKeyInput {
    provider: string;
    model: string;
    messages: Message[];
    system?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
}

/**
 * SHA-256 기반 캐시 키를 생성합니다.
 * 동일한 요청은 항상 동일한 키를 반환합니다.
 */
export function generateCacheKey(input: CacheKeyInput): string {
    const data = JSON.stringify({
        p: input.provider,
        m: input.model,
        ms: input.messages,
        s: input.system,
        t: input.temperature,
        mt: input.maxTokens,
        j: input.jsonMode,
    });
    const hash = createHash("sha256").update(data).digest("hex");
    return `llm:resp:${hash}`;
}

// ─── Cache Stats ─────────────────────────────────────────────────────────────

export class CacheStats {
    hits = 0;
    misses = 0;

    /** 캐시 히트를 기록한다 */
    recordHit(): void {
        this.hits++;
    }

    /** 캐시 미스를 기록한다 */
    recordMiss(): void {
        this.misses++;
    }

    /** 캐시 히트율을 반환한다 */
    hitRate(): number {
        const total = this.hits + this.misses;
        return total === 0 ? 0 : this.hits / total;
    }

    /** 통계를 초기화한다 */
    reset(): void {
        this.hits = 0;
        this.misses = 0;
    }
}

// ─── In‑Memory TTL Cache Store ───────────────────────────────────────────────

interface CacheEntry {
    value: string;
    expiresAt: number;
}

/**
 * 간단한 인메모리 TTL 캐시.
 * maxEntries를 초과하면 가장 오래된 항목을 제거합니다.
 */
export class MemoryCacheStore {
    private readonly store = new Map<string, CacheEntry>();
    private readonly maxEntries: number;

    /** MemoryCacheStore 인스턴스를 초기화한다 */
    constructor(maxEntries = 10000) {
        this.maxEntries = maxEntries;
    }

    /** 키로 캐시 항목을 조회한다 */
    get(key: string): { value: string; found: boolean } {
        const entry = this.store.get(key);
        if (!entry) return { value: "", found: false };
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return { value: "", found: false };
        }
        return { value: entry.value, found: true };
    }

    /** 캐시 항목을 저장한다 */
    set(key: string, value: string, ttlMs: number): void {
        // 용량 초과 시 정리
        if (this.store.size >= this.maxEntries) {
            this.evict();
        }
        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
        });
    }

    /** 모든 캐시 항목을 삭제한다 */
    flush(): void {
        this.store.clear();
    }

    get size(): number {
        return this.store.size;
    }

    /** 만료된 항목 + 가장 오래된 20% 제거 */
    private evict(): void {
        const now = Date.now();
        for (const [key, entry] of this.store) {
            if (now > entry.expiresAt) {
                this.store.delete(key);
            }
        }
        // 여전히 초과하면 가장 오래된 항목 제거
        const excess = this.store.size - Math.floor(this.maxEntries * 0.8);
        if (excess > 0) {
            let count = 0;
            for (const key of this.store.keys()) {
                if (count >= excess) break;
                this.store.delete(key);
                count++;
            }
        }
    }
}
