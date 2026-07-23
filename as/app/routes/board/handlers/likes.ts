/** 게시글 좋아요 토글 핸들러 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";

/** 게시글에 저장된 좋아요 캐시 수를 안전하게 숫자로 읽는다. */
function readCachedLikeCount(post: Record<string, unknown>): number {
    return Math.max(0, Number(post.like_count ?? 0) || 0);
}

/** 동시 좋아요 요청에서 이미 생성된 행 오류인지 확인한다. */
function isDuplicateLikeError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /duplicate|1062|unique/i.test(message);
}

/** 동시 좋아요 취소 요청에서 이미 삭제된 행 오류인지 확인한다. */
function isMissingLikeError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /not found|not updated/i.test(message);
}

/** 현재 사용자의 게시글 좋아요 상태를 토글한다. */
export async function toggle(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const postSeq = Number(req.params.seq);
    const account = req.account!;

    const post = await entityServer.find("board_post", { seq: postSeq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));
    const cachedLikeCount = readCachedLikeCount(
        post.data as Record<string, unknown>,
    );

    const existing = await entityServer.list("board_like", {
        conditions: { post_seq: postSeq, account_seq: account.seq },
        page: 1,
        limit: 1,
    });

    const existingItem = (existing.data?.items?.[0] ?? null) as Record<
        string,
        unknown
    > | null;

    if (existingItem) {
        try {
            await entityServer.delete(
                "board_like",
                existingItem.seq as number,
                {
                    hard: true,
                },
            );
        } catch (error) {
            if (!isMissingLikeError(error)) throw error;
        }
        const likeCount = Math.max(0, cachedLikeCount - 1);
        return reply.send(ok({ liked: false, like_count: likeCount }));
    }

    try {
        await entityServer.submit("board_like", {
            post_seq: postSeq,
            account_seq: account.seq,
        });
    } catch (error) {
        if (!isDuplicateLikeError(error)) throw error;
    }
    const likeCount = cachedLikeCount + 1;
    return reply.send(ok({ liked: true, like_count: likeCount }));
}
