import type { Message, TokenUsage } from "./chat.ts";
import type { SearchResult } from "./conversation.ts";

// ─── Chatbot 정의 ─────────────────────────────────────────────────────────────

export interface Chatbot {
    seq: number;
    name: string;
    label: string;
    systemMsg?: string;
    welcomeMessage?: string;
    /** 지정 없으면 LlmConfig.default 사용 */
    providerName?: string;
    ragEnabled: boolean;
    ragTenantId?: string;
    ragTopK: number;
    ragMinScore: number;
    ragMetadata?: Record<string, string>;
    status: "active" | "inactive";
    createdAt: string;
}

export interface ChatbotSummary {
    seq: number;
    name: string;
    label: string;
    ragEnabled: boolean;
    status: string;
    createdAt: string;
}

export interface ChatbotCreateInput {
    name: string;
    label: string;
    systemMsg?: string;
    welcomeMessage?: string;
    providerName?: string;
    ragEnabled?: boolean;
    ragTenantId?: string;
    ragTopK?: number;
    ragMinScore?: number;
    ragMetadata?: Record<string, string>;
}

export interface ChatbotUpdateInput {
    label?: string;
    systemMsg?: string;
    welcomeMessage?: string;
    providerName?: string;
    ragEnabled?: boolean;
    ragTenantId?: string;
    ragTopK?: number;
    ragMinScore?: number;
    ragMetadata?: Record<string, string>;
    status?: "active" | "inactive";
}

// ─── Chatbot 세션 ─────────────────────────────────────────────────────────────

/** 챗봇에 귀속된 대화 세션 요약 (llm_conversation 기반) */
export interface ChatbotSessionSummary {
    sessionSeq: number;
    chatbotSeq: number;
    title: string;
    messageCount: number;
    totalTokens: number;
    lastMessage: string;
    updatedAt: string;
}

export interface ChatbotSessionFilter {
    chatbotSeq: number;
    userSeq?: number;
    sessionId?: string;
    limit: number;
    offset: number;
}

// ─── Chat 요청/응답 ────────────────────────────────────────────────────────────

export interface ChatbotChatInput {
    chatbotSeq: number;
    /** 0 또는 미지정이면 새 세션 생성 */
    sessionSeq?: number;
    message: string;
    userSeq?: number;
    /** 비로그인 사용자 추적용 임의 ID */
    sessionId?: string;
}

export interface ChatbotChatResponse {
    sessionSeq: number;
    content: string;
    /** RAG 검색 결과 (rag_enabled=true 일 때만 포함) */
    sources?: SearchResult[];
    model: string;
    usage?: TokenUsage;
    /** 이번 요청으로 새 세션이 생성됐는지 여부 */
    isNewSession: boolean;
}

// ─── Store 인터페이스 ──────────────────────────────────────────────────────────

export interface ChatbotStore {
    /** 챗봇 정의를 seq로 조회한다 */
    getChatbot(seq: number): Promise<Chatbot>;
    /** 챗봇 정의를 name으로 조회한다 */
    getChatbotByName(name: string): Promise<Chatbot | null>;
    /** 챗봇 목록을 조회한다 */
    listChatbots(): Promise<ChatbotSummary[]>;
    /** 챗봇을 생성한다 */
    createChatbot(input: ChatbotCreateInput): Promise<number>;
    /** 챗봇 설정을 수정한다 */
    updateChatbot(seq: number, input: ChatbotUpdateInput): Promise<void>;
    /** 챗봇을 삭제한다 */
    deleteChatbot(seq: number): Promise<void>;

    /** 챗봇 세션을 생성한다 (llm_conversation 기반) */
    createSession(
        chatbotSeq: number,
        providerName: string,
        title: string,
        userSeq?: number,
        sessionId?: string,
        systemMsg?: string,
    ): Promise<number>;
    /** 세션의 메시지 배열과 시스템 메시지를 포함해 조회한다 */
    getSessionMessages(
        sessionSeq: number,
    ): Promise<{ messages: Message[]; systemMsg: string }>;
    /** 세션에 메시지를 추가하고 토큰 누계를 업데이트한다 */
    appendSessionMessages(
        sessionSeq: number,
        messages: Message[],
        usage?: { totalTokens?: number },
    ): Promise<void>;
    /** 챗봇에 귀속된 세션 목록을 조회한다 */
    listSessions(
        filter: ChatbotSessionFilter,
    ): Promise<ChatbotSessionSummary[]>;
    /** 세션을 삭제한다 */
    deleteSession(sessionSeq: number): Promise<void>;
}
