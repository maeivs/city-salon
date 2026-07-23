/**
 * OCR 드라이버 팩토리 + 재시도 + 파일 크기 검증
 */

import type {
    OcrDriver,
    OcrProviderConfig,
    RawOcrResult,
    RecognizeOptions,
    RetryConfig,
} from "../types/index.ts";
import { OcrError, ERR_FILE_TOO_LARGE } from "../errors.ts";
import { GoogleDriver } from "./google.ts";
import { NaverDriver } from "./naver.ts";
import { AwsDriver } from "./aws.ts";
import { AzureDriver } from "./azure.ts";
import { UpstageDriver } from "./upstage.ts";
import { TesseractDriver } from "./tesseract.ts";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

/** 프로바이더 설정에 따라 OCR 드라이버 인스턴스를 생성한다 */
export function createOcrDriver(cfg: OcrProviderConfig): OcrDriver {
    switch (cfg.driver) {
        case "google":
            return new GoogleDriver(cfg);
        case "naver":
            return new NaverDriver(cfg);
        case "aws_textract":
            return new AwsDriver(cfg);
        case "azure":
            return new AzureDriver(cfg);
        case "upstage":
            return new UpstageDriver(cfg);
        case "tesseract":
            return new TesseractDriver(cfg);
        default:
            throw new Error(`Unsupported OCR driver: ${cfg.driver}`);
    }
}

/** 재시도 정책에 따라 OCR 인식을 수행한다 */
export async function retryRecognize(
    driver: OcrDriver,
    data: Buffer,
    opts: RecognizeOptions,
    cfg: RetryConfig,
): Promise<RawOcrResult> {
    const maxRetries = cfg.maxRetries > 0 ? cfg.maxRetries : 3;
    const delay = cfg.retryDelayMs > 0 ? cfg.retryDelayMs : 1000;

    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) {
            console.log(
                `[INFO] OCR API retry #${attempt} (driver=${driver.name()})`,
            );
            await new Promise((r) => setTimeout(r, delay));
        }
        try {
            return await driver.recognize(data, opts);
        } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
        }
    }
    throw new Error(
        `OCR API failed after ${maxRetries} retries: ${lastErr?.message}`,
    );
}

/** 파일 크기가 제한을 초과하는지 검증한다 */
export function validateFileSize(data: Buffer, limitMB: number): void {
    const limit = limitMB > 0 ? limitMB * 1024 * 1024 : MAX_FILE_SIZE_BYTES;
    if (data.length > limit) {
        throw new OcrError(
            `file size exceeds limit: ${data.length} bytes (limit ${limit} bytes)`,
            ERR_FILE_TOO_LARGE,
        );
    }
}
