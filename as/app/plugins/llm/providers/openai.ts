/**
 * LLM 클라이언트 — OpenAI 드라이버
 *
 * OpenAI Chat Completions / Embeddings API 호출.
 * vllm, localai, lmstudio, llamacpp 등 OpenAI-호환 서버도 이 드라이버로 동작합니다.
 */

import type {
    LlmClient,
    LlmProviderConfig,
    ChatRequest,
    ChatResponse,
    StreamChunk,
    TokenUsage,
    EmbedRequest,
    EmbedResponse,
} from "../types/index.ts";

export class OpenAIClient implements LlmClient {
    private readonly cfg: LlmProviderConfig;
    private readonly baseURL: string;
    private readonly timeout: number;

    /** OpenAIClient 인스턴스를 초기화한다 */
    constructor(cfg: LlmProviderConfig) {
        this.cfg = cfg;
        this.baseURL = (cfg.base_url || "https://api.openai.com").replace(
            /\/+$/,
            "",
        );
        this.timeout = (cfg.timeout_sec || 30) * 1000;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): string {
        return this.cfg.driver || "openai";
    }

    /** 클라이언트 리소스를 정리한다 */
    close(): void {
        /* no-op */
    }

    // ─── Chat ────────────────────────────────────────────────────────────

    /** 채팅 완성 API를 호출한다 */
    async chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
        const body = this.buildBody(req, false);
        const resp = await this.doRequest("/v1/chat/completions", body, signal);

        const choice = resp.choices?.[0];
        const chatResp: ChatResponse = {
            content: choice?.message?.content ?? "",
            finishReason: choice?.finish_reason ?? "",
            model: resp.model ?? this.cfg.model,
        };

        if (resp.usage) {
            chatResp.usage = {
                promptTokens: resp.usage.prompt_tokens ?? 0,
                completionTokens: resp.usage.completion_tokens ?? 0,
                totalTokens: resp.usage.total_tokens ?? 0,
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
        const body = this.buildBody(req, true);
        const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(
                `OpenAI stream: status ${response.status}: ${text}`,
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
                    const data = trimmed.slice(6);
                    if (data === "[DONE]") {
                        yield { content: "", done: true };
                        return;
                    }

                    try {
                        const event = JSON.parse(data);
                        const delta = event.choices?.[0]?.delta;
                        const finishReason = event.choices?.[0]?.finish_reason;
                        const isDone =
                            finishReason != null && finishReason !== "";

                        const chunk: StreamChunk = {
                            content: delta?.content ?? "",
                            done: isDone,
                        };

                        if (isDone) {
                            chunk.finishReason = finishReason;
                        }
                        if (event.usage) {
                            chunk.usage = {
                                promptTokens: event.usage.prompt_tokens ?? 0,
                                completionTokens:
                                    event.usage.completion_tokens ?? 0,
                                totalTokens: event.usage.total_tokens ?? 0,
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
        const body = { input: req.input, model };

        const resp = await this.doRequest("/v1/embeddings", body, signal);

        const embeddings: number[][] = (resp.data ?? []).map(
            (d: { embedding: number[] }) => d.embedding,
        );

        return {
            embeddings,
            model: resp.model ?? model,
            totalTokens: resp.usage?.total_tokens ?? 0,
        };
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /** 요청 헤더를 구성한다 */
    private buildHeaders(): Record<string, string> {
        const h: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.cfg.api_key) {
            h["Authorization"] = `Bearer ${this.cfg.api_key}`;
        }
        return h;
    }

    /** 요청 바디를 구성한다 */
    private buildBody(
        req: ChatRequest,
        stream: boolean,
    ): Record<string, unknown> {
        const messages: Array<{ role: string; content: string }> = [];

        if (req.system) {
            messages.push({ role: "system", content: req.system });
        }
        for (const m of req.messages) {
            messages.push({ role: m.role, content: m.content });
        }

        const body: Record<string, unknown> = {
            model: this.cfg.model,
            messages,
            stream,
        };

        const temp = req.temperature ?? this.cfg.temperature;
        if (temp != null && temp > 0) body.temperature = temp;

        const maxTokens = req.maxTokens ?? this.cfg.max_tokens;
        if (maxTokens != null && maxTokens > 0) body.max_tokens = maxTokens;

        const topP = req.topP ?? this.cfg.top_p;
        if (topP != null && topP > 0) body.top_p = topP;

        if (req.jsonMode || this.cfg.json_mode) {
            body.response_format = { type: "json_object" };
        }

        if (req.stop?.length) body.stop = req.stop;
        if (stream) body.stream_options = { include_usage: true };

        return body;
    }

    /** API 요청을 실행하고 응답을 파싱한다 */
    private async doRequest(
        path: string,
        body: unknown,
        signal?: AbortSignal,
    ): Promise<any> {
        const resp = await fetch(`${this.baseURL}${path}`, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        const text = await resp.text();
        if (!resp.ok) {
            throw new Error(`OpenAI: status ${resp.status}: ${text}`);
        }

        return JSON.parse(text);
    }
}
