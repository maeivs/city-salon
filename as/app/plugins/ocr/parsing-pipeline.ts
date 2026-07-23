/**
 * ParsingPipeline — 2단계 파싱 파이프라인
 * 1차: JSON 템플릿 기반 규칙 매칭
 * 2차: LLM 후처리 (폴백)
 */

import type {
    RawOcrResult,
    OcrResult,
    OcrParsingConfig,
} from "./types/index.ts";
import { TemplateMatcher } from "./template-matcher.ts";
import { LlmParser } from "./llm-parser.ts";

export class ParsingPipeline {
    /** 템플릿 매처와 LLM 파서로 파이프라인을 초기화한다 */
    constructor(
        private readonly templateMatcher: TemplateMatcher,
        private readonly llmParser: LlmParser | null,
        private readonly config: OcrParsingConfig,
    ) {}

    /** RawOcrResult를 구조화된 OcrResult로 변환 */
    async parse(raw: RawOcrResult, docType: string): Promise<OcrResult> {
        const result: OcrResult = {
            raw,
            parseMethod: "none",
            parseConfidence: 0,
        };

        // general 타입은 파싱 없이 반환
        if (!docType || docType === "general") return result;

        const threshold = this.config.confidenceThreshold || 0.6;

        // 1차: 템플릿 매칭
        if (this.templateMatcher.hasTemplate(docType)) {
            try {
                const matchResult = this.templateMatcher.match(raw, docType);
                if (
                    matchResult.missingRequired.length === 0 &&
                    matchResult.confidence >= threshold
                ) {
                    result.parsed = matchResult.parsed;
                    result.parseMethod = "template";
                    result.parseConfidence = matchResult.confidence;
                    return result;
                }

                // 폴백 사유 로깅
                if (matchResult.missingRequired.length > 0) {
                    console.log(
                        `[DEBUG] OCR template fallback: missing required fields ${JSON.stringify(matchResult.missingRequired)} (doc_type=${docType})`,
                    );
                } else {
                    console.log(
                        `[DEBUG] OCR template fallback: low confidence ${matchResult.confidence.toFixed(2)} < ${threshold.toFixed(2)} (doc_type=${docType})`,
                    );
                }
            } catch (err) {
                console.log(
                    `[DEBUG] OCR template match error (doc_type=${docType}): ${err}`,
                );
            }
        }

        // 2차: LLM 폴백
        if (this.llmParser) {
            try {
                const parsed = await this.llmParser.parse(
                    raw.fullText,
                    docType,
                );
                result.parsed = parsed;
                result.parseMethod = "llm";
                result.parseConfidence = 0.85;
                return result;
            } catch (err) {
                console.log(
                    `[WARN] OCR LLM fallback failed (doc_type=${docType}): ${err}`,
                );
            }
        }

        return result;
    }
}
