/**
 * LLM 클라이언트 — Google Gemini 드라이버
 *
 * Gemini REST API (generateContent / streamGenerateContent) 호출
 */

import type {
    LlmClient,
    LlmProviderConfig,
    ChatRequest,
    ChatResponse,
    StreamChunk,
    EmbedRequest,
    EmbedResponse,
} from "../types/index.ts";

export class GeminiClient implements LlmClient {
    private readonly cfg: LlmProviderConfig;
    private readonly baseURL: string;
    private readonly timeout: number;

    /** GeminiClient 인스턴스를 초기화한다 */
    constructor(cfg: LlmProviderConfig) {
        this.cfg = cfg;
        this.baseURL = (
            cfg.base_url || "https://generativelanguage.googleapis.com/v1beta"
        ).replace(/\/+$/, "");
        this.timeout = (cfg.timeout_sec || 30) * 1000;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): string {
        return "gemini";
    }

    /** 클라이언트 리소스를 정리한다 */
    close(): void {
        /* no-op */
    }

    // ─── Chat ────────────────────────────────────────────────────────────

    /** 채팅 완성 API를 호출한다 */
    async chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
        const body = this.buildBody(req);
        const url = `${this.baseURL}/models/${this.cfg.model}:generateContent?key=${this.cfg.api_key}`;

        const resp = await this.doRequest(url, body, signal);

        const candidate = resp.candidates?.[0];
        const content =
            candidate?.content?.parts
                ?.map((p: { text?: string }) => p.text ?? "")
                .join("") ?? "";

        const chatResp: ChatResponse = {
            content,
            finishReason: candidate?.finishReason ?? "",
            model: this.cfg.model,
        };

        if (resp.usageMetadata) {
            chatResp.usage = {
                promptTokens: resp.usageMetadata.promptTokenCount ?? 0,
                completionTokens: resp.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: resp.usageMetadata.totalTokenCount ?? 0,
            };
        }

        return chatResp;
    }

    // ─── Stream ──────────────────────────────────────────────────────────

    /** 스트리밍 채팅 API를 호출한다 */
    async *chatStream(
        req: ChatRequest,
        signal?: AbortSignal,
    ): AsyncGenerator<StreamChunk> {
        const body = this.buildBody(req);
        const url = `${this.baseURL}/models/${this.cfg.model}:streamGenerateContent?key=${this.cfg.api_key}&alt=sse`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(
                `Gemini stream: status ${response.status}: ${text}`,
            );
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop()!;

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data: ")) continue;

                    try {
                        const event = JSON.parse(trimmed.slice(6));
                        const candidate = event.candidates?.[0];
                        const text =
                            candidate?.content?.parts
                                ?.map((p: { text?: string }) => p.text ?? "")
                                .join("") ?? "";
                        const finishReason = candidate?.finishReason;
                        const isDone =
                            finishReason === "STOP" ||
                            finishReason === "MAX_TOKENS";

                        const chunk: StreamChunk = {
                            content: text,
                            done: isDone,
                        };

                        if (isDone) {
                            chunk.finishReason = finishReason;
                        }
                        if (event.usageMetadata) {
                            chunk.usage = {
                                promptTokens:
                                    event.usageMetadata.promptTokenCount ?? 0,
                                completionTokens:
                                    event.usageMetadata.candidatesTokenCount ??
                                    0,
                                totalTokens:
                                    event.usageMetadata.totalTokenCount ?? 0,
                            };
                        }

                        yield chunk;
                        if (isDone) return;
                    } catch {
                        // JSON parse 실패 — 무시
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    // ─── Embed ───────────────────────────────────────────────────────────

    /** 텍스트 임베딩 API를 호출한다 */
    async embed(
        req: EmbedRequest,
        signal?: AbortSignal,
    ): Promise<EmbedResponse> {
        const model = req.model || this.cfg.embed_model || this.cfg.model;
        const url = `${this.baseURL}/models/${model}:embedContent?key=${this.cfg.api_key}`;

        // Gemini는 단일 텍스트 임베딩만 지원 → 배치 처리
        const embeddings: number[][] = [];
        let totalTokens = 0;

        for (const text of req.input) {
            const body = {
                model: `models/${model}`,
                content: { parts: [{ text }] },
            };

            const resp = await this.doRequest(url, body, signal);
            if (resp.embedding?.values) {
                embeddings.push(resp.embedding.values);
            }
        }

        return {
            embeddings,
            model,
            totalTokens,
        };
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /** 요청 바디를 구성한다 */
    private buildBody(req: ChatRequest): Record<string, unknown> {
        const contents: Array<{
            role: string;
            parts: Array<{ text: string }>;
        }> = [];

        // Gemini는 system role을 직접 지원하지 않으므로 user/model 쌍으로 변환
        if (req.system) {
            contents.push({ role: "user", parts: [{ text: req.system }] });
            contents.push({ role: "model", parts: [{ text: "Understood." }] });
        }

        for (const m of req.messages) {
            const role = m.role === "assistant" ? "model" : m.role;
            contents.push({ role, parts: [{ text: m.content }] });
        }

        const body: Record<string, unknown> = { contents };

        const generationConfig: Record<string, unknown> = {};
        const temp = req.temperature ?? this.cfg.temperature;
        if (temp != null && temp > 0) generationConfig.temperature = temp;

        const maxTokens = req.maxTokens ?? this.cfg.max_tokens;
        if (maxTokens != null && maxTokens > 0)
            generationConfig.maxOutputTokens = maxTokens;

        if (req.jsonMode || this.cfg.json_mode) {
            generationConfig.responseMimeType = "application/json";
        }

        if (Object.keys(generationConfig).length > 0) {
            body.generationConfig = generationConfig;
        }

        return body;
    }

    /** API 요청을 실행하고 응답을 파싱한다 */
    private async doRequest(
        url: string,
        body: unknown,
        signal?: AbortSignal,
    ): Promise<any> {
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        const text = await resp.text();
        if (!resp.ok) {
            throw new Error(`Gemini: status ${resp.status}: ${text}`);
        }

        return JSON.parse(text);
    }
}
