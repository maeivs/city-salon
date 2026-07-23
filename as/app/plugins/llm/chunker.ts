/**
 * 텍스트 청킹 로직 (plain / markdown 지원)
 *
 * Go entity-server internal/llm/chunker.go 기반 TypeScript 포팅
 */

export class Chunker {
    readonly chunkSize: number;
    readonly chunkOverlap: number;

    /** Chunker 인스턴스를 초기화한다 */
    constructor(chunkSize = 500, chunkOverlap = 50) {
        if (chunkSize <= 0) chunkSize = 500;
        if (chunkOverlap < 0) chunkOverlap = 0;
        if (chunkOverlap >= chunkSize) chunkOverlap = Math.floor(chunkSize / 5);

        this.chunkSize = chunkSize;
        this.chunkOverlap = chunkOverlap;
    }

    /**
     * contentType에 따라 적절한 방식으로 텍스트를 분할합니다.
     * "text/markdown" → 마크다운 헤더 기준 분할
     * 그 외 → 슬라이딩 윈도우 분할
     */
    chunk(text: string, contentType?: string): string[] {
        text = text.trim();
        if (!text) return [];

        if (contentType?.includes("markdown")) {
            return this.chunkMarkdown(text);
        }
        return this.chunkPlain(text);
    }

    /** 일반 텍스트를 슬라이딩 윈도우 방식으로 분할 */
    private chunkPlain(text: string): string[] {
        const chars = [...text]; // Unicode safe
        const total = chars.length;
        if (total === 0) return [];

        const chunks: string[] = [];
        const step = Math.max(this.chunkSize - this.chunkOverlap, 1);

        for (let start = 0; start < total; start += step) {
            const end = Math.min(start + this.chunkSize, total);
            const chunk = chars.slice(start, end).join("").trim();
            if (chunk) chunks.push(chunk);
            if (end === total) break;
        }

        return chunks;
    }

    /** 마크다운 문서를 헤더(#, ##, ###, ####) 기준으로 분할 */
    private chunkMarkdown(text: string): string[] {
        const lines = text.split("\n");
        const sections: string[] = [];
        let current: string[] = [];

        for (const line of lines) {
            if (isMarkdownHeader(line) && current.length > 0) {
                sections.push(current.join("\n").trim());
                current = [];
            }
            current.push(line);
        }
        if (current.length > 0) {
            sections.push(current.join("\n").trim());
        }

        const chunks: string[] = [];
        for (const sec of sections) {
            const runeLen = [...sec].length;
            if (runeLen <= this.chunkSize) {
                if (sec) chunks.push(sec);
            } else {
                // 긴 섹션은 plain 방식으로 추가 분할
                chunks.push(...this.chunkPlain(sec));
            }
        }

        return chunks;
    }
}

/** 마크다운 헤더 여부를 판별한다 */
function isMarkdownHeader(line: string): boolean {
    const trimmed = line.trim();
    return (
        trimmed.startsWith("# ") ||
        trimmed.startsWith("## ") ||
        trimmed.startsWith("### ") ||
        trimmed.startsWith("#### ")
    );
}
