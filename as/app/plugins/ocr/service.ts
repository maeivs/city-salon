/**
 * OcrService — OCR 기능의 핵심 서비스
 * 인식 → 캐시 → 쿼터 → 파싱 파이프라인 → 결과 저장 조율
 */

import type {
    OcrConfig,
    OcrDriver,
    OcrResult,
    OcrResultRecord,
    OcrResultFilter,
    RecognizeOptions,
    RawOcrResult,
    OcrEntityStore,
    QuotaStatus,
} from "./types/index.ts";
import {
    createOcrDriver,
    retryRecognize,
    validateFileSize,
} from "./providers/index.ts";
import { CacheManager, computeFileHash } from "./cache.ts";
import { QuotaManager } from "./quota.ts";
import { DispatchWorker } from "./dispatch.ts";
import { TemplateLoader } from "./template-loader.ts";
import { TemplateMatcher } from "./template-matcher.ts";
import { LlmParser, type LlmServiceLike } from "./llm-parser.ts";
import { ParsingPipeline } from "./parsing-pipeline.ts";
import {
    convertPDFToImages,
    isPDF,
    type Pdf2PngClient,
} from "./pdf-converter.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { OcrError, ERR_RESULT_NOT_FOUND } from "./errors.ts";

export class OcrService {
    private readonly config: OcrConfig;
    private defaultDriver: OcrDriver | null = null;
    private readonly drivers = new Map<string, OcrDriver>();
    private readonly pipeline: ParsingPipeline;
    private readonly cacheMan: CacheManager | null;
    private readonly quotaMan: QuotaManager | null;
    private readonly dispatcher: DispatchWorker;
    private readonly entityStore: OcrEntityStore | null;
    private readonly pdfClient: Pdf2PngClient | null;

    /** OcrService를 설정과 클라이언트로 초기화한다 */
    constructor(
        cfg: OcrConfig,
        entityStore: OcrEntityStore | null,
        llmSvc: LlmServiceLike | null,
        pdfClient?: Pdf2PngClient | null,
    ) {
        this.config = cfg;
        this.entityStore = entityStore;
        this.pdfClient = pdfClient ?? null;

        // 드라이버 생성
        for (const provCfg of cfg.providers) {
            try {
                const driver = createOcrDriver(provCfg);
                this.drivers.set(driver.name(), driver);
                if (provCfg.driver === cfg.default || !this.defaultDriver) {
                    this.defaultDriver = driver;
                }
            } catch (err) {
                console.log(
                    `[WARN] OCR driver ${provCfg.driver} init failed: ${err}`,
                );
            }
        }

        // 파싱 파이프라인
        const templateDir =
            cfg.parsing.templateDir || join(__dirname, "templates");
        const promptDir =
            cfg.llmFallback.promptDir ||
            join(__dirname, "templates", "prompts");
        const loader = new TemplateLoader(templateDir);
        const matcher = new TemplateMatcher(loader);
        let llmParser: LlmParser | null = null;
        if (llmSvc && cfg.llmFallback.enabled && cfg.llmFallback.provider) {
            llmParser = new LlmParser(
                llmSvc,
                cfg.llmFallback.provider,
                promptDir,
                loader,
            );
        }
        this.pipeline = new ParsingPipeline(matcher, llmParser, cfg.parsing);

        // 캐시
        this.cacheMan = cfg.cache.enabled ? new CacheManager(cfg.cache) : null;

        // 쿼터
        this.quotaMan = entityStore
            ? new QuotaManager(cfg.quota, entityStore)
            : null;

        // 비동기 디스패처
        this.dispatcher = new DispatchWorker(cfg.queueSize, cfg.workers);
        this.dispatcher.init(
            (data, opts) => this.recognizeInternal(data, opts),
            entityStore,
        );
    }

    /** OCR 디스패치 워커를 시작한다 */
    start(): void {
        this.dispatcher.start();
    }

    /** OCR 워커와 드라이버를 종료한다 */
    stop(): void {
        for (const d of this.drivers.values()) {
            d.close().catch((e) =>
                console.log(`[WARN] OCR driver close error: ${e}`),
            );
        }
    }

    /** 동기 OCR 인식 */
    async recognize(data: Buffer, opts: RecognizeOptions): Promise<OcrResult> {
        validateFileSize(data, this.config.maxFileSizeMB);

        if (this.quotaMan) await this.quotaMan.check();

        if (isPDF(data)) return this.recognizePDF(data, opts);
        return this.recognizeInternal(data, opts);
    }

    /** 비동기 OCR 인식 (작업 ID 반환) */
    async recognizeAsync(
        data: Buffer,
        opts: RecognizeOptions,
    ): Promise<string> {
        validateFileSize(data, this.config.maxFileSizeMB);
        if (this.quotaMan) await this.quotaMan.check();

        const jobId = this.dispatcher.submit(data, opts);

        if (this.entityStore) {
            const fileHash = computeFileHash(data);
            try {
                await this.entityStore.createResult({
                    ocrId: jobId,
                    fileHash,
                    provider: this.resolveDriverName(opts),
                    docType: opts.docType ?? "",
                    state: "pending",
                });
            } catch (err) {
                console.log(
                    `[WARN] OCR async: create result record failed: ${err}`,
                );
            }
        }
        return jobId;
    }

    /** OCR 결과를 ID로 조회한다 */
    async getResult(id: string): Promise<OcrResultRecord | null> {
        if (!this.entityStore)
            throw new OcrError("OCR result not found", ERR_RESULT_NOT_FOUND);
        return this.entityStore.getResult(id);
    }

    /** OCR 결과 목록을 필터 조건으로 조회한다 */
    async listResults(
        filter: OcrResultFilter,
    ): Promise<{ items: OcrResultRecord[]; total: number }> {
        if (!this.entityStore) return { items: [], total: 0 };
        return this.entityStore.listResults(filter);
    }

    /** OCR 결과를 삭제한다 */
    async deleteResult(id: string): Promise<void> {
        if (!this.entityStore)
            throw new OcrError("OCR result not found", ERR_RESULT_NOT_FOUND);
        await this.entityStore.deleteResult(id);
    }

    /** 현재 쿼터 상태를 조회한다 */
    async getQuotaStatus(): Promise<QuotaStatus> {
        if (!this.quotaMan) {
            return {
                dailyUsed: 0,
                dailyLimit: this.config.quota.dailyLimit,
                monthlyUsed: 0,
                monthlyLimit: this.config.quota.monthlyLimit,
            };
        }
        return this.quotaMan.getStatus();
    }

    // ─── 내부 메서드 ───

    /** PDF 파일을 페이지별로 변환하여 OCR을 수행한다 */
    private async recognizePDF(
        data: Buffer,
        opts: RecognizeOptions,
    ): Promise<OcrResult> {
        const pages = await convertPDFToImages(
            data,
            opts.pageRange,
            undefined,
            this.pdfClient ?? undefined,
        );
        const combined: RawOcrResult = {
            provider: this.resolveDriverName(opts),
            processedAt: new Date().toISOString(),
            fullText: "",
            pages: [],
            confidence: 0,
            processingMs: 0,
        };

        for (let i = 0; i < pages.length; i++) {
            const pageOpts = {
                ...opts,
                mimeType: "image/png",
                pageRange: undefined,
            };
            try {
                const r = await this.recognizeInternal(pages[i], pageOpts);
                if (r.raw) {
                    for (const p of r.raw.pages) {
                        p.pageNum = i + 1;
                        combined.pages.push(p);
                    }
                    combined.fullText += r.raw.fullText;
                    combined.processingMs += r.raw.processingMs;
                }
            } catch (err) {
                console.log(`[WARN] OCR PDF page ${i + 1} error: ${err}`);
            }
        }

        if (combined.pages.length === 0) {
            throw new Error("ocr PDF: no pages processed");
        }

        // 평균 confidence 계산
        let totalConf = 0,
            blockCount = 0;
        for (const p of combined.pages) {
            for (const b of p.blocks) {
                totalConf += b.confidence;
                blockCount++;
            }
        }
        combined.confidence = blockCount > 0 ? totalConf / blockCount : 0;

        const parsed = await this.pipeline.parse(combined, opts.docType ?? "");
        this.postProcess(data, opts, parsed);
        return parsed;
    }

    /** 단일 이미지에 대해 OCR 인식을 수행한다 */
    private async recognizeInternal(
        data: Buffer,
        opts: RecognizeOptions,
    ): Promise<OcrResult> {
        const fileHash = computeFileHash(data);
        const driverName = this.resolveDriverName(opts);

        // 캐시 히트 확인
        if (this.cacheMan) {
            const key = this.cacheMan.cacheKey(
                fileHash,
                driverName,
                opts.docType ?? "",
            );
            const cached = this.cacheMan.get(key);
            if (cached) return cached;
        }

        // 드라이버 선택
        const driver = this.drivers.get(driverName) ?? this.defaultDriver;
        if (!driver) throw new Error("ocr: no driver available");

        const raw = await retryRecognize(driver, data, opts, {
            maxRetries: 3,
            retryDelayMs: 1000,
        });

        // 파싱 파이프라인
        const result = await this.pipeline.parse(raw, opts.docType ?? "");

        // 캐시 저장
        if (this.cacheMan) {
            const key = this.cacheMan.cacheKey(
                fileHash,
                driverName,
                opts.docType ?? "",
            );
            this.cacheMan.set(key, result);
        }

        this.postProcess(data, opts, result);
        return result;
    }

    /** 인식 후 쿼터 사용량을 기록한다 */
    private postProcess(
        data: Buffer,
        opts: RecognizeOptions,
        result: OcrResult,
    ): void {
        const driverName = this.resolveDriverName(opts);
        let pageCount = 1;
        if (result.raw) {
            pageCount = result.raw.pages.length || 1;
        }
        if (this.quotaMan) {
            this.quotaMan
                .increment(driverName, opts.docType ?? "", pageCount)
                .catch(() => {});
        }
    }

    /** 옵션에서 사용할 드라이버 이름을 결정한다 */
    private resolveDriverName(opts: RecognizeOptions): string {
        if (this.defaultDriver) return this.defaultDriver.name();
        if (this.config.default) return this.config.default;
        return "unknown";
    }
}
