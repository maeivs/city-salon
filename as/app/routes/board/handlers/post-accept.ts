/** 답변 채택 핸들러 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";
import { resolveAccountSeq } from "../utils/board-helpers.ts";

/** 원글 작성자 또는 관리자가 답글 하나를 채택 상태로 전환한다. */
export async function accept(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const account = req.account!;

    const post = await entityServer.find("board_post", { seq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const item = post.data as Record<string, unknown>;

    if (item.parent_seq === null)
        return reply
            .code(400)
            .send(fail("원글은 채택할 수 없습니다. 답글만 채택 가능합니다."));

    const rootPost = await entityServer.find("board_post", {
        seq: item.root_seq,
    });
    if (!rootPost.data)
        return reply.code(404).send(fail("원글을 찾을 수 없습니다."));

    const rootItem = rootPost.data as Record<string, unknown>;
    if (resolveAccountSeq(rootItem) !== account.seq && !account.is_admin)
        return reply.code(403).send(fail("채택 권한이 없습니다."));

    const prevAccepted = await entityServer.list("board_post", {
        conditions: { root_seq: item.root_seq, accepted: true },
        limit: 100,
    });
    for (const p of prevAccepted.data.items) {
        await entityServer.submit("board_post", {
            seq: (p as Record<string, unknown>).seq,
            accepted: false,
        });
    }

    await entityServer.submit("board_post", { seq, accepted: true });
    return reply.send(ok(null));
}
