/**
 * LLM Service — 프로바이더 풀 관리 + Chat/Stream/Embed/Session/RAG
 *
 * Go entity-server internal/llm/service.go + chat.go + session.go + embed.go + rag.go 기반 포팅
 */

import { logger } from "@system/api";
import type {
    LlmConfig,
    LlmProviderConfig,
    Provider,
    RateLimiter,
    LlmClient,
    ChatRequest,
    ChatResponse,
    ChatOption,
    StreamChunk,
    TokenUsage,
    EmbedResponse,
    Message,
    ConversationStore,
    ConversationResponse,
    DocumentStore,
    RAGOptions,
    RAGResponse,
    SearchResult,
    UsageQuerier,
    LlmUsageRecord,
    ProfileStore,
} from "./types/index.ts";
import type { ChatbotStore, ChatbotChatResponse } from "./types/chatbot.ts";
import { createClient } from "./providers/index.ts";
import {
    CacheStats,
    MemoryCacheStore,
    generateCacheKey,
    type CacheKeyInput,
} from "./cache.ts";
import {
    loadTemplate,
    listTemplates,
    renderTemplate,
    validateVars,
    type LlmPromptTemplate,
    type RenderedTemplate,
} from "./template-loader.ts";

// ─── Token-Bucket Rate Limiter ───────────────────────────────────────────────

class TokenBucketLimiter implements RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private readonly maxTokens: number;
    private readonly refillRate: number; // tokens per ms

    /** TokenBucketLimiter를 초기화한다 */
    constructor(rpm: number) {
        this.maxTokens = rpm;
        this.tokens = rpm;
        this.refillRate = rpm / 60_000;
        this.lastRefill = Date.now();
    }

    /** 토큰 확보를 시도한다 */
    tryAcquire(): boolean {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }
        return false;
    }

    /** 토큰을 보충한다 */
    private refill(): void {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        this.tokens = Math.min(
            this.maxTokens,
            this.tokens + elapsed * this.refillRate,
        );
        this.lastRefill = now;
    }
}

class InfiniteRateLimiter implements RateLimiter {
    /** 항상 허용하는 무제한 리밋터 */
    tryAcquire(): boolean {
        return true;
    }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class LlmService {
    private readonly config: LlmConfig;
    private readonly providers: Map<string, Provider>;
    private cache: MemoryCacheStore | null = null;
    private readonly cacheStats = new CacheStats();

    /** 외부에서 주입 */
    convStore: ConversationStore | null = null;
    docStore: DocumentStore | null = null;
    usageQuerier: UsageQuerier | null = null;
    chatbotStore: ChatbotStore | null = null;
    profileStore: ProfileStore | null = null;

    /** LlmService를 설정과 프로바이더 클라이언트로 초기화한다 */
    constructor(config: LlmConfig) {
        this.config = config;
        this.providers = new Map();

        // 프로바이더 초기화
        for (const [name, cfg] of Object.entries(config.providers)) {
            try {
                const client = createClient(cfg);
                const rpm = cfg.rate_limit_rpm ?? 0;
                const limiter: RateLimiter =
                    rpm > 0
                        ? new TokenBucketLimiter(rpm)
                        : new InfiniteRateLimiter();

                this.providers.set(name, {
                    name,
                    client,
                    config: cfg,
                    rateLimiter: limiter,
                });
                logger.info(
                    `LLM provider registered: ${name} (${cfg.driver}/${cfg.model})`,
                );
            } catch (err) {
                logger.error({ err }, `Failed to create LLM provider: ${name}`);
            }
        }

        // 캐시 초기화
        if (config.cache?.enabled) {
            this.cache = new MemoryCacheStore(config.cache.max_entries);
            logger.info(
                "LLM response cache enabled (TTL=%ds)",
                config.cache.ttl_seconds,
            );
        }
    }

    // ─── Getters ─────────────────────────────────────────────────────────

    /** LLM 설정을 반환한다 */
    getConfig(): LlmConfig {
        return this.config;
    }

    /** 등록된 프로바이더 맵을 반환한다 */
    getProviders(): Map<string, Provider> {
        return this.providers;
    }

    /** 기본 프로바이더 이름을 반환한다 */
    defaultProviderName(): string {
        return this.config.default;
    }

    /** 이름으로 프로바이더를 조회한다 */
    private getProvider(name?: string): Provider {
        const key = name || this.config.default;
        const p = this.providers.get(key);
        if (!p) throw new Error(`LLM provider "${key}" not found`);
        return p;
    }

    // ─── Chat ────────────────────────────────────────────────────────────

    /** 채팅 완성을 실행한다 */
    async chat(
        providerName: string | undefined,
        req: ChatRequest,
        ...opts: ChatOption[]
    ): Promise<ChatResponse> {
        for (const o of opts) o(req);

        const provider = this.getProvider(providerName);

        // 캐시 조회
        let cacheKey: string | null = null;
        if (this.cache && this.config.cache?.enabled) {
            const excluded = this.config.cache.exclude_providers?.includes(
                provider.name,
            );
            if (!excluded) {
                cacheKey = generateCacheKey({
                    provider: provider.name,
                    model: provider.config.model,
                    messages: req.messages,
                    system: req.system,
                    temperature: req.temperature,
                    maxTokens: req.maxTokens,
                    jsonMode: req.jsonMode,
                });

                const cached = this.cache.get(cacheKey);
                if (cached.found) {
                    try {
                        const resp: ChatResponse = JSON.parse(cached.value);
                        resp.cached = true;
                        this.cacheStats.recordHit();
                        return resp;
                    } catch {
                        /* parse 실패 → 캐시 미스 처리 */
                    }
                }
                this.cacheStats.recordMiss();
            }
        }

        // Rate limit
        if (!provider.rateLimiter.tryAcquire()) {
            throw new Error(
                `LLM rate limit exceeded for provider "${provider.name}"`,
            );
        }

        const start = Date.now();
        try {
            const resp = await provider.client.chat(req);
            const elapsed = Date.now() - start;

            // 비동기 사용량 기록
            this.recordUsageAsync(
                provider.name,
                provider.config.model,
                resp,
                elapsed,
                "success",
            );

            // 캐시 저장
            if (cacheKey && resp.finishReason === "stop") {
                const ttlMs = (this.config.cache?.ttl_seconds ?? 3600) * 1000;
                this.cache!.set(cacheKey, JSON.stringify(resp), ttlMs);
            }

            return resp;
        } catch (err) {
            const elapsed = Date.now() - start;
            this.recordUsageAsync(
                provider.name,
                provider.config.model,
                null,
                elapsed,
                "error",
            );
            throw err;
        }
    }

    // ─── Chat Stream ─────────────────────────────────────────────────────

    /** 스트리밍 채팅을 실행한다 */
    async *chatStream(
        providerName: string | undefined,
        req: ChatRequest,
        ...opts: ChatOption[]
    ): AsyncGenerator<StreamChunk> {
        for (const o of opts) o(req);

        const provider = this.getProvider(providerName);

        if (!provider.rateLimiter.tryAcquire()) {
            throw new Error(
                `LLM rate limit exceeded for provider "${provider.name}"`,
            );
        }

        const stream = provider.client.chatStream(req);
        let lastUsage: TokenUsage | undefined;

        for await (const chunk of stream) {
            if (chunk.usage) lastUsage = chunk.usage;
            yield chunk;
            if (chunk.done) break;
        }

        // 스트리밍 완료 후 사용량 기록
        if (lastUsage) {
            this.recordUsageFromTokensAsync(
                provider.name,
                provider.config.model,
                lastUsage,
                "success",
            );
        }
    }

    // ─── Simple Chat ─────────────────────────────────────────────────────

    /** 단일 메시지로 간편 채팅한다 */
    async simpleChat(
        providerName: string | undefined,
        system: string,
        user: string,
        ...opts: ChatOption[]
    ): Promise<string> {
        const req: ChatRequest = {
            system,
            messages: [{ role: "user", content: user }],
        };
        const resp = await this.chat(providerName, req, ...opts);
        return resp.content;
    }

    // ─── Template Chat ────────────────────────────────────────────────────

    /**
     * 프롬프트 템플릿을 로드해 변수를 주입하고 chat을 실행한다.
     *
     * @param templateName  templates/llm/prompts/{name}.json 의 name
     * @param vars          {{variable}} 치환에 사용할 변수 맵
     * @param providerName  사용할 LLM 프로바이더 (생략 시 default)
     * @param userMessage   user_msg 템플릿을 무시하고 직접 전달할 사용자 메시지 (선택)
     */
    async chatWithTemplate(
        templateName: string,
        vars: Record<string, string>,
        providerName?: string,
        userMessage?: string,
    ): Promise<{
        content: string;
        model: string;
        template: string;
        missing?: string[];
    }> {
        const tpl = loadTemplate(templateName);
        if (!tpl) throw new Error(`LLM template "${templateName}" not found`);

        const missing = validateVars(tpl, vars);
        const rendered = renderTemplate(tpl, vars);

        const userContent = userMessage ?? rendered.userMsg;
        if (!userContent) {
            throw new Error(
                `Template "${templateName}" has no user_msg — provide "message" in request body`,
            );
        }

        const req: ChatRequest = {
            system: rendered.system,
            messages: [{ role: "user", content: userContent }],
            maxTokens: rendered.maxTokens,
            temperature: rendered.temperature,
        };

        const resp = await this.chat(providerName, req);
        return {
            content: resp.content,
            model: resp.model ?? "",
            template: templateName,
            missing: missing.length > 0 ? missing : undefined,
        };
    }

    /**
     * 프롬프트 템플릿 기반 스트리밍 채팅을 실행한다.
     */
    async *chatStreamWithTemplate(
        templateName: string,
        vars: Record<string, string>,
        providerName?: string,
        userMessage?: string,
    ): AsyncGenerator<StreamChunk> {
        const tpl = loadTemplate(templateName);
        if (!tpl) throw new Error(`LLM template "${templateName}" not found`);

        const rendered = renderTemplate(tpl, vars);
        const userContent = userMessage ?? rendered.userMsg;
        if (!userContent) {
            throw new Error(
                `Template "${templateName}" has no user_msg — provide "message" in request body`,
            );
        }

        const req: ChatRequest = {
            system: rendered.system,
            messages: [{ role: "user", content: userContent }],
            maxTokens: rendered.maxTokens,
            temperature: rendered.temperature,
        };

        yield* this.chatStream(providerName, req);
    }

    /**
     * 사용 가능한 템플릿 목록을 반환한다.
     */
    getTemplateList(): Array<{
        name: string;
        label?: string;
        variables?: string[];
    }> {
        return listTemplates().map((name) => {
            const tpl = loadTemplate(name);
            return {
                name,
                label: tpl?.label,
                variables: tpl?.variables,
            };
        });
    }

    // ─── Embed ───────────────────────────────────────────────────────────

    /** 텍스트 임베딩을 실행한다 */
    async embed(
        providerName: string | undefined,
        input: string[],
    ): Promise<EmbedResponse> {
        const provider = this.getProvider(providerName);
        if (!provider.rateLimiter.tryAcquire()) {
            throw new Error(
                `LLM rate limit exceeded for provider "${provider.name}"`,
            );
        }

        return provider.client.embed({
            input,
            model: provider.config.embed_model || provider.config.model,
        });
    }

    /** 단일 텍스트의 임베딩 벡터를 반환한다 */
    async embedOne(
        providerName: string | undefined,
        text: string,
    ): Promise<number[]> {
        const resp = await this.embed(providerName, [text]);
        if (resp.embeddings.length === 0)
            throw new Error("No embedding returned");
        return resp.embeddings[0];
    }

    // ─── Session Chat ────────────────────────────────────────────────────

    /** 대화 세션 컨텍스트로 채팅한다 */
    async chatInSession(
        providerName: string | undefined,
        conversationSeq: number,
        userMsg: string,
        userSeq?: number,
        ...opts: ChatOption[]
    ): Promise<ConversationResponse> {
        if (!this.convStore)
            throw new Error("Conversation store not configured");

        const provider = this.getProvider(providerName);
        if (!provider.rateLimiter.tryAcquire()) {
            throw new Error(
                `LLM rate limit exceeded for provider "${provider.name}"`,
            );
        }

        let messages: Message[] = [];
        let systemMsg = "";
        let convSeq = conversationSeq;

        if (conversationSeq > 0) {
            // 기존 세션: 히스토리 로드
            const conv = await this.convStore.getConversation(conversationSeq);
            messages = conv.messages;
            systemMsg = conv.systemMsg ?? "";
        } else {
            // 새 세션 생성
            convSeq = await this.convStore.createConversation({
                providerName: provider.name,
                title: truncate(userMsg, 100),
                userSeq,
            });
        }

        messages.push({ role: "user", content: userMsg });

        // Profile Memory 주입
        if (this.profileStore && userSeq) {
            const profileText = await this.profileStore
                .formatForPrompt({ userSeq })
                .catch(() => "");
            if (profileText) {
                systemMsg = systemMsg
                    ? `${systemMsg}\n\n${profileText}`
                    : profileText;
            }
        }

        const req: ChatRequest = {
            system: systemMsg,
            messages,
            maxTokens: provider.config.max_tokens,
            temperature: provider.config.temperature,
        };
        for (const o of opts) o(req);

        const start = Date.now();
        const resp = await provider.client.chat(req);
        const elapsed = Date.now() - start;

        const newMessages: Message[] = [
            { role: "user", content: userMsg },
            { role: "assistant", content: resp.content },
        ];

        // 비동기 히스토리 저장
        this.convStore
            .appendMessages(convSeq, newMessages, resp.usage)
            .catch((err) =>
                logger.error({ err }, "Failed to append conversation messages"),
            );

        // 비동기 사용량 기록
        this.recordUsageAsync(
            provider.name,
            provider.config.model,
            resp,
            elapsed,
            "success",
        );

        return {
            conversationSeq: convSeq,
            content: resp.content,
            finishReason: resp.finishReason,
            usage: resp.usage,
            model: resp.model,
        };
    }

    // ─── RAG Chat ────────────────────────────────────────────────────────

    /** RAG 기반 채팅을 실행한다 */
    async chatWithRAG(
        providerName: string | undefined,
        userMsg: string,
        opts?: RAGOptions,
    ): Promise<RAGResponse> {
        if (!this.docStore) throw new Error("Document store not configured");

        const _opts = opts ?? {};
        const embedProvider = _opts.embedProvider || providerName;
        const topK = _opts.topK || 5;
        const minScore = _opts.minScore || 0.7;

        // 유사 문서 검색
        const results = await this.docStore.searchSimilar({
            query: userMsg,
            providerName: embedProvider,
            topK,
            minScore,
            tenantId: _opts.tenantId,
            metadata: _opts.metadata,
        });

        // 시스템 프롬프트 조립
        let systemMsg = _opts.systemMsg || DEFAULT_RAG_SYSTEM_PROMPT;
        if (results.length > 0) {
            systemMsg += "\n\n[참고 자료]\n" + buildRAGContext(results);
        }

        const req: ChatRequest = {
            system: systemMsg,
            messages: [{ role: "user", content: userMsg }],
        };

        const resp = await this.chat(providerName, req);

        return {
            content: resp.content,
            finishReason: resp.finishReason,
            usage: resp.usage,
            model: resp.model,
            sources: results,
        };
    }

    // ─── Chatbot Chat ─────────────────────────────────────────────────────

    /**
     * 챗봇과 대화한다 (RAG + 히스토리 통합).
     *
     * @param chatbotSeq  llm_chatbot.seq
     * @param userMsg     사용자 메시지
     * @param sessionSeq  기존 세션 seq (0이면 신규 생성)
     * @param userSeq     로그인 사용자 seq (선택)
     * @param sessionId   비로그인 세션 식별자 (선택)
     */
    async chatWithBot(
        chatbotSeq: number,
        userMsg: string,
        sessionSeq: number,
        userSeq?: number,
        sessionId?: string,
    ): Promise<ChatbotChatResponse> {
        if (!this.chatbotStore) throw new Error("Chatbot store not configured");

        const bot = await this.chatbotStore.getChatbot(chatbotSeq);
        if (bot.status !== "active")
            throw new Error(`Chatbot "${bot.name}" is not active`);

        const providerName = bot.providerName || undefined;
        const provider = this.getProvider(providerName);

        // Rate limit
        if (!provider.rateLimiter.tryAcquire()) {
            throw new Error(
                `LLM rate limit exceeded for provider "${provider.name}"`,
            );
        }

        // 세션 로드 또는 신규 생성
        let curSessionSeq = sessionSeq;
        let history: Message[] = [];
        const isNewSession = sessionSeq <= 0;

        if (!isNewSession) {
            const session =
                await this.chatbotStore.getSessionMessages(curSessionSeq);
            history = session.messages;
        } else {
            curSessionSeq = await this.chatbotStore.createSession(
                chatbotSeq,
                provider.name,
                truncate(userMsg, 80),
                userSeq,
                sessionId,
                bot.systemMsg ?? undefined,
            );
        }

        // Profile Memory 주입
        let profileInjection = "";
        if (this.profileStore && userSeq) {
            profileInjection = await this.profileStore
                .formatForPrompt({
                    userSeq,
                    chatbotSeq,
                    scope: `chatbot_${chatbotSeq}`,
                })
                .catch(() => "");
            if (!profileInjection) {
                profileInjection = await this.profileStore
                    .formatForPrompt({ userSeq })
                    .catch(() => "");
            }
        }

        // RAG 컨텍스트 조립
        let systemMsg = bot.systemMsg ?? "";
        if (profileInjection) {
            systemMsg = systemMsg
                ? `${systemMsg}\n\n${profileInjection}`
                : profileInjection;
        }
        let ragSources: SearchResult[] | undefined;
        if (bot.ragEnabled && this.docStore) {
            ragSources = await this.docStore.searchSimilar({
                query: userMsg,
                providerName,
                topK: bot.ragTopK ?? 5,
                minScore: bot.ragMinScore ?? 0.7,
                tenantId: bot.ragTenantId ?? undefined,
                metadata: bot.ragMetadata ?? undefined,
            });
            if (ragSources.length > 0) {
                systemMsg += "\n\n[참고 자료]\n" + buildRAGContext(ragSources);
            }
        }

        const messages: Message[] = [
            ...history,
            { role: "user", content: userMsg },
        ];

        const req: ChatRequest = {
            system: systemMsg,
            messages,
            maxTokens: provider.config.max_tokens,
            temperature: provider.config.temperature,
        };

        const start = Date.now();
        const resp = await provider.client.chat(req);
        const elapsed = Date.now() - start;

        // 히스토리 저장 (비동기)
        const newMessages: Message[] = [
            { role: "user", content: userMsg },
            { role: "assistant", content: resp.content },
        ];
        this.chatbotStore
            .appendSessionMessages(curSessionSeq, newMessages, resp.usage)
            .catch((err) =>
                logger.error(
                    { err },
                    "Failed to append chatbot session messages",
                ),
            );

        // 사용량 기록 (비동기)
        this.recordUsageAsync(
            provider.name,
            provider.config.model,
            resp,
            elapsed,
            "success",
        );

        return {
            sessionSeq: curSessionSeq,
            content: resp.content,
            sources: ragSources?.length ? ragSources : undefined,
            usage: resp.usage,
            model: resp.model ?? "",
            isNewSession,
        };
    }

    /**
     * 챗봇과 스트리밍 대화한다 (RAG + 히스토리 통합).
     *
     * 반환: { sessionSeq, stream }
     */
    async chatStreamWithBot(
        chatbotSeq: number,
        userMsg: string,
        sessionSeq: number,
        userSeq?: number,
        sessionId?: string,
    ): Promise<{ sessionSeq: number; stream: AsyncGenerator<StreamChunk> }> {
        if (!this.chatbotStore) throw new Error("Chatbot store not configured");

        const bot = await this.chatbotStore.getChatbot(chatbotSeq);
        if (bot.status !== "active")
            throw new Error(`Chatbot "${bot.name}" is not active`);

        const providerName = bot.providerName || undefined;
        const provider = this.getProvider(providerName);

        if (!provider.rateLimiter.tryAcquire()) {
            throw new Error(
                `LLM rate limit exceeded for provider "${provider.name}"`,
            );
        }

        let curSessionSeq = sessionSeq;
        let history: Message[] = [];

        if (curSessionSeq > 0) {
            const session =
                await this.chatbotStore.getSessionMessages(curSessionSeq);
            history = session.messages;
        } else {
            curSessionSeq = await this.chatbotStore.createSession(
                chatbotSeq,
                provider.name,
                truncate(userMsg, 80),
                userSeq,
                sessionId,
                bot.systemMsg ?? undefined,
            );
        }

        // Profile Memory 주입 (스트리밍)
        let streamProfileInjection = "";
        if (this.profileStore && userSeq) {
            streamProfileInjection = await this.profileStore
                .formatForPrompt({
                    userSeq,
                    chatbotSeq,
                    scope: `chatbot_${chatbotSeq}`,
                })
                .catch(() => "");
            if (!streamProfileInjection) {
                streamProfileInjection = await this.profileStore
                    .formatForPrompt({ userSeq })
                    .catch(() => "");
            }
        }

        let systemMsg = bot.systemMsg ?? "";
        if (streamProfileInjection) {
            systemMsg = systemMsg
                ? `${systemMsg}\n\n${streamProfileInjection}`
                : streamProfileInjection;
        }
        if (bot.ragEnabled && this.docStore) {
            const results = await this.docStore.searchSimilar({
                query: userMsg,
                providerName,
                topK: bot.ragTopK ?? 5,
                minScore: bot.ragMinScore ?? 0.7,
                tenantId: bot.ragTenantId ?? undefined,
                metadata: bot.ragMetadata ?? undefined,
            });
            if (results.length > 0) {
                systemMsg += "\n\n[참고 자료]\n" + buildRAGContext(results);
            }
        }

        const messages: Message[] = [
            ...history,
            { role: "user", content: userMsg },
        ];

        const req: ChatRequest = {
            system: systemMsg,
            messages,
            maxTokens: provider.config.max_tokens,
            temperature: provider.config.temperature,
        };

        const self = this;
        const store = this.chatbotStore;

        async function* gen(): AsyncGenerator<StreamChunk> {
            let fullContent = "";
            let lastUsage: import("./types/index.ts").TokenUsage | undefined;

            for await (const chunk of provider.client.chatStream(req)) {
                if (chunk.content) fullContent += chunk.content;
                if (chunk.usage) lastUsage = chunk.usage;
                yield chunk;
                if (chunk.done) break;
            }

            // 히스토리 저장
            const newMessages: Message[] = [
                { role: "user", content: userMsg },
                { role: "assistant", content: fullContent },
            ];
            store
                .appendSessionMessages(curSessionSeq, newMessages, lastUsage)
                .catch((err) =>
                    logger.error(
                        { err },
                        "Failed to append chatbot stream messages",
                    ),
                );

            // 사용량 기록
            if (lastUsage) {
                self.recordUsageFromTokensAsync(
                    provider.name,
                    provider.config.model,
                    lastUsage,
                    "success",
                );
            }
        }

        return { sessionSeq: curSessionSeq, stream: gen() };
    }

    // ─── Cache Stats ─────────────────────────────────────────────────────

    /** 캐시 통계를 반환한다 */
    getCacheStats(): Record<string, unknown> {
        const enabled = this.config.cache?.enabled ?? false;
        return {
            enabled,
            hits: this.cacheStats.hits,
            misses: this.cacheStats.misses,
            hit_rate: this.cacheStats.hitRate(),
            ttl_seconds: this.config.cache?.ttl_seconds ?? 0,
        };
    }

    /** 캐시를 비운다 */
    clearCache(): void {
        this.cache?.flush();
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────

    /** 모든 프로바이더 클라이언트를 정리한다 */
    close(): void {
        for (const p of this.providers.values()) {
            p.client.close();
        }
    }

    // ─── Private: Usage Recording ────────────────────────────────────────

    /** 비동기로 사용량을 기록한다 */
    private recordUsageAsync(
        providerName: string,
        model: string,
        resp: ChatResponse | null,
        elapsedMs: number,
        status: string,
    ): void {
        if (!this.usageQuerier || !this.config.usage_tracking) return;

        const record: LlmUsageRecord = {
            providerName,
            model,
            promptTokens: resp?.usage?.promptTokens ?? 0,
            completionTokens: resp?.usage?.completionTokens ?? 0,
            totalTokens: resp?.usage?.totalTokens ?? 0,
            requestTimeMs: elapsedMs,
            status: status as LlmUsageRecord["status"],
            requestedAt: new Date().toISOString(),
        };

        this.usageQuerier
            .recordUsage(record)
            .catch((err) => logger.error({ err }, "LLM usage record error"));
    }

    /** 토큰 사용량을 비동기로 기록한다 */
    private recordUsageFromTokensAsync(
        providerName: string,
        model: string,
        usage: TokenUsage,
        status: string,
    ): void {
        if (!this.usageQuerier || !this.config.usage_tracking) return;

        const record: LlmUsageRecord = {
            providerName,
            model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            requestTimeMs: 0,
            status: status as LlmUsageRecord["status"],
            requestedAt: new Date().toISOString(),
        };

        this.usageQuerier
            .recordUsage(record)
            .catch((err) => logger.error({ err }, "LLM usage record error"));
    }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_RAG_SYSTEM_PROMPT = `당신은 제공된 참고 자료를 기반으로 정확하게 답변하는 AI 어시스턴트입니다.

[규칙]
1. 참고 자료에 있는 정보만 사용하여 답변합니다.
2. 참고 자료에 해당 정보가 없으면 솔직하게 "제공된 자료에서 해당 정보를 찾을 수 없습니다"라고 안내합니다.
3. 한국어로 친절하게 답변합니다.`;

/** RAG 컨텍스트 문자열을 생성한다 */
function buildRAGContext(results: SearchResult[]): string {
    return results
        .map(
            (r, i) =>
                `--- 문서 ${i + 1}: ${r.title} (score: ${r.score.toFixed(2)}) ---\n${r.content}\n`,
        )
        .join("\n");
}

/** 문자열을 최대 길이로 자른다 */
function truncate(s: string, maxLen: number): string {
    const arr = [...s];
    return arr.length <= maxLen ? s : arr.slice(0, maxLen).join("");
}
