/**
 * AWS Textract OCR 드라이버
 * DetectDocumentText API + SigV4 서명
 */

import { createHmac, createHash } from "node:crypto";
import type {
    OcrDriver,
    OcrProviderConfig,
    RawOcrResult,
    RecognizeOptions,
    TextBlock,
    RawOcrPage,
} from "../types/index.ts";

export class AwsDriver implements OcrDriver {
    private readonly accessKeyId: string;
    private readonly secretAccessKey: string;
    private readonly region: string;
    private readonly timeout: number;

    /** AWS Textract 드라이버를 설정으로 초기화한다 */
    constructor(cfg: OcrProviderConfig) {
        this.accessKeyId = cfg.accessKeyId ?? "";
        this.secretAccessKey = cfg.secretAccessKey ?? "";
        this.region = cfg.region ?? "ap-northeast-2";
        this.timeout = (cfg.timeoutSec ?? 30) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name() {
        return "aws_textract";
    }
    /** 지원하는 파일 형식 목록을 반환한다 */
    supportedFormats() {
        return ["image/jpeg", "image/png", "application/pdf"];
    }
    /** 드라이버 리소스를 해제한다 */
    async close() {}

    /** 이미지 데이터를 AWS Textract API로 인식한다 */
    async recognize(
        data: Buffer,
        opts: RecognizeOptions,
    ): Promise<RawOcrResult> {
        const start = Date.now();
        const host = `textract.${this.region}.amazonaws.com`;
        const url = `https://${host}`;
        const payload = JSON.stringify({
            Document: { Bytes: data.toString("base64") },
        });

        const now = new Date();
        const amzDate = now
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, "");
        const dateStamp = amzDate.slice(0, 8);

        const headers = this.buildAWSAuth(host, payload, amzDate, dateStamp);

        const resp = await fetch(url, {
            method: "POST",
            headers: {
                ...headers,
                "Content-Type": "application/x-amz-json-1.1",
                "X-Amz-Target": "Textract.DetectDocumentText",
            },
            body: payload,
            signal: AbortSignal.timeout(this.timeout),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`AWS Textract API error ${resp.status}: ${text}`);
        }

        const json = (await resp.json()) as any;
        const blocks: TextBlock[] = [];
        const lineTexts: string[] = [];

        for (const block of json.Blocks ?? []) {
            if (block.BlockType === "WORD") {
                const bb = block.Geometry?.BoundingBox ?? {};
                const w = bb.Width ?? 0;
                const h = bb.Height ?? 0;
                const left = bb.Left ?? 0;
                const top = bb.Top ?? 0;
                const right = left + w;
                const bottom = top + h;

                // Textract는 정규화 좌표 (0~1) → 1000 기준 변환
                const scale = 1000;
                const sLeft = Math.round(left * scale);
                const sTop = Math.round(top * scale);
                const sRight = Math.round(right * scale);
                const sBottom = Math.round(bottom * scale);

                blocks.push({
                    text: block.Text ?? "",
                    boundingBox: {
                        top: sTop,
                        left: sLeft,
                        right: sRight,
                        bottom: sBottom,
                    },
                    centerX: (sLeft + sRight) / 2,
                    centerY: (sTop + sBottom) / 2,
                    slope: 0,
                    confidence: (block.Confidence ?? 0) / 100,
                    lineBreak: false,
                });
            } else if (block.BlockType === "LINE") {
                lineTexts.push(block.Text ?? "");
            }
        }

        const fullText = lineTexts.join("\n");
        const avgConf =
            blocks.length > 0
                ? blocks.reduce((s, b) => s + b.confidence, 0) / blocks.length
                : 0;

        return {
            provider: "aws_textract",
            providerRaw: json,
            fullText,
            processingMs: Date.now() - start,
            processedAt: new Date().toISOString(),
            confidence: avgConf,
            pages: [
                {
                    pageNum: 1,
                    width: 1000,
                    height: 1000,
                    text: fullText,
                    blocks,
                },
            ],
        };
    }

    /** AWS SigV4 서명 헤더를 생성한다 */
    private buildAWSAuth(
        host: string,
        payload: string,
        amzDate: string,
        dateStamp: string,
    ): Record<string, string> {
        const service = "textract";
        const algorithm = "AWS4-HMAC-SHA256";
        const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;

        const payloadHash = createHash("sha256").update(payload).digest("hex");

        const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:Textract.DetectDocumentText\n`;
        const signedHeaders = "content-type;host;x-amz-date;x-amz-target";

        const canonicalRequest = [
            "POST",
            "/",
            "",
            canonicalHeaders,
            signedHeaders,
            payloadHash,
        ].join("\n");

        const stringToSign = [
            algorithm,
            amzDate,
            credentialScope,
            createHash("sha256").update(canonicalRequest).digest("hex"),
        ].join("\n");

        const signingKey = this.getSignatureKey(dateStamp, service);
        const signature = createHmac("sha256", signingKey)
            .update(stringToSign)
            .digest("hex");

        const authorization = `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        return {
            Host: host,
            "X-Amz-Date": amzDate,
            Authorization: authorization,
        };
    }

    /** SigV4 서명 키를 생성한다 */
    private getSignatureKey(dateStamp: string, service: string): Buffer {
        const kDate = createHmac("sha256", `AWS4${this.secretAccessKey}`)
            .update(dateStamp)
            .digest();
        const kRegion = createHmac("sha256", kDate)
            .update(this.region)
            .digest();
        const kService = createHmac("sha256", kRegion).update(service).digest();
        return createHmac("sha256", kService).update("aws4_request").digest();
    }
}
