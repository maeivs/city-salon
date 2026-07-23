/**
 * LLM 프롬프트 템플릿 로더
 *
 * templates/llm/prompts/*.json 을 읽어 캐시하고,
 * {{variable}} 패턴을 변수 맵으로 치환해 렌더링한다.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 타입 ──────────────────────────────────────────────────────────────────

export interface LlmPromptTemplate {
    /** 식별자 (파일명 기준, 확장자 제외) */
    name: string;
    /** 사람이 읽기 좋은 이름 */
    label?: string;
    /** 시스템 프롬프트. {{var}} 치환 지원 */
    system_msg: string;
    /**
     * 사용자 메시지 템플릿. {{var}} 치환 지원.
     * 없으면 클라이언트가 직접 messages를 전달해야 한다.
     */
    user_msg?: string;
    /** 필수 변수 이름 목록 */
    variables?: string[];
    /** 변수 기본값 */
    defaults?: Record<string, string>;
    /** 최대 출력 토큰 (템플릿 오버라이드) */
    max_tokens?: number;
    /** temperature (템플릿 오버라이드) */
    temperature?: number;
}

export interface RenderedTemplate {
    system: string;
    userMsg: string | null;
    maxTokens?: number;
    temperature?: number;
}

// ─── 캐시 ──────────────────────────────────────────────────────────────────

const cache = new Map<string, LlmPromptTemplate>();

function templateDir(): string {
    return join(__dirname, "templates", "prompts");
}

// ─── 공개 API ──────────────────────────────────────────────────────────────

/**
 * 템플릿을 이름으로 로드한다. 서버 재시작 없이 파일 변경을 반영하려면
 * `reload = true`를 전달한다.
 */
export function loadTemplate(
    name: string,
    reload = false,
): LlmPromptTemplate | null {
    if (!reload) {
        const cached = cache.get(name);
        if (cached) return cached;
    }

    // 경로 검증 (path traversal 방지)
    if (!/^[\w\-./]+$/.test(name)) return null;

    const filePath = resolve(templateDir(), `${name}.json`);
    if (!existsSync(filePath)) return null;

    try {
        const tpl = JSON.parse(
            readFileSync(filePath, "utf-8"),
        ) as LlmPromptTemplate;
        cache.set(name, tpl);
        return tpl;
    } catch {
        return null;
    }
}

/**
 * 등록된 모든 템플릿 이름 목록을 반환한다.
 * (templates/llm/prompts/*.json 스캔)
 */
export function listTemplates(): string[] {
    const dir = templateDir();
    if (!existsSync(dir)) return [];
    try {
        return readdirSync(dir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => f.slice(0, -5));
    } catch {
        return [];
    }
}

/**
 * 템플릿의 `system_msg`와 `user_msg`에 변수를 주입해 렌더링한다.
 *
 * @param tpl    로드된 템플릿
 * @param vars   클라이언트가 전달한 변수 맵
 */
export function renderTemplate(
    tpl: LlmPromptTemplate,
    vars: Record<string, string>,
): RenderedTemplate {
    const merged = { ...(tpl.defaults ?? {}), ...vars };

    const render = (s: string): string =>
        s.replace(/\{\{(\w+)\}\}/g, (_, key) => merged[key] ?? "");

    return {
        system: render(tpl.system_msg),
        userMsg: tpl.user_msg ? render(tpl.user_msg) : null,
        maxTokens: tpl.max_tokens,
        temperature: tpl.temperature,
    };
}

/**
 * 필수 변수 누락 여부를 검사한다.
 * 누락된 변수 이름 배열을 반환한다. 비어있으면 OK.
 */
export function validateVars(
    tpl: LlmPromptTemplate,
    vars: Record<string, string>,
): string[] {
    if (!tpl.variables?.length) return [];
    const merged = { ...(tpl.defaults ?? {}), ...vars };
    return tpl.variables.filter((v) => !merged[v]);
}
