/**
 * CacheManager — SHA-256 기반 OCR 결과 캐싱
 */

import { createHash } from "node:crypto";
import type { OcrResult, OcrCacheConfig } from "./types/index.ts";

export class CacheManager {
    private readonly cache = new Map<
        string,
        { data: OcrResult; expireAt: number }
    >();
    private readonly ttlMs: number;

    /** OCR 캐시를 TTL 설정으로 초기화한다 */
    constructor(cfg: OcrCacheConfig) {
        this.ttlMs = (cfg.ttlHours > 0 ? cfg.ttlHours : 168) * 3600 * 1000;
    }

    /** 캐시 키 생성: "ocr:{sha256(provider:docType:fileHash)}" */
    cacheKey(fileHash: string, provider: string, docType: string): string {
        const raw = `${provider}:${docType}:${fileHash}`;
        const h = createHash("sha256").update(raw).digest("hex");
        return `ocr:${h}`;
    }

    /** 캐시에서 OcrResult 조회 */
    get(key: string): OcrResult | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expireAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }

    /** OcrResult를 캐시에 저장 */
    set(key: string, result: OcrResult): void {
        this.cache.set(key, {
            data: result,
            expireAt: Date.now() + this.ttlMs,
        });
    }
}

/** 파일 데이터의 SHA-256 해시 */
export function computeFileHash(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
}
