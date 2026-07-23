/** 게시글 댓글 CRUD 핸들러 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";
import { resolveBoardAuthorName } from "../utils/author-name.ts";
import {
    resolveAccountSeq,
    resolveLicenseSeq,
    toBoardCommentResponse,
} from "../utils/board-helpers.ts";
import { parseMentions, updateMentions } from "../utils/mention-sync.ts";
import { resolveBoardCategoryByName } from "../utils/board-category.ts";

// ── 댓글 목록 ────────────────────────────────────────────────────────────────

/** 게시글에 속한 댓글 목록을 익명 여부까지 반영해 조회한다. */
export async function list(
    req: FastifyRequest<{
        Params: { postSeq: string };
        Querystring: {
            page?: number;
            per_page?: number;
            sort?: string;
            order?: "asc" | "desc";
        };
    }>,
    reply: FastifyReply,
) {
    const postSeq = Number(req.params.postSeq);
    const {
        page = 1,
        per_page = 50,
        sort = "created_time",
        order = "asc",
    } = req.query;

    const post = await entityServer.find("board_post", { seq: postSeq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const catItem = await resolveBoardCategoryByName(
        String((post.data as Record<string, unknown>).category_name ?? ""),
        true,
        resolveLicenseSeq(post.data as Record<string, unknown>) ?? undefined,
    );
    const isAnonymous = catItem?.anonymous_enabled === true;

    const resp = await entityServer.list("board_comment", {
        conditions: { post_seq: postSeq, status: "active" },
        page,
        limit: per_page,
        orderBy: sort,
        orderDir: order === "asc" ? "ASC" : "DESC",
        fields: ["*"],
    });

    resp.data.items = resp.data.items.map((entry: unknown) =>
        toBoardCommentResponse(entry as Record<string, unknown>, isAnonymous),
    );

    return reply.send(ok(resp.data));
}

// ── 댓글 작성 ────────────────────────────────────────────────────────────────

/** 로그인 사용자가 게시글에 댓글을 작성하고 멘션을 기록한다. */
export async function create(
    req: FastifyRequest<{
        Params: { postSeq: string };
        Body: { content: string };
    }>,
    reply: FastifyReply,
) {
    const postSeq = Number(req.params.postSeq);
    const { content } = req.body;
    const account = req.account!;

    const post = await entityServer.find("board_post", { seq: postSeq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const postData = post.data as Record<string, unknown>;
    const catItem = await resolveBoardCategoryByName(
        String(postData.category_name ?? ""),
        true,
        resolveLicenseSeq(postData) ?? undefined,
    );
    if (!catItem)
        return reply.code(404).send(fail("카테고리를 찾을 수 없습니다."));

    if (catItem.comment_enabled !== true)
        return reply.code(403).send(fail("댓글이 허용되지 않는 게시판입니다."));

    const isAnonymous = catItem.anonymous_enabled === true;
    const authorName = resolveBoardAuthorName(account.name, isAnonymous);

    if (!authorName)
        return reply.code(400).send(fail("작성자 이름이 설정되지 않았습니다."));

    const resp = await entityServer.submit("board_comment", {
        post_seq: postSeq,
        root_seq: (postData.root_seq as number) ?? postSeq,
        account_seq: account.seq,
        author_name: authorName,
        content,
    });

    await parseMentions("comment", resp.seq as number, content);

    const created = await entityServer.find("board_comment", { seq: resp.seq });
    if (!created.data) {
        return reply.code(201).send(ok({ seq: resp.seq }));
    }

    return reply
        .code(201)
        .send(
            ok(
                toBoardCommentResponse(
                    created.data as Record<string, unknown>,
                    isAnonymous,
                ),
            ),
        );
}

// ── 댓글 수정 ────────────────────────────────────────────────────────────────

/** 작성자 또는 관리자가 댓글 내용을 수정하고 멘션을 동기화한다. */
export async function update(
    req: FastifyRequest<{
        Params: { seq: string };
        Body: { content: string };
    }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const { content } = req.body;
    const account = req.account!;

    const comment = await entityServer.find("board_comment", { seq });
    if (!comment.data)
        return reply.code(404).send(fail("댓글을 찾을 수 없습니다."));

    const item = comment.data as Record<string, unknown>;
    if (resolveAccountSeq(item) !== account.seq && !account.is_admin)
        return reply.code(403).send(fail("수정 권한이 없습니다."));

    await entityServer.submit("board_comment", { seq, content });
    await updateMentions("comment", seq, content);

    return reply.send(ok(null));
}

// ── 댓글 삭제 ────────────────────────────────────────────────────────────────

/** 작성자 또는 관리자가 댓글을 삭제 경로로 처리한다. */
export async function remove(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const account = req.account!;

    const comment = await entityServer.find("board_comment", { seq });
    if (!comment.data)
        return reply.code(404).send(fail("댓글을 찾을 수 없습니다."));

    const item = comment.data as Record<string, unknown>;
    if (resolveAccountSeq(item) !== account.seq && !account.is_admin)
        return reply.code(403).send(fail("삭제 권한이 없습니다."));

    await entityServer.delete("board_comment", seq);
    return reply.send(ok(null));
}
