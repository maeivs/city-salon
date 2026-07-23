/** 댓글 좋아요 토글 핸들러 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";

/** 현재 사용자의 댓글 좋아요 상태를 토글한다. */
export async function toggle(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const commentSeq = Number(req.params.seq);
    const account = req.account!;

    const comment = await entityServer.find("board_comment", { seq: commentSeq });
    if (!comment.data)
        return reply.code(404).send(fail("댓글을 찾을 수 없습니다."));

    const existing = await entityServer.list("board_comment_like", {
        conditions: { comment_seq: commentSeq, account_seq: account.seq },
        page: 1,
        limit: 1,
    });

    const existingItem = (existing.data?.items?.[0] ?? null) as Record<
        string,
        unknown
    > | null;

    if (existingItem) {
        await entityServer.delete("board_comment_like", existingItem.seq as number, { hard: true });
        return reply.send(ok({ liked: false }));
    }

    await entityServer.submit("board_comment_like", {
        comment_seq: commentSeq,
        account_seq: account.seq,
    });
    return reply.send(ok({ liked: true }));
}
