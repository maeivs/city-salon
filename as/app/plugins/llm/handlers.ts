/**
 * LLM 핸들러 구현
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";
import type {
    Message,
    RAGOptions,
    ConversationFilter,
    DocumentFilter,
    UsageFilter,
    StreamChunk,
    UserProfileUpsertInput,
    UserProfileFilter,
} from "./types/index.ts";
import type {
    ChatbotCreateInput,
    ChatbotUpdateInput,
    ChatbotSessionFilter,
} from "./types/chatbot.ts";
import type { LlmService } from "./service.ts";

/** 요청에서 LlmService 인스턴스를 가져온다 */
const svc = (req: FastifyRequest): LlmService => req.server.llmService!;

/** SSE 응답 헤더를 한 번만 기록한다. */
function writeSseHeaders(
    reply: FastifyReply,
    headers: Record<string, string> = {},
): void {
    if (reply.raw.headersSent) return;

    reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...headers,
    });
}

/** SSE 메시지를 연결이 살아 있을 때만 기록한다. */
function writeSseMessage(
    reply: FastifyReply,
    event: string | null,
    data: unknown,
): void {
    if (reply.raw.destroyed || reply.raw.writableEnded) return;

    const eventLine = event ? `event: ${event}\n` : "";
    reply.raw.write(`${eventLine}data: ${JSON.stringify(data)}\n\n`);
}

/** 스트리밍 중 예외를 SSE error 이벤트와 로그로 처리한다. */
async function sendSseStreamSafely(
    request: FastifyRequest,
    reply: FastifyReply,
    stream: AsyncGenerator<StreamChunk>,
    headers: Record<string, string> = {},
): Promise<void> {
    writeSseHeaders(reply, headers);

    try {
        for await (const chunk of stream) {
            writeSseMessage(reply, null, chunk);
            if (chunk.done) break;
        }
    } catch (err) {
        request.log.error({ err }, "LLM SSE stream failed");
        writeSseMessage(reply, "error", {
            ok: false,
            error: "stream failed",
        });
    } finally {
        if (!reply.raw.destroyed && !reply.raw.writableEnded) {
            reply.raw.end();
        }
    }
}

// ─── 미들웨어 ───

export async function ensureService(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    if (!request.server.llmService) {
        reply.status(503).send(fail("LLM plugin is not enabled"));
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. 채팅
// ═══════════════════════════════════════════════════════════════════════
/** 채팅 완성 요청을 처리한다 */ export async function chat(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const body = request.body as {
        provider?: string;
        messages?: Message[];
        system?: string;
        max_tokens?: number;
        temperature?: number;
        json_mode?: boolean;
        stop?: string[];
    };

    if (!body.messages?.length) {
        return reply.status(400).send(fail("messages required"));
    }

    const resp = await svc(request).chat(body.provider, {
        messages: body.messages,
        system: body.system,
        maxTokens: body.max_tokens,
        temperature: body.temperature,
        jsonMode: body.json_mode,
        stop: body.stop,
    });

    return ok(resp);
}

/** 스트리밍 채팅 요청을 처리한다 */
export async function chatStream(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
        provider?: string;
        messages?: Message[];
        system?: string;
        max_tokens?: number;
        temperature?: number;
        json_mode?: boolean;
        stop?: string[];
    };

    if (!body.messages?.length) {
        return reply.status(400).send(fail("messages required"));
    }

    const stream = svc(request).chatStream(body.provider, {
        messages: body.messages,
        system: body.system,
        maxTokens: body.max_tokens,
        temperature: body.temperature,
        jsonMode: body.json_mode,
        stop: body.stop,
    });

    await sendSseStreamSafely(request, reply, stream);
}

// ═══════════════════════════════════════════════════════════════════════
// 2. 대화 세션
// ═══════════════════════════════════════════════════════════════════════

/** 새 대화를 생성한다 */
export async function createConversation(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    if (!svc(request).convStore) {
        return reply
            .status(503)
            .send(fail("Conversation store not configured"));
    }

    const body = request.body as {
        provider?: string;
        message?: string;
        system?: string;
        user_seq?: number;
    };
    if (!body.message) {
        return reply.status(400).send(fail("message required"));
    }

    const userSeq = body.user_seq ? Number(body.user_seq) : undefined;

    const resp = await svc(request).chatInSession(
        body.provider,
        0,
        body.message,
        userSeq,
        (req) => {
            if (body.system) req.system = body.system;
        },
    );

    return ok(resp);
}

/** 대화 컨텍스트로 채팅한다 */
export async function sendMessage(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    if (!svc(request).convStore) {
        return reply
            .status(503)
            .send(fail("Conversation store not configured"));
    }

    const seq = parseInt(request.params.seq, 10);
    if (!seq || seq <= 0) {
        return reply.status(400).send(fail("invalid seq"));
    }

    const body = request.body as {
        message?: string;
        provider?: string;
        user_seq?: number;
    };
    if (!body.message) {
        return reply.status(400).send(fail("message required"));
    }

    const resp = await svc(request).chatInSession(
        body.provider,
        seq,
        body.message,
        body.user_seq ? Number(body.user_seq) : undefined,
    );
    return ok(resp);
}

/** 대화 목록을 조회한다 */
export async function listConversations(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    if (!svc(request).convStore) {
        return reply
            .status(503)
            .send(fail("Conversation store not configured"));
    }

    const query = request.query as {
        user_seq?: string;
        provider?: string;
        limit?: string;
        offset?: string;
    };

    const filter: ConversationFilter = {
        userSeq: parseInt(query.user_seq ?? "0", 10) || undefined,
        providerName: query.provider,
        limit: parseInt(query.limit ?? "20", 10),
        offset: parseInt(query.offset ?? "0", 10),
    };

    const list = await svc(request).convStore!.listConversations(filter);
    return ok(list);
}

/** 대화 상세를 조회한다 */
export async function getConversation(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    if (!svc(request).convStore) {
        return reply
            .status(503)
            .send(fail("Conversation store not configured"));
    }

    const seq = parseInt(request.params.seq, 10);
    if (!seq || seq <= 0) {
        return reply.status(400).send(fail("invalid seq"));
    }

    const conv = await svc(request).convStore!.getConversation(seq);
    return ok(conv);
}

/** 대화 제목을 수정한다 */
export async function updateConversation(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    if (!svc(request).convStore) {
        return reply
            .status(503)
            .send(fail("Conversation store not configured"));
    }

    const seq = parseInt(request.params.seq, 10);
    if (!seq || seq <= 0) {
        return reply.status(400).send(fail("invalid seq"));
    }

    const body = request.body as { title?: string };
    if (!body.title) {
        return reply.status(400).send(fail("title required"));
    }

    await svc(request).convStore!.updateTitle(seq, body.title);
    return ok({ seq, title: body.title });
}

/** 대화를 삭제한다 */
export async function deleteConversation(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    if (!svc(request).convStore) {
        return reply
            .status(503)
            .send(fail("Conversation store not configured"));
    }

    const seq = parseInt(request.params.seq, 10);
    if (!seq || seq <= 0) {
        return reply.status(400).send(fail("invalid seq"));
    }

    await svc(request).convStore!.deleteConversation(seq);
    return ok({ deleted: true, seq });
}

// ═══════════════════════════════════════════════════════════════════════
// 3. RAG
// ═══════════════════════════════════════════════════════════════════════

/** RAG 문서를 인제스트한다 */
export async function ragUploadDocument(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    if (!svc(request).docStore) {
        return reply
            .status(503)
            .send(fail("RAG document store not configured"));
    }

    const body = request.body as {
        document_id?: string;
        title?: string;
        content?: string;
        content_type?: string;
        metadata?: Record<string, string>;
        provider_name?: string;
        chunk_size?: number;
        chunk_overlap?: number;
        tenant_id?: string;
    };

    if (!body.content) return reply.status(400).send(fail("content required"));
    if (!body.title) return reply.status(400).send(fail("title required"));
    if (!body.document_id)
        return reply.status(400).send(fail("document_id required"));

    const result = await svc(request).docStore!.ingestDocument({
        documentId: body.document_id,
        title: body.title,
        content: body.content,
        contentType: body.content_type,
        metadata: body.metadata,
        providerName: body.provider_name,
        chunkSize: body.chunk_size,
        chunkOverlap: body.chunk_overlap,
        tenantId: body.tenant_id,
    });

    return ok(result);
}

/** RAG 문서 목록을 조회한다 */
export async function ragListDocuments(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    if (!svc(request).docStore) {
        return reply
            .status(503)
            .send(fail("RAG document store not configured"));
    }

    const query = request.query as {
        limit?: string;
        offset?: string;
        tenant_id?: string;
        content_type?: string;
    };

    const filter: DocumentFilter = {
        limit: parseInt(query.limit ?? "50", 10),
        offset: parseInt(query.offset ?? "0", 10),
        tenantId: query.tenant_id,
        contentType: query.content_type,
    };

    const docs = await svc(request).docStore!.listDocuments(filter);
    return ok(docs);
}

/** RAG 문서를 삭제한다 */
export async function ragDeleteDocument(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
) {
    if (!svc(request).docStore) {
        return reply
            .status(503)
            .send(fail("RAG document store not configured"));
    }

    const docId = request.params.id;
    if (!docId) return reply.status(400).send(fail("document id required"));

    await svc(request).docStore!.deleteDocument(docId);
    return ok({ deleted: true, document_id: docId });
}

/** 유사 문서를 검색한다 */
export async function ragSearch(request: FastifyRequest, reply: FastifyReply) {
    if (!svc(request).docStore) {
        return reply
            .status(503)
            .send(fail("RAG document store not configured"));
    }

    const body = request.body as {
        query?: string;
        provider_name?: string;
        top_k?: number;
        min_score?: number;
        metadata?: Record<string, string>;
        tenant_id?: string;
    };

    if (!body.query) return reply.status(400).send(fail("query required"));

    const results = await svc(request).docStore!.searchSimilar({
        query: body.query,
        providerName: body.provider_name,
        topK: body.top_k,
        minScore: body.min_score,
        metadata: body.metadata,
        tenantId: body.tenant_id,
    });

    return ok(results);
}

/** RAG 기반 질의를 처리한다 */
export async function ragChat(request: FastifyRequest, reply: FastifyReply) {
    if (!svc(request).docStore) {
        return reply
            .status(503)
            .send(fail("RAG document store not configured"));
    }

    const body = request.body as {
        provider?: string;
        message?: string;
        system_msg?: string;
        embed_provider?: string;
        top_k?: number;
        min_score?: number;
        metadata?: Record<string, string>;
        tenant_id?: string;
    };

    if (!body.message) return reply.status(400).send(fail("message required"));

    const opts: RAGOptions = {
        systemMsg: body.system_msg,
        embedProvider: body.embed_provider,
        topK: body.top_k,
        minScore: body.min_score,
        metadata: body.metadata,
        tenantId: body.tenant_id,
    };

    const resp = await svc(request).chatWithRAG(
        body.provider,
        body.message,
        opts,
    );
    return ok(resp);
}

/** RAG 기반 스트리밍 채팅을 처리한다 */
export async function ragChatStream(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    if (!svc(request).docStore) {
        return reply
            .status(503)
            .send(fail("RAG document store not configured"));
    }

    const body = request.body as {
        provider?: string;
        message?: string;
        system_msg?: string;
        embed_provider?: string;
        top_k?: number;
        min_score?: number;
        metadata?: Record<string, string>;
        tenant_id?: string;
    };

    if (!body.message) return reply.status(400).send(fail("message required"));

    const embedProvider = body.embed_provider || body.provider;
    const topK = body.top_k || 5;
    const minScore = body.min_score || 0.7;

    const results = await svc(request).docStore!.searchSimilar({
        query: body.message,
        providerName: embedProvider,
        topK,
        minScore,
        tenantId: body.tenant_id,
        metadata: body.metadata,
    });

    let systemMsg =
        body.system_msg ||
        "당신은 제공된 참고 자료를 기반으로 정확하게 답변하는 AI 어시스턴트입니다.";
    if (results.length > 0) {
        systemMsg +=
            "\n\n[참고 자료]\n" +
            results
                .map(
                    (r, i) =>
                        `--- 문서 ${i + 1}: ${r.title} (score: ${r.score.toFixed(2)}) ---\n${r.content}\n`,
                )
                .join("\n");
    }

    const stream = svc(request).chatStream(body.provider, {
        system: systemMsg,
        messages: [{ role: "user", content: body.message }],
    });

    await sendSseStreamSafely(request, reply, stream);
}

/** RAG 인덱스를 재구축한다 */
export async function ragRebuildIndex(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    if (!svc(request).docStore) {
        return reply
            .status(503)
            .send(fail("RAG document store not configured"));
    }

    await svc(request).docStore!.rebuildIndex();
    return ok({ rebuilt: true });
}

// ═══════════════════════════════════════════════════════════════════════
// 4. 프로바이더 / 사용량
// ═══════════════════════════════════════════════════════════════════════
/** 등록된 LLM 프로바이더 목록을 반환한다 */ export async function listProviders(
    request: FastifyRequest,
) {
    const providers = svc(request).getProviders();
    const result: Array<Record<string, unknown>> = [];
    for (const [name, p] of providers) {
        result.push({
            name,
            driver: p.config.driver,
            model: p.config.model,
            is_default: name === svc(request).defaultProviderName(),
        });
    }
    return ok(result);
}

/** LLM 사용량 통계를 반환한다 */
export async function getUsage(request: FastifyRequest, reply: FastifyReply) {
    if (!svc(request).usageQuerier) {
        return reply.status(503).send(fail("Usage tracking not configured"));
    }

    const query = request.query as {
        provider?: string;
        caller?: string;
        date_from?: string;
        date_to?: string;
    };

    const filter: UsageFilter = {
        providerName: query.provider,
        callerService: query.caller,
        dateFrom: query.date_from,
        dateTo: query.date_to,
    };

    const summary = await svc(request).usageQuerier!.getUsageSummary(filter);
    return ok(summary);
}

/** LLM 사용량 요약을 반환한다 */
export async function getUsageSummary(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    if (!svc(request).usageQuerier) {
        return reply.status(503).send(fail("Usage tracking not configured"));
    }

    const query = request.query as {
        provider?: string;
        caller?: string;
        date_from?: string;
        date_to?: string;
    };

    const summary = await svc(request).usageQuerier!.getUsageSummary({
        providerName: query.provider,
        callerService: query.caller,
        dateFrom: query.date_from,
        dateTo: query.date_to,
    });

    return ok(summary);
}

// ═══════════════════════════════════════════════════════════════════════
// 5. 캐시
// ═══════════════════════════════════════════════════════════════════════

/** 캐시 통계를 반환한다 */
export async function getCacheStats(request: FastifyRequest) {
    return ok(svc(request).getCacheStats());
}

/** 캐시를 비운다 */
export async function clearCache(request: FastifyRequest) {
    svc(request).clearCache();
    return ok({ cleared: true });
}

// ═══════════════════════════════════════════════════════════════════════
// 6. 프롬프트 템플릿
// ═══════════════════════════════════════════════════════════════════════

/** 사용 가능한 프롬프트 템플릿 목록을 반환한다 */
export async function listPromptTemplates(request: FastifyRequest) {
    return ok(svc(request).getTemplateList());
}

/**
 * 프롬프트 템플릿 기반 채팅
 *
 * POST /llm/templates/:name/chat
 * body: { variables?: Record<string,string>, message?: string, provider?: string }
 */
export async function templateChat(
    request: FastifyRequest<{ Params: { name: string } }>,
    reply: FastifyReply,
) {
    const name = request.params.name;
    const body = request.body as {
        variables?: Record<string, string>;
        message?: string;
        provider?: string;
    };

    try {
        const result = await svc(request).chatWithTemplate(
            name,
            body.variables ?? {},
            body.provider,
            body.message,
        );
        return ok(result);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) {
            return reply.status(404).send(fail(msg));
        }
        if (msg.includes("no user_msg") || msg.includes("provide")) {
            return reply.status(400).send(fail(msg));
        }
        throw err;
    }
}

/**
 * 프롬프트 템플릿 기반 스트리밍 채팅
 *
 * POST /llm/templates/:name/chat/stream
 * body: { variables?: Record<string,string>, message?: string, provider?: string }
 */
export async function templateChatStream(
    request: FastifyRequest<{ Params: { name: string } }>,
    reply: FastifyReply,
) {
    const name = request.params.name;
    const body = request.body as {
        variables?: Record<string, string>;
        message?: string;
        provider?: string;
    };

    let stream: AsyncGenerator<import("./types/index.ts").StreamChunk>;
    try {
        stream = svc(request).chatStreamWithTemplate(
            name,
            body.variables ?? {},
            body.provider,
            body.message,
        );
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) {
            return reply.status(404).send(fail(msg));
        }
        return reply.status(400).send(fail(msg));
    }

    await sendSseStreamSafely(request, reply, stream);
}

// ═══════════════════════════════════════════════════════════════════════
// 8. 챗봇 관리
// ═══════════════════════════════════════════════════════════════════════

/** 챗봇 목록을 반환한다 */
export async function listChatbots(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const store = svc(request).chatbotStore;
    if (!store)
        return reply.status(503).send(fail("Chatbot store not configured"));
    const list = await store.listChatbots();
    return ok(list);
}

/** 특정 챗봇을 조회한다 */
export async function getChatbot(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const store = svc(request).chatbotStore;
    if (!store)
        return reply.status(503).send(fail("Chatbot store not configured"));

    const seq = Number(request.params.seq);
    try {
        const bot = await store.getChatbot(seq);
        return ok(bot);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.status(404).send(fail(msg));
        throw err;
    }
}

/** 챗봇을 생성한다 */
export async function createChatbot(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const store = svc(request).chatbotStore;
    if (!store)
        return reply.status(503).send(fail("Chatbot store not configured"));

    const body = request.body as {
        name?: string;
        label?: string;
        system_msg?: string;
        welcome_message?: string;
        provider_name?: string;
        rag_enabled?: boolean;
        rag_tenant_id?: string;
        rag_top_k?: number;
        rag_min_score?: number;
        rag_metadata?: Record<string, unknown>;
    };

    if (!body.name) return reply.status(400).send(fail("name required"));

    const input: ChatbotCreateInput = {
        name: body.name,
        label: body.label ?? body.name,
        systemMsg: body.system_msg,
        welcomeMessage: body.welcome_message,
        providerName: body.provider_name,
        ragEnabled: body.rag_enabled ?? false,
        ragTenantId: body.rag_tenant_id,
        ragTopK: body.rag_top_k,
        ragMinScore: body.rag_min_score,
        ragMetadata: body.rag_metadata as Record<string, string> | undefined,
    };

    const seq = await store.createChatbot(input);
    return reply.status(201).send(ok({ seq }));
}

/** 챗봇을 수정한다 */
export async function updateChatbot(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const store = svc(request).chatbotStore;
    if (!store)
        return reply.status(503).send(fail("Chatbot store not configured"));

    const seq = Number(request.params.seq);
    const body = request.body as {
        label?: string;
        system_msg?: string;
        welcome_message?: string;
        provider_name?: string;
        rag_enabled?: boolean;
        rag_tenant_id?: string;
        rag_top_k?: number;
        rag_min_score?: number;
        rag_metadata?: Record<string, unknown>;
        status?: string;
    };

    const input: ChatbotUpdateInput = {};
    if (body.label !== undefined) input.label = body.label;
    if (body.system_msg !== undefined) input.systemMsg = body.system_msg;
    if (body.welcome_message !== undefined)
        input.welcomeMessage = body.welcome_message;
    if (body.provider_name !== undefined)
        input.providerName = body.provider_name;
    if (body.rag_enabled !== undefined) input.ragEnabled = body.rag_enabled;
    if (body.rag_tenant_id !== undefined)
        input.ragTenantId = body.rag_tenant_id;
    if (body.rag_top_k !== undefined) input.ragTopK = body.rag_top_k;
    if (body.rag_min_score !== undefined)
        input.ragMinScore = body.rag_min_score;
    if (body.rag_metadata !== undefined)
        input.ragMetadata = body.rag_metadata as Record<string, string>;
    if (body.status !== undefined)
        input.status = body.status as "active" | "inactive";

    try {
        await store.updateChatbot(seq, input);
        return ok({ seq });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.status(404).send(fail(msg));
        throw err;
    }
}

/** 챗봇을 삭제한다 */
export async function deleteChatbot(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const store = svc(request).chatbotStore;
    if (!store)
        return reply.status(503).send(fail("Chatbot store not configured"));

    const seq = Number(request.params.seq);
    try {
        await store.deleteChatbot(seq);
        return ok({ seq });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.status(404).send(fail(msg));
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 9. 챗봇 채팅
// ═══════════════════════════════════════════════════════════════════════

/**
 * 챗봇 채팅 (RAG + 히스토리 통합)
 *
 * POST /chatbots/:seq/chat
 * body: { message, session_seq?, session_id?, user_seq? }
 */
export async function chatbotChat(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const chatbotSeq = Number(request.params.seq);
    const body = request.body as {
        message?: string;
        session_seq?: number;
        session_id?: string;
        user_seq?: number;
    };

    if (!body.message) return reply.status(400).send(fail("message required"));

    try {
        const resp = await svc(request).chatWithBot(
            chatbotSeq,
            body.message,
            body.session_seq ?? 0,
            body.user_seq,
            body.session_id,
        );
        return ok(resp);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.status(404).send(fail(msg));
        if (msg.includes("not active"))
            return reply.status(409).send(fail(msg));
        throw err;
    }
}

/**
 * 챗봇 스트리밍 채팅
 *
 * POST /chatbots/:seq/chat/stream
 * body: { message, session_seq?, session_id?, user_seq? }
 */
export async function chatbotChatStream(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const chatbotSeq = Number(request.params.seq);
    const body = request.body as {
        message?: string;
        session_seq?: number;
        session_id?: string;
        user_seq?: number;
    };

    if (!body.message) return reply.status(400).send(fail("message required"));

    let sessionSeq: number;
    let stream: AsyncGenerator<import("./types/index.ts").StreamChunk>;

    try {
        const result = await svc(request).chatStreamWithBot(
            chatbotSeq,
            body.message,
            body.session_seq ?? 0,
            body.user_seq,
            body.session_id,
        );
        sessionSeq = result.sessionSeq;
        stream = result.stream;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.status(404).send(fail(msg));
        if (msg.includes("not active"))
            return reply.status(409).send(fail(msg));
        throw err;
    }

    await sendSseStreamSafely(request, reply, stream, {
        "X-Session-Seq": String(sessionSeq),
    });
}

// ═══════════════════════════════════════════════════════════════════════
// 10. 챗봇 세션 관리
// ═══════════════════════════════════════════════════════════════════════

/**
 * 챗봇의 세션 목록을 반환한다
 *
 * GET /chatbots/:seq/sessions
 * query: user_seq?, session_id?, limit?, offset?
 */
export async function listChatbotSessions(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const store = svc(request).chatbotStore;
    if (!store)
        return reply.status(503).send(fail("Chatbot store not configured"));

    const chatbotSeq = Number(request.params.seq);
    const q = request.query as {
        user_seq?: string;
        session_id?: string;
        limit?: string;
        offset?: string;
    };

    const filter: ChatbotSessionFilter = {
        chatbotSeq,
        userSeq: q.user_seq ? Number(q.user_seq) : undefined,
        sessionId: q.session_id,
        limit: q.limit ? Number(q.limit) : 20,
        offset: q.offset ? Number(q.offset) : 0,
    };

    const sessions = await store.listSessions(filter);
    return ok(sessions);
}

/**
 * 챗봇 세션을 삭제한다
 *
 * DELETE /chatbots/:seq/sessions/:sessionSeq
 */
export async function deleteChatbotSession(
    request: FastifyRequest<{ Params: { seq: string; sessionSeq: string } }>,
    reply: FastifyReply,
) {
    const store = svc(request).chatbotStore;
    if (!store)
        return reply.status(503).send(fail("Chatbot store not configured"));

    const sessionSeq = Number(request.params.sessionSeq);
    try {
        await store.deleteSession(sessionSeq);
        return ok({ seq: sessionSeq });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.status(404).send(fail(msg));
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════
// 11. Profile Memory
// ═══════════════════════════════════════════════════════════════════

/**
 * 사용자의 Profile Memory 목록을 반환한다
 *
 * GET /llm/profiles?user_seq=1&scope=global&chatbot_seq=2&include_inactive=false
 */
export async function listProfiles(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const store = svc(request).profileStore;
    if (!store)
        return reply.status(503).send(fail("Profile store not configured"));

    const q = request.query as {
        user_seq?: string;
        scope?: string;
        chatbot_seq?: string;
        include_inactive?: string;
    };

    if (!q.user_seq) return reply.status(400).send(fail("user_seq required"));

    const filter: UserProfileFilter = {
        userSeq: Number(q.user_seq),
        scope: q.scope,
        chatbotSeq: q.chatbot_seq ? Number(q.chatbot_seq) : undefined,
        includeInactive: q.include_inactive === "true",
    };

    const entries = await store.getProfiles(filter);
    return ok(entries);
}

/**
 * Profile Memory 항목을 upsert한다
 *
 * POST /llm/profiles
 * body: { user_seq, key, value, scope?, chatbot_seq?, source? }
 */
export async function upsertProfile(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const store = svc(request).profileStore;
    if (!store)
        return reply.status(503).send(fail("Profile store not configured"));

    const body = request.body as {
        user_seq?: number;
        key?: string;
        value?: string;
        scope?: string;
        chatbot_seq?: number;
        source?: string;
    };

    if (!body.user_seq)
        return reply.status(400).send(fail("user_seq required"));
    if (!body.key) return reply.status(400).send(fail("key required"));
    if (body.value === undefined || body.value === null)
        return reply.status(400).send(fail("value required"));

    const input: UserProfileUpsertInput = {
        userSeq: Number(body.user_seq),
        key: body.key,
        value: String(body.value),
        scope: body.scope,
        chatbotSeq: body.chatbot_seq ? Number(body.chatbot_seq) : undefined,
        source: (body.source as "manual" | "extracted") ?? "manual",
    };

    const seq = await store.upsertProfile(input);
    return ok({ seq });
}

/**
 * Profile Memory 항목을 비활성화한다
 *
 * DELETE /llm/profiles/:seq?user_seq=1
 */
export async function deleteProfile(
    request: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const store = svc(request).profileStore;
    if (!store)
        return reply.status(503).send(fail("Profile store not configured"));

    const seq = Number(request.params.seq);
    const q = request.query as { user_seq?: string };
    if (!q.user_seq) return reply.status(400).send(fail("user_seq required"));

    try {
        await store.deleteProfile(seq, Number(q.user_seq));
        return ok({ deleted: true, seq });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) return reply.status(404).send(fail(msg));
        throw err;
    }
}
