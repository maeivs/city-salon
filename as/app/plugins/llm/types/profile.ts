// ─── Profile Memory 타입 ────────────────────────────────────────────────────

export interface UserProfileEntry {
    seq: number;
    userSeq: number;
    scope: string;
    chatbotSeq?: number;
    key: string;
    value: string;
    source: "manual" | "extracted";
    status: "active" | "inactive";
    createdAt: string;
    updatedAt: string;
}

export interface UserProfileUpsertInput {
    userSeq: number;
    key: string;
    value: string;
    scope?: string;
    chatbotSeq?: number;
    source?: "manual" | "extracted";
}

export interface UserProfileFilter {
    userSeq: number;
    scope?: string;
    chatbotSeq?: number;
    /** inactive 포함 여부 (기본: false) */
    includeInactive?: boolean;
}

export interface ProfileStore {
    /** 특정 사용자의 활성 메모리 항목을 조회한다 */
    getProfiles(filter: UserProfileFilter): Promise<UserProfileEntry[]>;

    /** 메모리 항목을 upsert한다 (user_seq + scope + key 기준) */
    upsertProfile(input: UserProfileUpsertInput): Promise<number>;

    /** 메모리 항목을 비활성화(soft-delete)한다 */
    deactivateProfile(seq: number, userSeq: number): Promise<void>;

    /** 메모리 항목을 삭제한다 */
    deleteProfile(seq: number, userSeq: number): Promise<void>;

    /** 사용자의 활성 메모리를 system prompt 삽입용 문자열로 포맷한다 */
    formatForPrompt(filter: UserProfileFilter): Promise<string>;
}
