/**
 * Profile Memory 저장소 — Entity Server 어댑터
 *
 * llm_user_profile 엔티티를 통해 사용자별 기억 항목을 CRUD한다.
 * 대화 시 system prompt에 자동 주입하는 formatForPrompt()를 제공한다.
 */

import { entityServer } from "@system/api";
import type {
    ProfileStore,
    UserProfileEntry,
    UserProfileFilter,
    UserProfileUpsertInput,
} from "./types/index.ts";

export class ProfileEntityAdapter implements ProfileStore {
    /** 사용자의 활성 메모리 항목을 조회한다 */
    async getProfiles(filter: UserProfileFilter): Promise<UserProfileEntry[]> {
        const opts: Record<string, unknown> = {
            user_seq: filter.userSeq,
            limit: 200,
            order: "key",
        };
        if (!filter.includeInactive) {
            opts.status = "active";
        }
        if (filter.scope) {
            opts.scope = filter.scope;
        }
        if (filter.chatbotSeq) {
            opts.chatbot_seq = filter.chatbotSeq;
        }

        const resp = await entityServer.list("llm_user_profile", opts as any);
        const rows = (resp.data as any)?.items ?? [];

        return rows.map((row: Record<string, unknown>) => rowToEntry(row));
    }

    /** 메모리 항목을 upsert한다 (user_seq + scope + key 기준 unique) */
    async upsertProfile(input: UserProfileUpsertInput): Promise<number> {
        const scope = input.scope ?? "global";
        const data: Record<string, unknown> = {
            user_seq: input.userSeq,
            scope,
            key: input.key,
            value: input.value,
            source: input.source ?? "manual",
            status: "active",
        };
        if (input.chatbotSeq) {
            data.chatbot_seq = input.chatbotSeq;
        }

        const resp = await entityServer.submit("llm_user_profile", data);
        return resp.seq ?? 0;
    }

    /** 메모리 항목을 비활성화(soft-delete)한다 */
    async deactivateProfile(seq: number, userSeq: number): Promise<void> {
        // 소유자 확인 후 상태 변경
        await this._assertOwner(seq, userSeq);
        await entityServer.submit("llm_user_profile", {
            seq,
            status: "inactive",
        });
    }

    /** 메모리 항목을 삭제한다 */
    async deleteProfile(seq: number, userSeq: number): Promise<void> {
        await this._assertOwner(seq, userSeq);
        await entityServer.delete("llm_user_profile", seq);
    }

    /**
     * 활성 메모리를 system prompt 삽입용 문자열로 포맷한다.
     *
     * 반환 예:
     * ```
     * [사용자 메모리]
     * - name: 홍길동
     * - preference: 답변은 짧고 명확하게
     * - goal: React 마스터하기
     * ```
     */
    async formatForPrompt(filter: UserProfileFilter): Promise<string> {
        const entries = await this.getProfiles({
            ...filter,
            includeInactive: false,
        });
        if (entries.length === 0) return "";

        const lines = entries.map((e) => `- ${e.key}: ${e.value}`);
        return `[사용자 메모리]\n${lines.join("\n")}`;
    }

    private async _assertOwner(seq: number, userSeq: number): Promise<void> {
        const resp = await entityServer.get<Record<string, unknown>>(
            "llm_user_profile",
            seq,
        );
        const row = resp.data as Record<string, unknown>;
        if (!row) throw new Error(`Profile seq=${seq} not found`);
        if (Number(row.user_seq) !== userSeq) {
            throw new Error(`Profile seq=${seq} not found`);
        }
    }
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

function rowToEntry(row: Record<string, unknown>): UserProfileEntry {
    return {
        seq: Number(row.seq ?? 0),
        userSeq: Number(row.user_seq ?? 0),
        scope: String(row.scope ?? "global"),
        chatbotSeq: row.chatbot_seq ? Number(row.chatbot_seq) : undefined,
        key: String(row.key ?? ""),
        value: String(row.value ?? ""),
        source: (row.source as "manual" | "extracted") ?? "manual",
        status: (row.status as "active" | "inactive") ?? "active",
        createdAt: String(row.created_time ?? ""),
        updatedAt: String(row.updated_time ?? ""),
    };
}
