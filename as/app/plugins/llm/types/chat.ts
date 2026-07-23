import type { LlmProviderConfig } from "./config.ts";

export interface Message {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatRequest {
    messages: Message[];
    system?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    jsonMode?: boolean;
    stop?: string[];
}

export interface ChatResponse {
    content: string;
    finishReason: string;
    model: string;
    usage?: TokenUsage;
    cached?: boolean;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface StreamChunk {
    content: string;
    done: boolean;
    finishReason?: string;
    usage?: TokenUsage;
}

export interface EmbedRequest {
    input: string[];
    model?: string;
}

export interface EmbedResponse {
    embeddings: number[][];
    model: string;
    totalTokens: number;
}

export interface LlmClient {
    name(): string;
    chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
    chatStream(
        req: ChatRequest,
        signal?: AbortSignal,
    ): AsyncGenerator<StreamChunk>;
    embed(req: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse>;
    close(): void;
}

export interface Provider {
    name: string;
    client: LlmClient;
    config: LlmProviderConfig;
    rateLimiter: RateLimiter;
}

export interface RateLimiter {
    tryAcquire(): boolean;
}

export type ChatOption = (req: ChatRequest) => void;

export function withSystem(system: string): ChatOption {
    return (req) => {
        req.system = system;
    };
}

export function withTemperature(temp: number): ChatOption {
    return (req) => {
        req.temperature = temp;
    };
}

export function withMaxTokens(n: number): ChatOption {
    return (req) => {
        req.maxTokens = n;
    };
}

export function withJsonMode(): ChatOption {
    return (req) => {
        req.jsonMode = true;
    };
}
