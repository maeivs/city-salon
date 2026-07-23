/**
 * Upstage Document AI OCR 드라이버
 * multipart/form-data 기반 API
 */

import type {
    OcrDriver,
    OcrProviderConfig,
    RawOcrResult,
    RawOcrPage,
    RecognizeOptions,
    TextBlock,
} from "../types/index.ts";

export class UpstageDriver implements OcrDriver {
    private readonly apiKey: string;
    private readonly apiUrl: string;
    private readonly timeout: number;

    /** Upstage Document AI 드라이버를 설정으로 초기화한다 */
    constructor(cfg: OcrProviderConfig) {
        this.apiKey = cfg.apiKey ?? "";
        this.apiUrl = cfg.apiUrl ?? "https://api.upstage.ai/v1/document-ai/ocr";
        this.timeout = (cfg.timeoutSec ?? 60) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name() {
        return "upstage";
    }
    /** 지원하는 파일 형식 목록을 반환한다 */
    supportedFormats() {
        return ["image/jpeg", "image/png", "image/tiff", "application/pdf"];
    }
    /** 드라이버 리소스를 해제한다 */
    async close() {}

    /** 이미지 데이터를 Upstage API로 인식한다 */
    async recognize(
        data: Buffer,
        opts: RecognizeOptions,
    ): Promise<RawOcrResult> {
        const start = Date.now();

        const formData = new FormData();
        formData.append(
            "document",
            new Blob([data], { type: opts.mimeType }),
            "document",
        );

        const resp = await fetch(this.apiUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.apiKey}` },
            body: formData,
            signal: AbortSignal.timeout(this.timeout),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Upstage OCR API error ${resp.status}: ${text}`);
        }

        const json = (await resp.json()) as any;
        const blocks: TextBlock[] = [];
        let fullText = "";
        const resultPages: RawOcrPage[] = [];

        for (let pi = 0; pi < (json.pages ?? []).length; pi++) {
            const page = json.pages[pi];
            const pageBlocks: TextBlock[] = [];
            for (const word of page.words ?? []) {
                // Upstage: bounding_box는 [{x,y}, {x,y}, {x,y}, {x,y}] 형태
                const bbox = word.bounding_box ?? word.boundingBox ?? [];
                let left = 0,
                    right = 0,
                    top = 0,
                    bottom = 0;

                if (
                    bbox.length > 0 &&
                    typeof bbox[0] === "object" &&
                    bbox[0] !== null
                ) {
                    // [{x,y}, ...] 형태
                    const xs = bbox.map((p: any) => p.x ?? 0);
                    const ys = bbox.map((p: any) => p.y ?? 0);
                    left = Math.min(...xs);
                    right = Math.max(...xs);
                    top = Math.min(...ys);
                    bottom = Math.max(...ys);
                } else if (bbox.length > 0) {
                    // flat [x1,y1,x2,y2,...] 형태 (폴백)
                    const xs = bbox.filter(
                        (_: number, i: number) => i % 2 === 0,
                    );
                    const ys = bbox.filter(
                        (_: number, i: number) => i % 2 === 1,
                    );
                    left = xs.length ? Math.min(...xs) : 0;
                    right = xs.length ? Math.max(...xs) : 0;
                    top = ys.length ? Math.min(...ys) : 0;
                    bottom = ys.length ? Math.max(...ys) : 0;
                }

                const tb: TextBlock = {
                    text: word.text ?? "",
                    boundingBox: { top, left, right, bottom },
                    centerX: (left + right) / 2,
                    centerY: (top + bottom) / 2,
                    slope: 0,
                    confidence: word.confidence ?? 0,
                    lineBreak: false,
                };
                pageBlocks.push(tb);
                blocks.push(tb);
            }

            const pageWidth =
                page.width ??
                (pageBlocks.length > 0
                    ? Math.max(...pageBlocks.map((b) => b.boundingBox.right))
                    : 0);
            const pageHeight =
                page.height ??
                (pageBlocks.length > 0
                    ? Math.max(...pageBlocks.map((b) => b.boundingBox.bottom))
                    : 0);

            resultPages.push({
                pageNum: pi + 1,
                width: pageWidth,
                height: pageHeight,
                text: pageBlocks.map((b) => b.text).join(" "),
                blocks: pageBlocks,
            });
        }

        fullText = json.text ?? blocks.map((b) => b.text).join(" ");

        const avgConf =
            blocks.length > 0
                ? blocks.reduce((s, b) => s + b.confidence, 0) / blocks.length
                : 0;

        return {
            provider: "upstage",
            providerRaw: json,
            fullText,
            processingMs: Date.now() - start,
            processedAt: new Date().toISOString(),
            confidence: avgConf,
            pages: resultPages,
        };
    }
}
