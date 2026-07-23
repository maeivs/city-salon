/**
 * TemplateLoader — JSON 템플릿/프롬프트 파일 로드 + 캐싱
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Template, LlmPromptTemplate } from "./types/index.ts";
import { OcrError, ERR_TEMPLATE_NOT_FOUND } from "./errors.ts";

export class TemplateLoader {
    private readonly templateDir: string;
    private readonly cache = new Map<string, Template>();

    /** 템플릿 디렉토리 경로로 로더를 초기화한다 */
    constructor(templateDir: string) {
        this.templateDir = templateDir;
    }

    /** doc_type에 해당하는 템플릿 로드 (캐시됨) */
    load(docType: string): Template {
        const cached = this.cache.get(docType);
        if (cached) return cached;

        const path = join(this.templateDir, `${docType}.json`);
        if (!existsSync(path)) {
            throw new OcrError(
                `template not found: ${docType}`,
                ERR_TEMPLATE_NOT_FOUND,
            );
        }

        const data = JSON.parse(readFileSync(path, "utf-8")) as Template;
        this.cache.set(docType, data);
        return data;
    }

    /** doc_type 템플릿 파일 존재 여부 확인 */
    has(docType: string): boolean {
        if (this.cache.has(docType)) return true;
        return existsSync(join(this.templateDir, `${docType}.json`));
    }

    /** 템플릿 디렉토리의 모든 doc_type 반환 */
    listDocTypes(): string[] {
        try {
            return readdirSync(this.templateDir)
                .filter((f) => f.endsWith(".json") && !f.startsWith("."))
                .map((f) => f.replace(/\.json$/, ""));
        } catch {
            return [];
        }
    }

    /** 특정 doc_type 캐시 제거 */
    invalidate(docType: string): void {
        this.cache.delete(docType);
    }

    /** 전체 캐시 초기화 */
    invalidateAll(): void {
        this.cache.clear();
    }

    /** LLM 폴백용 프롬프트 템플릿 로드 */
    loadPrompt(promptDir: string, docType: string): LlmPromptTemplate {
        const path = join(promptDir, `${docType}.json`);
        if (!existsSync(path)) {
            throw new Error(`prompt template not found: ${docType}`);
        }
        return JSON.parse(readFileSync(path, "utf-8")) as LlmPromptTemplate;
    }
}
