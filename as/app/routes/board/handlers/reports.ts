import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";

// ── 신고 제출 ────────────────────────────────────────────────────────────────

/** 게시글 또는 댓글에 대한 신고를 중복 없이 등록한다. */
export async function submit(
    req: FastifyRequest<{
        Params: { seq: string };
        Body: { reason: string; detail?: string };
    }>,
    reply: FastifyReply,
) {
    const targetSeq = Number(req.params.seq);
    const account = req.account!;
    const userSeq = account.seq;
    const { reason, detail } = req.body;

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

    // 중복 신고 확인
    const duplicate = await entityServer.find("board_report", {
        target_type: targetType,
        target_seq: targetSeq,
        account_seq: userSeq,
    });
    if (duplicate.data)
        return reply.code(400).send(fail("이미 신고한 항목입니다."));

    await entityServer.submit("board_report", {
        target_type: targetType,
        target_seq: targetSeq,
        account_seq: userSeq,
        reason,
        detail: detail ?? null,
    });

    return reply.code(201).send(ok(null));
}

// ── 관리자: 신고 목록 ─────────────────────────────────────────────────────────

/** 관리자용 신고 목록을 상태 조건과 페이지 단위로 조회한다. */
export async function adminList(
    req: FastifyRequest<{
        Querystring: {
            status?: string;
            page?: number;
            per_page?: number;
        };
    }>,
    reply: FastifyReply,
) {
    if (!req.account?.is_admin)
        return reply.code(403).send(fail("관리자 권한이 필요합니다."));

    const { status, page = 1, per_page = 20 } = req.query;

    const conditions: Record<string, unknown> = {};
    if (status) conditions.status = status;

    const resp = await entityServer.list("board_report", {
        conditions,
        page,
        limit: per_page,
        orderBy: "created_time",
        orderDir: "DESC",
    });

    return reply.send(ok(resp.data));
}

// ── 관리자: 신고 처리 ─────────────────────────────────────────────────────────

/** 관리자가 신고 상태를 변경하고 필요하면 대상 글이나 댓글을 숨긴다. */
export async function adminUpdate(
    req: FastifyRequest<{
        Params: { seq: string };
        Body: {
            status: "resolved" | "dismissed";
            hide_target?: boolean;
        };
    }>,
    reply: FastifyReply,
) {
    if (!req.account?.is_admin)
        return reply.code(403).send(fail("관리자 권한이 필요합니다."));

    const seq = Number(req.params.seq);
    const { status, hide_target = false } = req.body;

    if (!["resolved", "dismissed"].includes(status))
        return reply
            .code(400)
            .send(fail("status는 resolved 또는 dismissed여야 합니다."));

    const report = await entityServer.find("board_report", { seq });
    if (!report.data)
        return reply.code(404).send(fail("신고를 찾을 수 없습니다."));

    await entityServer.submit("board_report", { seq, status });

    // resolved + hide_target → 대상 숨김 처리
    if (status === "resolved" && hide_target) {
        const reportData = report.data as {
            target_type: "post" | "comment";
            target_seq: number;
        };
        const entityName =
            reportData.target_type === "post" ? "board_post" : "board_comment";
        await entityServer.submit(entityName, {
            seq: reportData.target_seq,
            status: "hidden",
        });
    }

    return reply.send(ok(null));
}
