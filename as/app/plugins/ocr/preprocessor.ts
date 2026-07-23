/**
 * TextPreprocessor — OCR 원시 텍스트 블록을 7단계로 전처리
 * PHP NaverClovaTextProcessor 알고리즘 포팅
 */

import type {
    TextBlock,
    PreprocessConfig,
    ProcessedItem,
    ProcessedPage,
} from "./types/index.ts";

const DEFAULT_SLOPE_EXCEPTIONS = [
    String.raw`^(\d{2}|\d{4})[\.\-\/년]?\s*(\d{1,2})[\.\-\/월]?\s*(\d{1,2})[\.\일]?$`,
];

export class TextPreprocessor {
    /** 7단계 전처리 메인 함수 */
    preprocess(blocks: TextBlock[], cfg: PreprocessConfig): ProcessedPage {
        // 기본값
        const maxSlope = cfg.maxSlope || 0.2;
        const yTol = cfg.yTolerance || 15;
        const xTol = cfg.xTolerance || 30;
        const slopeExceptions = cfg.slopeExceptions?.length
            ? cfg.slopeExceptions
            : DEFAULT_SLOPE_EXCEPTIONS;
        const keywords = cfg.keywords ?? {};

        // ① 텍스트 추출 + 정렬
        let items = this.extractAndSort(blocks, yTol);
        // ② slope 필터
        items = this.filterBySlope(items, maxSlope, slopeExceptions);
        // ③ 문장 패턴 제거
        items = this.removeTextPatterns(items, cfg.removePatterns ?? []);
        // ④ 키워드 제거
        items = this.removeKeywords(items, cfg.removeKeywords ?? []);
        // ⑤ 텍스트 조각 병합
        for (const [field, kwList] of Object.entries(keywords)) {
            if (field === "dummy") continue;
            for (const kw of kwList) {
                items = this.mergePattern(items, kw, true);
            }
        }
        for (const pattern of cfg.mergePatterns ?? []) {
            items = this.mergePattern(items, pattern, false);
        }
        // ⑥ 인접 텍스트 그룹화
        items = this.groupAdjacentTexts(items, yTol, xTol);
        // ⑦ 키워드 식별 + 필드 할당
        return this.processKeywords(items, keywords);
    }

    /** ① extractAndSort */
    private extractAndSort(blocks: TextBlock[], yTol: number): ProcessedItem[] {
        const items: ProcessedItem[] = blocks.map((b) => ({
            text: b.text,
            centerX: (b.boundingBox.left + b.boundingBox.right) / 2,
            centerY: (b.boundingBox.top + b.boundingBox.bottom) / 2,
            top: b.boundingBox.top,
            bottom: b.boundingBox.bottom,
            left: b.boundingBox.left,
            right: b.boundingBox.right,
            width: b.boundingBox.right - b.boundingBox.left,
            height: b.boundingBox.bottom - b.boundingBox.top,
            slope: b.slope,
            isKeyword: false,
            field: "",
        }));

        items.sort((a, b) => {
            if (Math.abs(a.centerY - b.centerY) < yTol) return a.left - b.left;
            return a.top - b.top;
        });
        return items;
    }

    /** ② filterBySlope */
    private filterBySlope(
        items: ProcessedItem[],
        maxSlope: number,
        exceptions: string[],
    ): ProcessedItem[] {
        const compiled = exceptions
            .map((p) => {
                try {
                    return new RegExp(p);
                } catch {
                    return null;
                }
            })
            .filter((r): r is RegExp => r !== null);

        return items.filter((item) => {
            if (Math.abs(item.slope) <= maxSlope) return true;
            const trimmed = item.text.trim();
            return compiled.some((re) => re.test(trimmed));
        });
    }

    /** ③ removeTextPatterns */
    private removeTextPatterns(
        items: ProcessedItem[],
        patterns: string[],
    ): ProcessedItem[] {
        if (!patterns.length) return items;
        const clean = patterns.map((p) => p.toLowerCase().replace(/ /g, ""));
        return items.filter((item) => {
            const t = item.text.toLowerCase().replace(/ /g, "");
            return !clean.some((cp) => cp.includes(t));
        });
    }

    /** ④ removeKeywords */
    private removeKeywords(
        items: ProcessedItem[],
        keywords: string[],
    ): ProcessedItem[] {
        if (!keywords.length) return items;
        const clean = keywords.map((k) => k.toLowerCase().replace(/ /g, ""));
        return items.filter((item) => {
            const t = item.text.toLowerCase().replace(/ /g, "");
            return !clean.includes(t);
        });
    }

    /** ⑤ mergePattern */
    private mergePattern(
        items: ProcessedItem[],
        pattern: string,
        isKeyword: boolean,
    ): ProcessedItem[] {
        const cleanPattern = pattern.replace(/ /g, "");
        if (!cleanPattern) return items;

        const result: ProcessedItem[] = [];
        let i = 0;

        while (i < items.length) {
            const matched: ProcessedItem[] = [];
            let patternPos = 0;
            let j = i;

            while (j < items.length && patternPos < runeLength(cleanPattern)) {
                const currentText = cleanTextForMatching(items[j].text);
                if (!currentText) {
                    j++;
                    continue;
                }

                const currentLen = runeLength(currentText);
                const patternPart = substringRunes(
                    cleanPattern,
                    patternPos,
                    currentLen,
                );
                if (currentText === patternPart) {
                    matched.push(items[j]);
                    patternPos += currentLen;
                    j++;
                } else {
                    break;
                }
            }

            if (matched.length > 1 && patternPos >= runeLength(cleanPattern)) {
                result.push(mergeMatchedItems(matched, pattern, isKeyword));
                i = j;
            } else {
                result.push(items[i]);
                i++;
            }
        }
        return result;
    }

    /** ⑥ groupAdjacentTexts */
    private groupAdjacentTexts(
        items: ProcessedItem[],
        yTol: number,
        xTol: number,
    ): ProcessedItem[] {
        const groups: ProcessedItem[] = [];
        let current: ProcessedItem | null = null;
        let prevEndsWithColon = false;

        for (const item of items) {
            const curEndsWithColon =
                item.text.endsWith(":") || item.text === ":";
            const startNew =
                !current ||
                item.isKeyword ||
                current.isKeyword ||
                prevEndsWithColon ||
                curEndsWithColon ||
                Math.abs(current.centerY - item.centerY) >= yTol ||
                item.left - current.right >= xTol;

            if (startNew) {
                if (current) groups.push(current);
                current = { ...item };
            } else {
                current!.text += " " + item.text;
                current!.top = Math.min(current!.top, item.top);
                current!.bottom = Math.max(current!.bottom, item.bottom);
                current!.left = Math.min(current!.left, item.left);
                current!.right = Math.max(current!.right, item.right);
                current!.centerX = (current!.left + current!.right) / 2;
                current!.centerY = (current!.top + current!.bottom) / 2;
                current!.width = current!.right - current!.left;
                current!.height = current!.bottom - current!.top;
            }
            prevEndsWithColon = curEndsWithColon;
        }
        if (current) groups.push(current);
        return groups;
    }

    /** ⑦ processKeywords */
    private processKeywords(
        items: ProcessedItem[],
        keywords: Record<string, string[]>,
    ): ProcessedPage {
        const page: ProcessedPage = { keywordList: {}, valueList: [] };

        for (const item of items) {
            const cleanText = item.text.replace(/ /g, "");
            item.isKeyword = false;

            for (const [field, kwList] of Object.entries(keywords)) {
                if (field === "dummy") continue;
                for (const kw of kwList) {
                    const cleanKw = kw.replace(/ /g, "");
                    if (
                        cleanText === cleanKw ||
                        cleanText.startsWith(cleanKw)
                    ) {
                        item.text = cleanText.replace(/:$/, "");
                        item.isKeyword = true;
                        item.field = field;
                        break;
                    }
                }
                if (item.isKeyword) break;
            }

            if (item.isKeyword) {
                if (!page.keywordList[item.field])
                    page.keywordList[item.field] = [];
                page.keywordList[item.field].push(item);
            } else {
                page.valueList.push(item);
            }
        }
        return page;
    }
}

// ─── 헬퍼 함수 ───

/** 매칭용 텍스트를 정제한다 */
function cleanTextForMatching(text: string): string {
    text = text.trim();
    if (text === ":") return "";
    if (text.endsWith(":")) text = text.slice(0, -1);
    return text.replace(/ /g, "");
}

/** 유니코드 룬(rune) 기준 문자열 길이를 반환한다 */
function runeLength(s: string): number {
    return [...s].length;
}

/** 유니코드 룬 기준으로 부분 문자열을 추출한다 */
function substringRunes(s: string, start: number, length: number): string {
    const runes = [...s];
    return runes.slice(start, start + length).join("");
}

/** 일치한 항목들을 하나의 ProcessedItem으로 병합한다 */
function mergeMatchedItems(
    items: ProcessedItem[],
    text: string,
    isKeyword: boolean,
): ProcessedItem {
    let top = Infinity,
        left = Infinity,
        bottom = -Infinity,
        right = -Infinity;
    let slope = 0;

    for (const item of items) {
        top = Math.min(top, item.top);
        bottom = Math.max(bottom, item.bottom);
        left = Math.min(left, item.left);
        right = Math.max(right, item.right);
        if (item.slope !== 0) slope = item.slope;
    }

    return {
        text,
        isKeyword,
        field: "",
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
        top,
        bottom,
        left,
        right,
        width: right - left,
        height: bottom - top,
        slope,
    };
}
