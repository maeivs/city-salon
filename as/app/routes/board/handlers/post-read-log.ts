/** 게시글 읽음 표시 핸들러 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";

/** 게시글 읽음 로그를 upsert 형태로 기록한다. */
export async function markRead(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const postSeq = Number(req.params.seq);
    const account = req.account!;

    const post = await entityServer.find("board_post", { seq: postSeq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    await entityServer.submit("board_read_log", {
        post_seq: postSeq,
        account_seq: account.seq,
        read_time: new Date().toISOString(),
    });

    return reply.send(ok({ read: true }));
}
