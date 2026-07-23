/**
 * 대화 세션 저장소 — Entity Server 어댑터
 *
 * entity-server-client를 통해 llm_conversation 엔티티 CRUD
 */

import { entityServer } from "@system/api";
import { logger } from "@system/api";
import type {
    ConversationStore,
    ConversationCreateInput,
    Conversation,
    ConversationSummary,
    ConversationFilter,
    Message,
    TokenUsage,
} from "./types/index.ts";

export class ConversationEntityAdapter implements ConversationStore {
    /** 새 대화 세션을 생성한다 */
    async createConversation(input: ConversationCreateInput): Promise<number> {
        const data: Record<string, unknown> = {
            provider_name: input.providerName,
            title: input.title,
            messages: JSON.stringify([]),
            message_count: 0,
            total_tokens: 0,
            status: "active",
        };
        if (input.userSeq) data.user_seq = input.userSeq;
        if (input.systemMsg) data.system_msg = input.systemMsg;

        const resp = await entityServer.submit("llm_conversation", data);
        return resp.seq ?? 0;
    }

    /** 대화 세션을 조회한다 */
    async getConversation(conversationSeq: number): Promise<Conversation> {
        const resp = await entityServer.get<Record<string, unknown>>(
            "llm_conversation",
            conversationSeq,
        );
        const row = resp.data as Record<string, unknown>;
        if (!row)
            throw new Error(`Conversation seq=${conversationSeq} not found`);

        let messages: Message[] = [];
        try {
            const raw =
                typeof row.messages === "string"
                    ? row.messages
                    : JSON.stringify(row.messages ?? []);
            messages = JSON.parse(raw);
        } catch {
            /* empty */
        }

        return {
            seq: conversationSeq,
            providerName: String(row.provider_name ?? ""),
            title: String(row.title ?? ""),
            systemMsg: String(row.system_msg ?? ""),
            messages,
            totalTokens: Number(row.total_tokens ?? 0),
            userSeq: Number(row.user_seq ?? 0) || undefined,
            createdAt: String(row.created_time ?? ""),
            updatedAt: String(row.updated_time ?? ""),
        };
    }

    /** 대화에 메시지를 추가한다 */
    async appendMessages(
        conversationSeq: number,
        messages: Message[],
        usage?: TokenUsage,
    ): Promise<void> {
        const conv = await this.getConversation(conversationSeq);
        const all = [...conv.messages, ...messages];
        const lastMsg =
            all.length > 0 ? truncate(all[all.length - 1].content, 200) : "";
        const newTokens = usage?.totalTokens ?? 0;

        await entityServer.submit("llm_conversation", {
            seq: conversationSeq,
            messages: JSON.stringify(all),
            message_count: all.length,
            total_tokens: conv.totalTokens + newTokens,
            last_message: lastMsg,
        });
    }

    /** 대화 목록을 조회한다 */
    async listConversations(
        filter: ConversationFilter,
    ): Promise<ConversationSummary[]> {
        const opts: Record<string, unknown> = {
            status: "active",
            page: Math.floor(filter.offset / Math.max(filter.limit, 1)) + 1,
            limit: filter.limit || 20,
            order: "-updated_time",
        };
        if (filter.userSeq) opts.user_seq = filter.userSeq;
        if (filter.providerName) opts.provider_name = filter.providerName;

        const resp = await entityServer.list("llm_conversation", opts as any);
        const rows = (resp.data as any)?.items ?? [];

        return rows.map((row: Record<string, unknown>) => ({
            seq: Number(row.seq ?? 0),
            title: String(row.title ?? ""),
            providerName: String(row.provider_name ?? ""),
            messageCount: Number(row.message_count ?? 0),
            totalTokens: Number(row.total_tokens ?? 0),
            lastMessage: String(row.last_message ?? ""),
            updatedAt: String(row.updated_time ?? ""),
        }));
    }

    /** 대화를 삭제(아카이브)한다 */
    async deleteConversation(conversationSeq: number): Promise<void> {
        await entityServer.submit("llm_conversation", {
            seq: conversationSeq,
            status: "archived",
        });
    }

    /** 대화 제목을 수정한다 */
    async updateTitle(conversationSeq: number, title: string): Promise<void> {
        await entityServer.submit("llm_conversation", {
            seq: conversationSeq,
            title,
        });
    }
}

/** 문자열을 최대 길이로 자른다 */
function truncate(s: string, maxLen: number): string {
    const arr = [...s];
    return arr.length <= maxLen ? s : arr.slice(0, maxLen).join("");
}
