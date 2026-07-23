/**
 * Naver CLOVA General OCR 드라이버
 * multipart/form-data 기반 API
 */

import type {
    OcrDriver,
    OcrProviderConfig,
    RawOcrResult,
    RecognizeOptions,
    TextBlock,
    RawOcrPage,
} from "../types/index.ts";

const EXTENSION_MAP: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/tiff": "tiff",
    "image/bmp": "bmp",
    "image/webp": "webp",
    "application/pdf": "pdf",
};

export class NaverDriver implements OcrDriver {
    private readonly apiUrl: string;
    private readonly secretKey: string;
    private readonly timeout: number;

    /** Naver CLOVA OCR 드라이버를 설정으로 초기화한다 */
    constructor(cfg: OcrProviderConfig) {
        this.apiUrl = cfg.apiUrl ?? "";
        this.secretKey = cfg.secretKey ?? "";
        this.timeout = (cfg.timeoutSec ?? 30) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name() {
        return "naver";
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

    /** 이미지 데이터를 Naver CLOVA API로 인식한다 */
    async recognize(
        data: Buffer,
        opts: RecognizeOptions,
    ): Promise<RawOcrResult> {
        const start = Date.now();
        const ext = EXTENSION_MAP[opts.mimeType] ?? "jpg";

        const message = {
            version: "V2",
            requestId: crypto.randomUUID(),
            timestamp: Date.now(),
            lang: opts.languages?.[0] ?? "ko",
            images: [{ format: ext, name: "image" }],
        };

        const formData = new FormData();
        formData.append("message", JSON.stringify(message));
        formData.append(
            "file",
            new Blob([data], { type: opts.mimeType }),
            `image.${ext}`,
        );

        const resp = await fetch(this.apiUrl, {
            method: "POST",
            headers: { "X-OCR-SECRET": this.secretKey },
            body: formData,
            signal: AbortSignal.timeout(this.timeout),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Naver OCR API error ${resp.status}: ${text}`);
        }

        const json = (await resp.json()) as any;
        const images = json.images ?? [];
        const resultPages: RawOcrPage[] = [];
        let fullText = "";

        for (let pi = 0; pi < images.length; pi++) {
            const img = images[pi];
            const blocks: TextBlock[] = [];
            const lines: string[] = [];

            for (const field of img.fields ?? []) {
                const tb = parseNaverField(field);
                if (tb) {
                    blocks.push(tb);
                    lines.push(tb.text);
                }
            }

            const pageText = lines.join(" ");
            fullText += (pi > 0 ? "\n" : "") + pageText;

            const avgConf =
                blocks.length > 0
                    ? blocks.reduce((s, b) => s + b.confidence, 0) /
                      blocks.length
                    : 0;

            // 이미지 크기 추정 (bounding box 기반)
            let maxRight = 0,
                maxBottom = 0;
            for (const b of blocks) {
                if (b.boundingBox.right > maxRight)
                    maxRight = b.boundingBox.right;
                if (b.boundingBox.bottom > maxBottom)
                    maxBottom = b.boundingBox.bottom;
            }

            resultPages.push({
                pageNum: pi + 1,
                width: maxRight,
                height: maxBottom,
                text: pageText,
                blocks,
            });
        }

        const totalConf = resultPages.reduce(
            (s, p) => s + p.blocks.reduce((ss, b) => ss + b.confidence, 0),
            0,
        );
        const totalBlocks = resultPages.reduce(
            (s, p) => s + p.blocks.length,
            0,
        );

        return {
            provider: "naver",
            providerRaw: json,
            fullText,
            processingMs: Date.now() - start,
            processedAt: new Date().toISOString(),
            confidence: totalBlocks > 0 ? totalConf / totalBlocks : 0,
            pages: resultPages,
        };
    }
}

/** Naver OCR 필드 데이터를 TextBlock으로 변환한다 */
function parseNaverField(field: any): TextBlock | null {
    const text = field.inferText ?? "";
    if (!text) return null;

    const conf = field.inferConfidence ?? 0;
    const vertices = field.boundingPoly?.vertices ?? [];
    if (vertices.length < 4) return null;

    const xs = vertices.map((v: any) => v.x ?? 0);
    const ys = vertices.map((v: any) => v.y ?? 0);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    const slope =
        right - left > 0
            ? ((vertices[1]?.y ?? 0) - (vertices[0]?.y ?? 0)) / (right - left)
            : 0;

    return {
        text,
        boundingBox: { top, left, right, bottom },
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
        slope,
        confidence: conf,
        lineBreak: field.lineBreak?.type === "SPACE" ? false : true,
    };
}
