/**
 * LLM 라우트 테이블
 * 등록 경로: /v1/llm/*
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers";
/** LLM 라우트를 등록한다 */ export default async function llmRoutes(
    app: FastifyInstance,
): Promise<void> {
    // 서비스 존재 확인
    app.addHook("preHandler", h.ensureService);

    // ── 채팅 ──
    app.post("/chat", h.chat);
    app.post("/chat/stream", h.chatStream);

    // ── 대화 세션 ──
    app.post("/conversations", h.createConversation);
    app.post("/conversations/:seq/messages", h.sendMessage);
    app.get("/conversations", h.listConversations);
    app.get("/conversations/:seq", h.getConversation);
    app.patch("/conversations/:seq", h.updateConversation);
    app.delete("/conversations/:seq", h.deleteConversation);

    // ── RAG ──
    app.post("/rag/documents", h.ragUploadDocument);
    app.get("/rag/documents", h.ragListDocuments);
    app.delete("/rag/documents/:id", h.ragDeleteDocument);
    app.post("/rag/search", h.ragSearch);
    app.post("/rag/chat", h.ragChat);
    app.post("/rag/chat/stream", h.ragChatStream);
    app.post("/rag/rebuild-index", h.ragRebuildIndex);

    // ── 프로바이더 / 사용량 ──
    app.get("/providers", h.listProviders);
    app.get("/usage", h.getUsage);
    app.get("/usage/summary", h.getUsageSummary);

    // ── 캐시 ──
    app.get("/cache/stats", h.getCacheStats);
    app.delete("/cache", h.clearCache);

    // ── 프롬프트 템플릿 ──
    // 정적 라우트가 모두 등록된 후 마지막에 배치.
    // Fastify는 정적 세그먼트를 파라미터보다 항상 우선 매칭하므로
    // /chat, /rag/chat 등 기존 경로와 충돌하지 않는다.
    app.get("/templates", h.listPromptTemplates);

    // ── 챗봇 관리 ──
    app.get("/chatbots", h.listChatbots);
    app.post("/chatbots", h.createChatbot);
    app.get("/chatbots/:seq", h.getChatbot);
    app.patch("/chatbots/:seq", h.updateChatbot);
    app.delete("/chatbots/:seq", h.deleteChatbot);

    // ── 챗봇 채팅 ──
    app.post("/chatbots/:seq/chat", h.chatbotChat);
    app.post("/chatbots/:seq/chat/stream", h.chatbotChatStream);

    // ── 챗봇 세션 ──
    app.get("/chatbots/:seq/sessions", h.listChatbotSessions);
    app.delete("/chatbots/:seq/sessions/:sessionSeq", h.deleteChatbotSession);

    // ── Profile Memory ──
    app.get("/profiles", h.listProfiles);
    app.post("/profiles", h.upsertProfile);
    app.delete("/profiles/:seq", h.deleteProfile);

    // ── 템플릿 폴백 (:name) ── 반드시 정적 라우트 모두 등록 후에 배치
    app.post("/:name/chat", h.templateChat);
    app.post("/:name/chat/stream", h.templateChatStream);
}
