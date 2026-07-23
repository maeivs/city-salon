/**
 * LLM 클라이언트 — Ollama 로컬 LLM 드라이버
 *
 * Ollama /api/chat, /api/embeddings API 호출
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

export class OllamaClient implements LlmClient {
    private readonly cfg: LlmProviderConfig;
    private readonly baseURL: string;
    private readonly timeout: number;

    /** OllamaClient 인스턴스를 초기화한다 */
    constructor(cfg: LlmProviderConfig) {
        this.cfg = cfg;
        this.baseURL = (cfg.base_url || "http://localhost:11434").replace(
            /\/+$/,
            "",
        );
        this.timeout = (cfg.timeout_sec || 120) * 1000;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): string {
        return "ollama";
    }

    /** 클라이언트 리소스를 정리한다 */
    close(): void {
        /* no-op */
    }

    // ─── Chat ────────────────────────────────────────────────────────────

    /** 채팅 완성 API를 호출한다 */
    async chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
        const body = this.buildBody(req, false);

        const resp = await fetch(`${this.baseURL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        const text = await resp.text();
        if (!resp.ok) {
            throw new Error(`Ollama: status ${resp.status}: ${text}`);
        }

        const result: OllamaChatResponse = JSON.parse(text);
        const chatResp: ChatResponse = {
            content: result.message?.content ?? "",
            finishReason: result.done_reason ?? "",
            model: result.model ?? this.cfg.model,
        };

        if (result.eval_count > 0 || result.prompt_eval_count > 0) {
            chatResp.usage = {
                promptTokens: result.prompt_eval_count ?? 0,
                completionTokens: result.eval_count ?? 0,
                totalTokens:
                    (result.prompt_eval_count ?? 0) + (result.eval_count ?? 0),
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

        const resp = await fetch(`${this.baseURL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Ollama stream: status ${resp.status}: ${text}`);
        }

        const reader = resp.body!.getReader();
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
                    if (!line.trim()) continue;

                    try {
                        const event: OllamaChatResponse = JSON.parse(line);

                        const chunk: StreamChunk = {
                            content: event.message?.content ?? "",
                            done: event.done ?? false,
                        };

                        if (event.done) {
                            chunk.finishReason = event.done_reason ?? "stop";
                            if (
                                event.eval_count > 0 ||
                                event.prompt_eval_count > 0
                            ) {
                                chunk.usage = {
                                    promptTokens: event.prompt_eval_count ?? 0,
                                    completionTokens: event.eval_count ?? 0,
                                    totalTokens:
                                        (event.prompt_eval_count ?? 0) +
                                        (event.eval_count ?? 0),
                                };
                            }
                        }

                        yield chunk;
                        if (event.done) return;
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

        // Ollama는 단일 텍스트 임베딩만 지원
        const input = req.input.length > 0 ? req.input[0] : "";
        const body = { model, prompt: input };

        const resp = await fetch(`${this.baseURL}/api/embeddings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        const text = await resp.text();
        if (!resp.ok) {
            throw new Error(`Ollama embed: status ${resp.status}: ${text}`);
        }

        const result = JSON.parse(text);

        return {
            embeddings: result.embedding ? [result.embedding] : [],
            model,
            totalTokens: 0,
        };
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /** 요청 바디를 구성한다 */
    private buildBody(
        req: ChatRequest,
        stream: boolean,
    ): Record<string, unknown> {
        const model = this.cfg.model || "llama3";
        const messages: Array<{ role: string; content: string }> = [];

        if (req.system) {
            messages.push({ role: "system", content: req.system });
        }
        for (const m of req.messages) {
            messages.push({ role: m.role, content: m.content });
        }

        const body: Record<string, unknown> = {
            model,
            messages,
            stream,
        };

        const options: Record<string, unknown> = {};
        const temp = req.temperature ?? this.cfg.temperature;
        if (temp != null && temp > 0) options.temperature = temp;

        const maxTokens = req.maxTokens ?? this.cfg.max_tokens;
        if (maxTokens != null && maxTokens > 0) options.num_predict = maxTokens;

        if (Object.keys(options).length > 0) {
            body.options = options;
        }

        if (req.jsonMode || this.cfg.json_mode) {
            body.format = "json";
        }

        return body;
    }
}

// ─── Response types ──────────────────────────────────────────────────────────

interface OllamaChatResponse {
    model: string;
    done: boolean;
    done_reason?: string;
    message?: { role: string; content: string };
    prompt_eval_count: number;
    eval_count: number;
}
