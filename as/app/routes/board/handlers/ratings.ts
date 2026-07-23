import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";

/** 게시글 또는 댓글에 대한 현재 사용자의 별점을 생성 또는 수정한다. */
export async function upsert(
    req: FastifyRequest<{
        Params: { seq: string };
        Body: { score: number };
    }>,
    reply: FastifyReply,
) {
    const targetSeq = Number(req.params.seq);
    const { score } = req.body;
    const account = req.account!;
    const userSeq = account.seq;

    if (!Number.isInteger(score) || score < 1 || score > 5)
        return reply.code(400).send(fail("score는 1~5 정수여야 합니다."));

    // URL 기반 target_type 판별
    const targetType: "post" | "comment" = (
        req.routeOptions.url ?? ""
    ).includes("/comments/")
        ? "comment"
        : "post";

    // 대상 존재 확인
    const entityName = targetType === "post" ? "board_post" : "board_comment";
    const target = await entityServer.find(entityName, { seq: targetSeq });
    if (!target.data)
        return reply
            .code(404)
            .send(
                fail(
                    `${targetType === "post" ? "게시글" : "댓글"}을 찾을 수 없습니다.`,
                ),
            );

    const existing = await entityServer.find("board_rating", {
        target_type: targetType,
        target_seq: targetSeq,
        account_seq: userSeq,
    });

    if (existing.data) {
        const existingSeq = (existing.data as Record<string, unknown>)
            .seq as number;
        await entityServer.submit("board_rating", {
            seq: existingSeq,
            score,
        });
        return reply.send(ok({ updated: true }));
    }

    await entityServer.submit("board_rating", {
        target_type: targetType,
        target_seq: targetSeq,
        account_seq: userSeq,
        score,
    });
    return reply.send(ok({ created: true }));
}
