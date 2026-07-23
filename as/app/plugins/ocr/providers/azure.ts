/**
 * Azure Document Intelligence OCR 드라이버
 * 비동기 폴링 방식
 */

import type {
    OcrDriver,
    OcrProviderConfig,
    RawOcrResult,
    RecognizeOptions,
    TextBlock,
    RawOcrPage,
} from "../types/index.ts";

export class AzureDriver implements OcrDriver {
    private readonly endpoint: string;
    private readonly apiKey: string;
    private readonly apiVersion: string;
    private readonly timeout: number;

    /** Azure Document Intelligence 드라이버를 설정으로 초기화한다 */
    constructor(cfg: OcrProviderConfig) {
        this.endpoint = (cfg.endpoint ?? "").replace(/\/$/, "");
        this.apiKey = cfg.apiKey ?? "";
        this.apiVersion = cfg.apiVersion ?? "2023-07-31";
        this.timeout = (cfg.timeoutSec ?? 60) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name() {
        return "azure";
    }
    /** 지원하는 파일 형식 목록을 반환한다 */
    supportedFormats() {
        return [
            "image/jpeg",
            "image/png",
            "image/tiff",
            "image/bmp",
            "application/pdf",
        ];
    }
    /** 드라이버 리소스를 해제한다 */
    async close() {}

    /** 이미지 데이터를 Azure Document Intelligence API로 인식한다 */
    async recognize(
        data: Buffer,
        opts: RecognizeOptions,
    ): Promise<RawOcrResult> {
        const start = Date.now();
        const url = `${this.endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${this.apiVersion}`;

        // 1단계: 분석 요청
        const submitResp = await fetch(url, {
            method: "POST",
            headers: {
                "Ocp-Apim-Subscription-Key": this.apiKey,
                "Content-Type": opts.mimeType || "application/octet-stream",
            },
            body: data,
            signal: AbortSignal.timeout(this.timeout),
        });

        if (!submitResp.ok && submitResp.status !== 202) {
            const text = await submitResp.text();
            throw new Error(
                `Azure DI submit error ${submitResp.status}: ${text}`,
            );
        }

        const operationLocation =
            submitResp.headers.get("Operation-Location") ??
            submitResp.headers.get("operation-location") ??
            "";

        if (!operationLocation) {
            throw new Error("Azure DI: no Operation-Location header");
        }

        // 2단계: 폴링
        const pollTimeout = Date.now() + this.timeout;
        let resultJson: any;

        while (Date.now() < pollTimeout) {
            await new Promise((r) => setTimeout(r, 1500));

            const pollResp = await fetch(operationLocation, {
                headers: { "Ocp-Apim-Subscription-Key": this.apiKey },
                signal: AbortSignal.timeout(30_000),
            });

            if (!pollResp.ok) {
                throw new Error(`Azure DI poll error ${pollResp.status}`);
            }

            const pollData = (await pollResp.json()) as any;
            if (pollData.status === "succeeded") {
                resultJson = pollData.analyzeResult;
                break;
            }
            if (pollData.status === "failed") {
                throw new Error(
                    `Azure DI analysis failed: ${JSON.stringify(pollData.error)}`,
                );
            }
        }

        if (!resultJson) {
            throw new Error("Azure DI: polling timeout");
        }

        return this.buildResult(resultJson, start);
    }

    /** Azure 분석 결과를 RawOcrResult로 변환한다 */
    private buildResult(analyzeResult: any, startMs: number): RawOcrResult {
        const DPI = 72; // Azure inch → pixel 변환에 사용하는 기본 DPI
        const pages: RawOcrPage[] = [];
        let fullText = analyzeResult.content ?? "";

        for (const ap of analyzeResult.pages ?? []) {
            const blocks: TextBlock[] = [];
            const unit: string = ap.unit ?? "pixel";
            const scale = unit === "inch" ? DPI : 1;

            for (const word of ap.words ?? []) {
                const polygon = word.polygon ?? [];
                const xs = polygon
                    .filter((_: number, i: number) => i % 2 === 0)
                    .map((v: number) => v * scale);
                const ys = polygon
                    .filter((_: number, i: number) => i % 2 === 1)
                    .map((v: number) => v * scale);
                const left = xs.length ? Math.min(...xs) : 0;
                const right = xs.length ? Math.max(...xs) : 0;
                const top = ys.length ? Math.min(...ys) : 0;
                const bottom = ys.length ? Math.max(...ys) : 0;

                const slope =
                    right - left > 0 && ys.length >= 2
                        ? (ys[1] - ys[0]) / (right - left)
                        : 0;

                blocks.push({
                    text: word.content ?? "",
                    boundingBox: { top, left, right, bottom },
                    centerX: (left + right) / 2,
                    centerY: (top + bottom) / 2,
                    slope,
                    confidence: word.confidence ?? 0,
                    lineBreak: false,
                });
            }

            pages.push({
                pageNum: ap.pageNumber ?? pages.length + 1,
                width: (ap.width ?? 0) * scale,
                height: (ap.height ?? 0) * scale,
                text: (ap.lines ?? [])
                    .map((l: any) => l.content ?? "")
                    .join("\n"),
                blocks,
            });
        }

        const totalConf = pages.reduce(
            (s, p) => s + p.blocks.reduce((ss, b) => ss + b.confidence, 0),
            0,
        );
        const totalBlocks = pages.reduce((s, p) => s + p.blocks.length, 0);

        return {
            provider: "azure",
            providerRaw: analyzeResult,
            fullText,
            processingMs: Date.now() - startMs,
            processedAt: new Date().toISOString(),
            confidence: totalBlocks > 0 ? totalConf / totalBlocks : 0,
            pages,
        };
    }
}
