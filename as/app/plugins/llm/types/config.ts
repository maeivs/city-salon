export interface LlmConfig {
    enabled?: boolean;
    default: string;
    usage_tracking: boolean;
    providers: Record<string, LlmProviderConfig>;
    quota?: LlmQuotaConfig;
    rag?: LlmRAGConfig;
    cache?: LlmCacheConfig;
}

export interface LlmProviderConfig {
    driver: string; // LLM 드라이버 종류: cloud=openai|anthropic|gemini|azure_openai|groq|together|deepseek|mistral|perplexity, local=ollama|vllm|localai|lmstudio|llamacpp|koboldcpp|text_generation_webui|jan|xinference|tabbyapi|openwebui
    api_key?: string;
    base_url?: string;
    api_version?: string; // Azure OpenAI 전용: API 버전 (예: "2024-12-01-preview")
    model: string;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    json_mode?: boolean;
    timeout_sec?: number;
    rate_limit_rpm?: number;
    embed_model?: string;
    description?: string;
}

export interface LlmQuotaConfig {
    daily_token_limit?: number;
    monthly_token_limit?: number;
    notify?: string[]; // log | smtp | alimtalk
}

export interface LlmRAGConfig {
    enabled?: boolean;
    embed_provider?: string;
    default_chunk_size?: number;
    default_chunk_overlap?: number;
    default_top_k?: number;
    default_min_score?: number;
}

export interface LlmCacheConfig {
    enabled: boolean;
    ttl_seconds: number;
    max_entries?: number;
    exclude_providers?: string[];
}
