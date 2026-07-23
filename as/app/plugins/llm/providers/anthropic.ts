/**
 * LLM 클라이언트 — Anthropic (Claude) 드라이버
 *
 * Anthropic Messages API (2023-06-01+) 호출
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

export class AnthropicClient implements LlmClient {
    private readonly cfg: LlmProviderConfig;
    private readonly baseURL: string;
    private readonly timeout: number;

    /** AnthropicClient 인스턴스를 초기화한다 */
    constructor(cfg: LlmProviderConfig) {
        this.cfg = cfg;
        this.baseURL = (cfg.base_url || "https://api.anthropic.com").replace(
            /\/+$/,
            "",
        );
        this.timeout = (cfg.timeout_sec || 60) * 1000;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): string {
        return "anthropic";
    }

    /** 클라이언트 리소스를 정리한다 */
    close(): void {
        /* no-op */
    }

    // ─── Chat ────────────────────────────────────────────────────────────

    /** 채팅 완성 API를 호출한다 */
    async chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
        const body = this.buildBody(req, false);
        const resp = await this.doRequest("/v1/messages", body, signal);

        const content =
            resp.content
                ?.filter((b: { type: string }) => b.type === "text")
                .map((b: { text: string }) => b.text)
                .join("") ?? "";

        const chatResp: ChatResponse = {
            content,
            finishReason: resp.stop_reason ?? "",
            model: resp.model ?? this.cfg.model,
        };

        if (resp.usage) {
            chatResp.usage = {
                promptTokens: resp.usage.input_tokens ?? 0,
                completionTokens: resp.usage.output_tokens ?? 0,
                totalTokens:
                    (resp.usage.input_tokens ?? 0) +
                    (resp.usage.output_tokens ?? 0),
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
        const response = await fetch(`${this.baseURL}/v1/messages`, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(
                `Anthropic stream: status ${response.status}: ${text}`,
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

                        if (event.type === "content_block_delta") {
                            yield {
                                content: event.delta?.text ?? "",
                                done: false,
                            };
                        } else if (event.type === "message_delta") {
                            const chunk: StreamChunk = {
                                content: "",
                                done: true,
                                finishReason:
                                    event.delta?.stop_reason ?? "end_turn",
                            };
                            if (event.usage) {
                                chunk.usage = {
                                    promptTokens: 0,
                                    completionTokens:
                                        event.usage.output_tokens ?? 0,
                                    totalTokens: event.usage.output_tokens ?? 0,
                                };
                            }
                            yield chunk;
                            return;
                        } else if (event.type === "message_stop") {
                            yield { content: "", done: true };
                            return;
                        }
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

    /** 텍스트 임베딩 API를 호출한다 (Anthropic 미지원) */
    async embed(
        _req: EmbedRequest,
        _signal?: AbortSignal,
    ): Promise<EmbedResponse> {
        // Anthropic은 임베딩 API를 제공하지 않음
        throw new Error(
            "Anthropic does not support embeddings. Use OpenAI or Gemini provider.",
        );
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /** 요청 헤더를 구성한다 */
    private buildHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "x-api-key": this.cfg.api_key ?? "",
            "anthropic-version": "2023-06-01",
        };
    }

    /** 요청 바디를 구성한다 */
    private buildBody(
        req: ChatRequest,
        stream: boolean,
    ): Record<string, unknown> {
        const messages: Array<{ role: string; content: string }> = [];

        for (const m of req.messages) {
            // Anthropic API는 system 메시지를 별도 필드로 받으므로 messages에서 제외
            if (m.role === "system") continue;
            messages.push({ role: m.role, content: m.content });
        }

        const body: Record<string, unknown> = {
            model: this.cfg.model,
            messages,
            stream,
        };

        if (req.system) {
            body.system = req.system;
        }

        const maxTokens = req.maxTokens ?? this.cfg.max_tokens ?? 8096;
        body.max_tokens = maxTokens;

        const temp = req.temperature ?? this.cfg.temperature;
        if (temp != null && temp > 0) body.temperature = temp;

        const topP = req.topP ?? this.cfg.top_p;
        if (topP != null && topP > 0) body.top_p = topP;

        if (req.stop?.length) body.stop_sequences = req.stop;

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
            throw new Error(`Anthropic: status ${resp.status}: ${text}`);
        }

        return JSON.parse(text);
    }
}
