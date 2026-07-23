/**
 * LLM 클라이언트 — Azure OpenAI 드라이버
 *
 * Azure OpenAI Service와의 차이점:
 *  - 인증: `Authorization: Bearer` 대신 `api-key: <key>` 헤더 사용
 *  - URL 구조: `<base_url>/openai/deployments/<model>/chat/completions?api-version=<version>`
 *  - 임베딩 URL: `<base_url>/openai/deployments/<embed_model>/embeddings?api-version=<version>`
 *
 * 설정 예시:
 *  {
 *    "driver": "azure_openai",
 *    "api_key": "${LLM_AZURE_API_KEY}",
 *    "base_url": "https://<resource>.openai.azure.com",
 *    "model": "<chat-deployment-name>",
 *    "embed_model": "<embedding-deployment-name>",
 *    "api_version": "2024-12-01-preview",
 *    "max_tokens": 4096,
 *    "temperature": 0.1
 *  }
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

export class AzureOpenAIClient implements LlmClient {
    private readonly cfg: LlmProviderConfig;
    private readonly baseURL: string;
    private readonly apiVersion: string;
    private readonly timeout: number;

    constructor(cfg: LlmProviderConfig) {
        this.cfg = cfg;
        this.baseURL = (cfg.base_url ?? "").replace(/\/+$/, "");
        this.apiVersion = cfg.api_version ?? "2024-12-01-preview";
        this.timeout = (cfg.timeout_sec ?? 60) * 1000;
    }

    name(): string {
        return "azure_openai";
    }

    close(): void {
        /* no-op */
    }

    // ─── Chat ────────────────────────────────────────────────────────────

    async chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
        const body = this.buildBody(req, false);
        const resp = await this.doRequest(
            "chat/completions",
            this.cfg.model,
            body,
            signal,
        );

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

    async *chatStream(
        req: ChatRequest,
        signal?: AbortSignal,
    ): AsyncGenerator<StreamChunk> {
        const body = this.buildBody(req, true);
        const url = this.buildURL("chat/completions", this.cfg.model);

        const response = await fetch(url, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(
                `Azure OpenAI stream: status ${response.status}: ${text}`,
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

                        if (isDone) chunk.finishReason = finishReason;
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

    async embed(
        req: EmbedRequest,
        signal?: AbortSignal,
    ): Promise<EmbedResponse> {
        const deployment = req.model || this.cfg.embed_model || this.cfg.model;
        const body = { input: req.input, model: deployment };

        const resp = await this.doRequest(
            "embeddings",
            deployment,
            body,
            signal,
        );

        const embeddings: number[][] = (resp.data ?? []).map(
            (d: { embedding: number[] }) => d.embedding,
        );

        return {
            embeddings,
            model: resp.model ?? deployment,
            totalTokens: resp.usage?.total_tokens ?? 0,
        };
    }

    // ─── Internal ────────────────────────────────────────────────────────

    /** Azure 전용 인증 헤더를 구성한다 (api-key) */
    private buildHeaders(): Record<string, string> {
        const h: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.cfg.api_key) {
            h["api-key"] = this.cfg.api_key;
        }
        return h;
    }

    /**
     * Azure 엔드포인트 URL을 구성한다.
     * 형식: `<base_url>/openai/deployments/<deployment>/<operation>?api-version=<version>`
     */
    private buildURL(operation: string, deployment: string): string {
        return `${this.baseURL}/openai/deployments/${deployment}/${operation}?api-version=${this.apiVersion}`;
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

        // Azure는 body에 model 필드 불필요 (deployment가 URL에 포함됨)
        const body: Record<string, unknown> = { messages, stream };

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
        operation: string,
        deployment: string,
        body: unknown,
        signal?: AbortSignal,
    ): Promise<any> {
        const url = this.buildURL(operation, deployment);
        const resp = await fetch(url, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(this.timeout),
        });

        const text = await resp.text();
        if (!resp.ok) {
            throw new Error(`Azure OpenAI: status ${resp.status}: ${text}`);
        }

        return JSON.parse(text);
    }
}
