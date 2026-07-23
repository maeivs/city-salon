import type { Message, TokenUsage } from "./chat.ts";

export interface Conversation {
    seq: number;
    providerName: string;
    title: string;
    systemMsg?: string;
    messages: Message[];
    totalTokens: number;
    userSeq?: number;
    createdAt: string;
    updatedAt: string;
}

export interface ConversationSummary {
    seq: number;
    title: string;
    providerName: string;
    messageCount: number;
    totalTokens: number;
    lastMessage: string;
    updatedAt: string;
}

export interface ConversationCreateInput {
    providerName: string;
    title: string;
    systemMsg?: string;
    userSeq?: number;
}

export interface ConversationFilter {
    userSeq?: number;
    providerName?: string;
    limit: number;
    offset: number;
}

export interface ConversationResponse {
    conversationSeq: number;
    content: string;
    finishReason: string;
    usage?: TokenUsage;
    model: string;
}

export interface RAGOptions {
    systemMsg?: string;
    embedProvider?: string;
    topK?: number;
    minScore?: number;
    metadata?: Record<string, string>;
    tenantId?: string;
}

export interface RAGResponse {
    content: string;
    finishReason: string;
    usage?: TokenUsage;
    model: string;
    sources: SearchResult[];
}

export interface DocumentIngestInput {
    documentId: string;
    title: string;
    content: string;
    contentType?: string;
    metadata?: Record<string, string>;
    providerName?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    tenantId?: string;
}

export interface DocumentIngestResult {
    documentId: string;
    chunkCount: number;
    totalTokens: number;
}

export interface SearchInput {
    query: string;
    providerName?: string;
    topK?: number;
    minScore?: number;
    metadata?: Record<string, string>;
    tenantId?: string;
}

export interface SearchResult {
    documentId: string;
    chunkIndex: number;
    content: string;
    score: number;
    title: string;
    metadata?: Record<string, string>;
}

export interface DocumentSummary {
    documentId: string;
    title: string;
    contentType?: string;
    chunkCount: number;
    metadata?: Record<string, string>;
    createdAt: string;
    updatedAt: string;
}

export interface DocumentFilter {
    tenantId?: string;
    contentType?: string;
    metadata?: Record<string, string>;
    limit: number;
    offset: number;
}
