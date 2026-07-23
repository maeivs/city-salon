/**
 * PDF → PNG 변환 (Go 서버 /v1/utils/pdf2png API 사용)
 *
 * 단일 페이지: image/png 바이너리 반환
 * 다중 페이지: application/zip 반환 → 내부 page-001.png 등을 추출
 */

import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";
import type { PageRange } from "./types/index.ts";

const inflateRawAsync = promisify(inflateRaw);
const DEFAULT_DPI = 300;

/** Go 서버 pdf2png를 호출할 수 있는 최소 인터페이스 */
export interface Pdf2PngClient {
    pdf2png(
        pdfData: ArrayBuffer | Uint8Array,
        opts?: { dpi?: number; firstPage?: number; lastPage?: number },
    ): Promise<ArrayBuffer>;
}

/**
 * PDF를 PNG 이미지 Buffer 배열로 변환합니다.
 * Go 서버 `/v1/utils/pdf2png` API를 사용합니다.
 */
export async function convertPDFToImages(
    pdfData: Buffer,
    pageRange?: PageRange,
    dpi?: number,
    client?: Pdf2PngClient,
): Promise<Buffer[]> {
    if (!client) {
        throw new Error(
            "pdf converter: entity server client is required (local CLI is no longer supported)",
        );
    }

    const result = await client.pdf2png(pdfData, {
        dpi: dpi && dpi > 0 ? dpi : DEFAULT_DPI,
        firstPage: pageRange?.start,
        lastPage: pageRange?.end,
    });

    const buf = Buffer.from(result);

    // 단일 페이지 응답 → image/png (magic: \x89PNG)
    if (
        buf.length >= 4 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47
    ) {
        return [buf];
    }

    // 다중 페이지 응답 → application/zip (magic: PK\x03\x04)
    if (
        buf.length >= 4 &&
        buf[0] === 0x50 &&
        buf[1] === 0x4b &&
        buf[2] === 0x03 &&
        buf[3] === 0x04
    ) {
        return extractZipPages(buf);
    }

    throw new Error(
        "pdf converter: unexpected response format from Go server (not PNG or ZIP)",
    );
}

/**
 * ZIP 아카이브에서 PNG 페이지들을 추출합니다.
 * Go 서버가 생성하는 page-001.png, page-002.png … 파일명 규칙을 따릅니다.
 */
async function extractZipPages(zipBuf: Buffer): Promise<Buffer[]> {
    const pages: { name: string; data: Buffer }[] = [];
    let offset = 0;

    while (offset + 30 < zipBuf.length) {
        // local file header signature: PK\x03\x04
        if (
            zipBuf[offset] !== 0x50 ||
            zipBuf[offset + 1] !== 0x4b ||
            zipBuf[offset + 2] !== 0x03 ||
            zipBuf[offset + 3] !== 0x04
        ) {
            break;
        }

        const method = zipBuf.readUInt16LE(offset + 8); // 0=store, 8=deflate
        const compressedSize = zipBuf.readUInt32LE(offset + 18);
        const filenameLen = zipBuf.readUInt16LE(offset + 26);
        const extraLen = zipBuf.readUInt16LE(offset + 28);
        const filename = zipBuf
            .subarray(offset + 30, offset + 30 + filenameLen)
            .toString("utf8");

        const dataStart = offset + 30 + filenameLen + extraLen;
        const compressedData = zipBuf.subarray(
            dataStart,
            dataStart + compressedSize,
        );

        let fileData: Buffer;
        if (method === 0) {
            fileData = Buffer.from(compressedData);
        } else if (method === 8) {
            fileData = (await inflateRawAsync(compressedData)) as Buffer;
        } else {
            throw new Error(
                `pdf converter: unsupported ZIP compression method ${method}`,
            );
        }

        pages.push({ name: filename, data: fileData });
        offset = dataStart + compressedSize;
    }

    if (pages.length === 0) {
        throw new Error("pdf converter: ZIP archive contains no page files");
    }

    // page-001.png 순으로 정렬
    pages.sort((a, b) => a.name.localeCompare(b.name));
    return pages.map((p) => p.data);
}

/** %PDF- 매직 바이트로 PDF 판별 */
export function isPDF(data: Buffer): boolean {
    return (
        data.length >= 5 && data.subarray(0, 5).toString("ascii") === "%PDF-"
    );
}
