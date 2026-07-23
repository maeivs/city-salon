/**
 * Google Cloud Vision OCR 드라이버
 * DOCUMENT_TEXT_DETECTION API 사용
 */

import type {
    OcrDriver,
    OcrProviderConfig,
    RawOcrResult,
    RecognizeOptions,
    TextBlock,
    RawOcrPage,
} from "../types/index.ts";

export class GoogleDriver implements OcrDriver {
    private readonly apiKey: string;
    private readonly apiUrl: string;
    private readonly timeout: number;

    /** Google Cloud Vision 드라이버를 설정으로 초기화한다 */
    constructor(cfg: OcrProviderConfig) {
        this.apiKey = cfg.apiKey ?? "";
        this.apiUrl =
            cfg.apiUrl ??
            `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`;
        this.timeout = (cfg.timeoutSec ?? 30) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name() {
        return "google";
    }
    /** 지원하는 파일 형식 목록을 반환한다 */
    supportedFormats() {
        return [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/bmp",
            "image/webp",
            "application/pdf",
        ];
    }
    /** 드라이버 리소스를 해제한다 */
    async close() {}

    /** 이미지 데이터를 Google Vision API로 인식한다 */
    async recognize(
        data: Buffer,
        opts: RecognizeOptions,
    ): Promise<RawOcrResult> {
        const start = Date.now();
        const body = {
            requests: [
                {
                    image: { content: data.toString("base64") },
                    features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                    imageContext: opts.languages?.length
                        ? { languageHints: opts.languages }
                        : undefined,
                },
            ],
        };

        const resp = await fetch(this.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeout),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Google Vision API error ${resp.status}: ${text}`);
        }

        const json = (await resp.json()) as any;
        const annotation = json.responses?.[0]?.fullTextAnnotation;
        const fullText = annotation?.text ?? "";

        // 페이지별 텍스트 블록 파싱
        const gPages = annotation?.pages ?? [];
        const resultPages: RawOcrPage[] = [];
        let totalConf = 0;
        let totalBlocks = 0;

        for (let pi = 0; pi < gPages.length; pi++) {
            const page = gPages[pi];
            const blocks: TextBlock[] = [];
            const pageTexts: string[] = [];
            for (const block of page.blocks ?? []) {
                for (const paragraph of block.paragraphs ?? []) {
                    for (const word of paragraph.words ?? []) {
                        const symbols = (word.symbols ?? [])
                            .map((s: any) => s.text ?? "")
                            .join("");
                        const vertices = word.boundingBox?.vertices ?? [];
                        const [tl, tr, br, bl] = [
                            vertices[0] ?? {},
                            vertices[1] ?? {},
                            vertices[2] ?? {},
                            vertices[3] ?? {},
                        ];
                        const top = Math.min(tl.y ?? 0, tr.y ?? 0);
                        const bottom = Math.max(bl.y ?? 0, br.y ?? 0);
                        const left = Math.min(tl.x ?? 0, bl.x ?? 0);
                        const right = Math.max(tr.x ?? 0, br.x ?? 0);

                        const conf = word.confidence ?? 0;
                        const slope =
                            right - left > 0
                                ? ((tr.y ?? 0) - (tl.y ?? 0)) / (right - left)
                                : 0;

                        blocks.push({
                            text: symbols,
                            boundingBox: { top, left, right, bottom },
                            centerX: (left + right) / 2,
                            centerY: (top + bottom) / 2,
                            slope,
                            confidence: conf,
                            lineBreak: false,
                        });
                        pageTexts.push(symbols);
                    }
                }
            }

            totalConf += blocks.reduce((s, b) => s + b.confidence, 0);
            totalBlocks += blocks.length;

            resultPages.push({
                pageNum: pi + 1,
                width: page.width ?? 0,
                height: page.height ?? 0,
                text: pageTexts.join(" "),
                blocks,
            });
        }

        const avgConf = totalBlocks > 0 ? totalConf / totalBlocks : 0;

        const result: RawOcrResult = {
            provider: "google",
            providerRaw: json,
            fullText,
            processingMs: Date.now() - start,
            processedAt: new Date().toISOString(),
            confidence: avgConf,
            pages: resultPages,
        };

        return result;
    }
}
