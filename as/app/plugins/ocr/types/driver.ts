import type { ParsedDocument } from "./parsed.ts";

export interface OcrDriver {
    recognize(data: Buffer, opts: RecognizeOptions): Promise<RawOcrResult>;
    name(): string;
    supportedFormats(): string[];
    close(): Promise<void>;
}

export interface RecognizeOptions {
    mimeType: string;
    docType?: string;
    languages?: string[];
    pageRange?: PageRange;
    includeBoxes?: boolean;
    confidenceThreshold?: number;
}

export interface PageRange {
    start: number;
    end: number;
}

export interface RawOcrResult {
    fullText: string;
    pages: RawOcrPage[];
    confidence: number;
    providerRaw?: unknown;
    processingMs: number;
    processedAt: string;
    provider: string;
}

export interface RawOcrPage {
    pageNum: number;
    width: number;
    height: number;
    text: string;
    blocks: TextBlock[];
}

export interface TextBlock {
    text: string;
    boundingBox: BoundingBox;
    centerX: number;
    centerY: number;
    slope: number;
    confidence: number;
    lineBreak: boolean;
}

export interface BoundingBox {
    top: number;
    left: number;
    right: number;
    bottom: number;
}

export interface OcrResult {
    raw?: RawOcrResult;
    parsed?: ParsedDocument;
    parseMethod: string;
    parseConfidence: number;
}

export interface DispatchJob {
    id: string;
    data: Buffer;
    opts: RecognizeOptions;
    createdAt: string;
}
