/**
 * 챗봇 저장소 — Entity Server 어댑터
 *
 * llm_chatbot 엔티티: 챗봇 정의 CRUD
 * llm_conversation 엔티티: 챗봇 대화 세션 (chatbot_seq 컬럼으로 연결)
 */

import { entityServer, logger } from "@system/api";
import type { Message } from "./types/index.ts";
import type {
    ChatbotStore,
    Chatbot,
    ChatbotSummary,
    ChatbotCreateInput,
    ChatbotUpdateInput,
    ChatbotSessionSummary,
    ChatbotSessionFilter,
} from "./types/chatbot.ts";

function truncate(s: string, max: number): string {
    const arr = [...s];
    return arr.length <= max ? s : arr.slice(0, max).join("") + "…";
}

function parseMessages(raw: unknown): Message[] {
    try {
        const s = typeof raw === "string" ? raw : JSON.stringify(raw ?? []);
        return JSON.parse(s) as Message[];
    } catch {
        return [];
    }
}

// ─── Chatbot 정의 어댑터 ─────────────────────────────────────────────────────

export class ChatbotEntityAdapter implements ChatbotStore {
    // ── 챗봇 CRUD ──────────────────────────────────────────────────────────

    /** 챗봇 정의를 seq로 조회한다 */
    async getChatbot(seq: number): Promise<Chatbot> {
        const resp = await entityServer.get<Record<string, unknown>>(
            "llm_chatbot",
            seq,
        );
        const row = resp.data as Record<string, unknown>;
        if (!row) throw new Error(`Chatbot seq=${seq} not found`);
        return rowToChatbot(seq, row);
    }

    /** 챗봇 정의를 name으로 조회한다 */
    async getChatbotByName(name: string): Promise<Chatbot | null> {
        const resp = await entityServer.list<Record<string, unknown>>(
            "llm_chatbot",
            { conditions: { name }, limit: 1 },
        );
        const items = resp?.data?.items ?? [];
        if (!items.length) return null;
        const row = items[0];
        return rowToChatbot(Number(row.seq), row);
    }

    /** 챗봇 목록을 조회한다 */
    async listChatbots(): Promise<ChatbotSummary[]> {
        const resp = await entityServer.list<Record<string, unknown>>(
            "llm_chatbot",
            { limit: 200 },
        );
        const items = resp?.data?.items ?? [];
        return items.map((row: Record<string, unknown>) => ({
            seq: Number(row.seq),
            name: String(row.name ?? ""),
            label: String(row.label ?? ""),
            ragEnabled: Boolean(row.rag_enabled),
            status: String(row.status ?? "active"),
            createdAt: String(row.created_time ?? ""),
        }));
    }

    /** 챗봇을 생성한다 */
    async createChatbot(input: ChatbotCreateInput): Promise<number> {
        const data: Record<string, unknown> = {
            name: input.name,
            label: input.label,
            rag_enabled: input.ragEnabled ?? false,
            status: "active",
        };
        if (input.systemMsg) data.system_msg = input.systemMsg;
        if (input.welcomeMessage) data.welcome_message = input.welcomeMessage;
        if (input.providerName) data.provider_name = input.providerName;
        if (input.ragTenantId) data.rag_tenant_id = input.ragTenantId;
        if (input.ragTopK != null) data.rag_top_k = input.ragTopK;
        if (input.ragMinScore != null) data.rag_min_score = input.ragMinScore;
        if (input.ragMetadata)
            data.rag_metadata = JSON.stringify(input.ragMetadata);

        const resp = await entityServer.submit("llm_chatbot", data);
        return resp.seq ?? 0;
    }

    /** 챗봇 설정을 수정한다 */
    async updateChatbot(seq: number, input: ChatbotUpdateInput): Promise<void> {
        const data: Record<string, unknown> = { seq };
        if (input.label != null) data.label = input.label;
        if (input.systemMsg != null) data.system_msg = input.systemMsg;
        if (input.welcomeMessage != null)
            data.welcome_message = input.welcomeMessage;
        if (input.providerName != null) data.provider_name = input.providerName;
        if (input.ragEnabled != null) data.rag_enabled = input.ragEnabled;
        if (input.ragTenantId != null) data.rag_tenant_id = input.ragTenantId;
        if (input.ragTopK != null) data.rag_top_k = input.ragTopK;
        if (input.ragMinScore != null) data.rag_min_score = input.ragMinScore;
        if (input.ragMetadata != null)
            data.rag_metadata = JSON.stringify(input.ragMetadata);
        if (input.status != null) data.status = input.status;

        await entityServer.submit("llm_chatbot", data);
    }

    /** 챗봇을 삭제한다 */
    async deleteChatbot(seq: number): Promise<void> {
        await entityServer.delete("llm_chatbot", seq);
    }

    // ── 세션 관리 ──────────────────────────────────────────────────────────

    /** 챗봇 대화 세션을 생성한다 (llm_conversation + chatbot_seq) */
    async createSession(
        chatbotSeq: number,
        providerName: string,
        title: string,
        userSeq?: number,
        sessionId?: string,
        systemMsg?: string,
    ): Promise<number> {
        const data: Record<string, unknown> = {
            chatbot_seq: chatbotSeq,
            provider_name: providerName,
            title,
            messages: JSON.stringify([]),
            message_count: 0,
            total_tokens: 0,
            status: "active",
        };
        if (userSeq) data.user_seq = userSeq;
        if (sessionId) data.session_id = sessionId;
        if (systemMsg) data.system_msg = systemMsg;

        const resp = await entityServer.submit("llm_conversation", data);
        return resp.seq ?? 0;
    }

    /** 세션의 메시지 배열과 시스템 메시지를 조회한다 */
    async getSessionMessages(
        sessionSeq: number,
    ): Promise<{ messages: Message[]; systemMsg: string }> {
        const resp = await entityServer.get<Record<string, unknown>>(
            "llm_conversation",
            sessionSeq,
        );
        const row = resp.data as Record<string, unknown>;
        if (!row) throw new Error(`Session seq=${sessionSeq} not found`);

        return {
            messages: parseMessages(row.messages),
            systemMsg: String(row.system_msg ?? ""),
        };
    }

    /** 세션에 메시지를 추가하고 누계 토큰을 업데이트한다 */
    async appendSessionMessages(
        sessionSeq: number,
        messages: Message[],
        usage?: { totalTokens?: number },
    ): Promise<void> {
        // 현재 메시지 로드
        const { messages: existing } =
            await this.getSessionMessages(sessionSeq);
        const all = [...existing, ...messages];
        const lastMsg =
            all.length > 0 ? truncate(all[all.length - 1].content, 200) : "";

        const data: Record<string, unknown> = {
            seq: sessionSeq,
            messages: JSON.stringify(all),
            message_count: all.length,
            last_message: lastMsg,
        };
        if (usage?.totalTokens) {
            // 누계 위해 기존 값 가져오기
            const resp = await entityServer.get<Record<string, unknown>>(
                "llm_conversation",
                sessionSeq,
            );
            const row = resp.data as Record<string, unknown>;
            data.total_tokens =
                Number(row?.total_tokens ?? 0) + (usage.totalTokens ?? 0);
        }

        await entityServer.submit("llm_conversation", data);
    }

    /** 챗봇에 귀속된 세션 목록을 조회한다 */
    async listSessions(
        filter: ChatbotSessionFilter,
    ): Promise<ChatbotSessionSummary[]> {
        const conditions: Record<string, unknown> = {
            chatbot_seq: filter.chatbotSeq,
        };
        if (filter.userSeq) conditions.user_seq = filter.userSeq;
        if (filter.sessionId) conditions.session_id = filter.sessionId;

        const resp = await entityServer.list<Record<string, unknown>>(
            "llm_conversation",
            {
                conditions,
                page: Math.floor(filter.offset / filter.limit) + 1,
                limit: filter.limit,
            },
        );
        const items = resp?.data?.items ?? [];
        return items.map((row: Record<string, unknown>) => ({
            sessionSeq: Number(row.seq),
            chatbotSeq: Number(row.chatbot_seq ?? filter.chatbotSeq),
            title: String(row.title ?? ""),
            messageCount: Number(row.message_count ?? 0),
            totalTokens: Number(row.total_tokens ?? 0),
            lastMessage: String(row.last_message ?? ""),
            updatedAt: String(row.updated_time ?? ""),
        }));
    }

    /** 세션을 삭제한다 */
    async deleteSession(sessionSeq: number): Promise<void> {
        await entityServer.delete("llm_conversation", sessionSeq);
    }
}

// ─── 변환 헬퍼 ───────────────────────────────────────────────────────────────

function rowToChatbot(seq: number, row: Record<string, unknown>): Chatbot {
    let ragMetadata: Record<string, string> | undefined;
    if (row.rag_metadata) {
        try {
            ragMetadata =
                typeof row.rag_metadata === "string"
                    ? JSON.parse(row.rag_metadata)
                    : (row.rag_metadata as Record<string, string>);
        } catch {
            /* ignore */
        }
    }

    return {
        seq,
        name: String(row.name ?? ""),
        label: String(row.label ?? ""),
        systemMsg: row.system_msg ? String(row.system_msg) : undefined,
        welcomeMessage: row.welcome_message
            ? String(row.welcome_message)
            : undefined,
        providerName: row.provider_name ? String(row.provider_name) : undefined,
        ragEnabled: Boolean(row.rag_enabled),
        ragTenantId: row.rag_tenant_id ? String(row.rag_tenant_id) : undefined,
        ragTopK: Number(row.rag_top_k ?? 5),
        ragMinScore: Number(row.rag_min_score ?? 0.7),
        ragMetadata,
        status: (row.status as "active" | "inactive") ?? "active",
        createdAt: String(row.created_time ?? ""),
    };
}
