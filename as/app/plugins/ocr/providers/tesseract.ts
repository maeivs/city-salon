/**
 * 로컬 Tesseract CLI OCR 드라이버
 * tesseract CLI → TSV 파싱
 */

import { execFile } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
    OcrDriver,
    OcrProviderConfig,
    RawOcrResult,
    RecognizeOptions,
    TextBlock,
} from "../types/index.ts";

const execFileAsync = promisify(execFile);

// TSV 컬럼 인덱스 (Tesseract output)
const TSV_LEVEL = 0;
const TSV_PAGE_NUM = 1;
const TSV_BLOCK_NUM = 2;
const TSV_PAR_NUM = 3;
const TSV_LINE_NUM = 4;
const TSV_WORD_NUM = 5;
const TSV_LEFT = 6;
const TSV_TOP = 7;
const TSV_WIDTH = 8;
const TSV_HEIGHT = 9;
const TSV_CONF = 10;
const TSV_TEXT = 11;

export class TesseractDriver implements OcrDriver {
    private readonly lang: string;
    private readonly dataPath: string;
    private readonly psm: number;
    private readonly oem: number;
    private readonly timeout: number;

    /** Tesseract CLI 드라이버를 설정으로 초기화한다 */
    constructor(cfg: OcrProviderConfig) {
        this.lang = cfg.defaultLang ?? "kor+eng";
        this.dataPath = cfg.dataPath ?? "";
        this.psm = cfg.psm ?? 3;
        this.oem = cfg.oem ?? 3;
        this.timeout = (cfg.timeoutSec ?? 30) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name() {
        return "tesseract";
    }
    /** 지원하는 파일 형식 목록을 반환한다 */
    supportedFormats() {
        return [
            "image/jpeg",
            "image/png",
            "image/tiff",
            "image/bmp",
            "image/webp",
        ];
    }
    /** 드라이버 리소스를 해제한다 */
    async close() {}

    /** 이미지 데이터를 Tesseract CLI로 인식한다 */
    async recognize(
        data: Buffer,
        opts: RecognizeOptions,
    ): Promise<RawOcrResult> {
        const start = Date.now();
        const tmpDir = await mkdtemp(join(tmpdir(), "ocr-tess-"));

        try {
            const inputPath = join(tmpDir, "input");
            const outputBase = join(tmpDir, "output");
            await writeFile(inputPath, data);

            const args = [
                inputPath,
                outputBase,
                "-l",
                opts.languages?.[0] ?? this.lang,
                "--psm",
                String(this.psm),
                "--oem",
                String(this.oem),
                "tsv",
            ];
            if (this.dataPath) {
                args.unshift("--tessdata-dir", this.dataPath);
            }

            await execFileAsync("tesseract", args, { timeout: this.timeout });

            const { readFile } = await import("node:fs/promises");
            const tsvData = await readFile(outputBase + ".tsv", "utf-8");
            const { blocks, fullText } = parseTesseractTSV(tsvData);

            const result: RawOcrResult = {
                provider: "tesseract",
                providerRaw: tsvData,
                fullText,
                processingMs: Date.now() - start,
                processedAt: new Date().toISOString(),
                confidence: 0,
                pages: [],
            };

            if (blocks.length > 0) {
                let maxRight = 0,
                    maxBottom = 0,
                    totalConf = 0;
                for (const b of blocks) {
                    if (b.boundingBox.right > maxRight)
                        maxRight = b.boundingBox.right;
                    if (b.boundingBox.bottom > maxBottom)
                        maxBottom = b.boundingBox.bottom;
                    totalConf += b.confidence;
                }
                result.pages = [
                    {
                        pageNum: 1,
                        width: maxRight,
                        height: maxBottom,
                        text: fullText,
                        blocks,
                    },
                ];
                result.confidence = totalConf / blocks.length;
            }

            return result;
        } finally {
            await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
    }
}

/**
 * Tesseract TSV 출력을 파싱합니다.
 */
function parseTesseractTSV(tsv: string): {
    blocks: TextBlock[];
    fullText: string;
} {
    const blocks: TextBlock[] = [];
    const lines: string[] = [];
    let curLine = "";
    let prevLineNum = -1;

    const rows = tsv.split("\n");
    // 헤더 스킵
    for (let i = 1; i < rows.length; i++) {
        const fields = rows[i].split("\t");
        if (fields.length <= TSV_TEXT) continue;

        const text = fields[TSV_TEXT];
        if (!text) continue;

        let conf = parseFloat(fields[TSV_CONF]) || 0;
        if (conf < 0) conf = 0;

        const left = parseInt(fields[TSV_LEFT]) || 0;
        const top = parseInt(fields[TSV_TOP]) || 0;
        const width = parseInt(fields[TSV_WIDTH]) || 0;
        const height = parseInt(fields[TSV_HEIGHT]) || 0;
        const lineNum = parseInt(fields[TSV_LINE_NUM]) || 0;
        const right = left + width;
        const bottom = top + height;

        if (lineNum !== prevLineNum && prevLineNum !== -1) {
            const trimmed = curLine.trim();
            if (trimmed) lines.push(trimmed);
            curLine = "";
        }
        curLine += text + " ";
        prevLineNum = lineNum;

        blocks.push({
            text,
            confidence: conf / 100,
            boundingBox: { top, left, right, bottom },
            centerX: (left + right) / 2,
            centerY: (top + bottom) / 2,
            slope: 0,
            lineBreak: false,
        });
    }

    if (curLine.trim()) {
        lines.push(curLine.trim());
    }

    return { blocks, fullText: lines.join("\n") };
}
