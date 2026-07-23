/** 본문 @username 멘션 파싱 및 동기화 유틸 */

import { entityServer } from "@system/api";

const MENTION_PATTERN = /@([a-zA-Z0-9_]+)/g;

/** 본문에서 @username 패턴을 찾아 멘션 엔티티를 생성한다. */
export async function parseMentions(
    sourceType: "post" | "comment",
    sourceSeq: number,
    content: string,
) {
    MENTION_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MENTION_PATTERN.exec(content)) !== null) {
        const user = await entityServer.find("user", { username: match[1] });
        if (user.data) {
            await entityServer.submit("board_mention", {
                source_type: sourceType,
                source_seq: sourceSeq,
                mentioned_account_seq: (user.data as Record<string, unknown>)
                    .seq,
            });
        }
    }
}

/** 수정된 본문 기준으로 멘션 목록을 동기화한다. */
export async function updateMentions(
    sourceType: "post" | "comment",
    sourceSeq: number,
    newContent: string,
) {
    const existing = await entityServer.list("board_mention", {
        conditions: { source_type: sourceType, source_seq: sourceSeq },
        limit: 100,
    });

    MENTION_PATTERN.lastIndex = 0;
    const newMentions = new Set<number>();
    let match: RegExpExecArray | null;
    while ((match = MENTION_PATTERN.exec(newContent)) !== null) {
        const user = await entityServer.find("user", { username: match[1] });
        if (user.data) {
            newMentions.add(
                (user.data as Record<string, unknown>).seq as number,
            );
        }
    }

    for (const m of existing.data.items) {
        const mData = m as Record<string, unknown>;
        if (!newMentions.has(mData.mentioned_account_seq as number)) {
            await entityServer.delete("board_mention", mData.seq as number);
        } else {
            newMentions.delete(mData.mentioned_account_seq as number);
        }
    }

    for (const userSeq of newMentions) {
        await entityServer.submit("board_mention", {
            source_type: sourceType,
            source_seq: sourceSeq,
            mentioned_account_seq: userSeq,
        });
    }
}
