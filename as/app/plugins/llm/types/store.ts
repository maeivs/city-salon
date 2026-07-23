import type {
    Message,
    TokenUsage,
    ChatRequest,
    ChatResponse,
    StreamChunk,
    EmbedRequest,
    EmbedResponse,
} from "./chat.ts";
import type {
    Conversation,
    ConversationSummary,
    ConversationCreateInput,
    ConversationFilter,
    DocumentIngestInput,
    DocumentIngestResult,
    SearchInput,
    SearchResult,
    DocumentSummary,
    DocumentFilter,
} from "./conversation.ts";
import type { LlmUsageRecord, UsageFilter, UsageSummary } from "./usage.ts";

export interface ConversationStore {
    createConversation(input: ConversationCreateInput): Promise<number>;
    getConversation(conversationSeq: number): Promise<Conversation>;
    appendMessages(
        conversationSeq: number,
        messages: Message[],
        usage?: TokenUsage,
    ): Promise<void>;
    listConversations(
        filter: ConversationFilter,
    ): Promise<ConversationSummary[]>;
    deleteConversation(conversationSeq: number): Promise<void>;
    updateTitle(conversationSeq: number, title: string): Promise<void>;
}

export interface DocumentStore {
    ingestDocument(input: DocumentIngestInput): Promise<DocumentIngestResult>;
    searchSimilar(input: SearchInput): Promise<SearchResult[]>;
    deleteDocument(documentId: string): Promise<void>;
    listDocuments(filter: DocumentFilter): Promise<DocumentSummary[]>;
    rebuildIndex(): Promise<void>;
}

export interface UsageQuerier {
    recordUsage(record: LlmUsageRecord): Promise<void>;
    getUsageSummary(filter: UsageFilter): Promise<UsageSummary>;
}
