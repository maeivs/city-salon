import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";
import { listResolvedBoardCategories } from "../utils/board-category.ts";

// ── 카테고리 목록 ─────────────────────────────────────────────────────────────

/** 활성 여부 옵션에 따라 게시판 카테고리 목록을 정렬 조회한다. */
export async function list(
    req: FastifyRequest<{
        Querystring: { include_inactive?: string };
    }>,
    reply: FastifyReply,
) {
    const showInactive = req.query.include_inactive === "true";
    const result = await listResolvedBoardCategories(
        showInactive,
        Number(req.account?.license_seq ?? 0),
    );

    return reply.send(ok(result));
}

// ── 카테고리 상세 ─────────────────────────────────────────────────────────────

/** 게시판 카테고리 한 건의 상세 정보를 반환한다. */
export async function detail(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const licenseSeq = Number(req.account?.license_seq ?? 0);

    const resp = await entityServer.find("board_category", {
        seq,
        ...(licenseSeq > 0 ? { license_seq: licenseSeq } : {}),
    });
    if (!resp.data)
        return reply.code(404).send(fail("카테고리를 찾을 수 없습니다."));

    return reply.send(ok(resp.data));
}

// ── 카테고리 생성 ─────────────────────────────────────────────────────────────

/** 관리자 권한으로 새 게시판 카테고리를 생성한다. */
export async function create(
    req: FastifyRequest<{
        Body: {
            name: string;
            label: string;
            sort_order?: number;
            view_count_mode?: string;
            anonymous_enabled?: boolean;
            comment_enabled?: boolean;
            rating_enabled?: boolean;
            file_enabled?: boolean;
            like_enabled?: boolean;
            guest_write_enabled?: boolean;
            status?: string;
        };
    }>,
    reply: FastifyReply,
) {
    if (!req.account?.is_admin)
        return reply.code(403).send(fail("관리자 권한이 필요합니다."));

    const {
        name,
        label,
        sort_order = 0,
        view_count_mode = "daily",
        anonymous_enabled = false,
        comment_enabled = true,
        rating_enabled = false,
        file_enabled = false,
        like_enabled = false,
        guest_write_enabled = false,
        status = "active",
    } = req.body;
    const licenseSeq = Number(req.account?.license_seq ?? 0);

    const resp = await entityServer.submit("board_category", {
        ...(licenseSeq > 0 ? { license_seq: licenseSeq } : {}),
        name,
        label,
        sort_order,
        view_count_mode,
        anonymous_enabled,
        comment_enabled,
        rating_enabled,
        file_enabled,
        like_enabled,
        guest_write_enabled,
        status,
    });

    return reply.code(201).send(ok({ seq: resp.seq }));
}

// ── 카테고리 수정 ─────────────────────────────────────────────────────────────

/** 관리자 권한으로 기존 게시판 카테고리 설정을 수정한다. */
export async function update(
    req: FastifyRequest<{
        Params: { seq: string };
        Body: Record<string, unknown>;
    }>,
    reply: FastifyReply,
) {
    if (!req.account?.is_admin)
        return reply.code(403).send(fail("관리자 권한이 필요합니다."));

    const seq = Number(req.params.seq);
    const licenseSeq = Number(req.account?.license_seq ?? 0);

    const existing = await entityServer.find("board_category", {
        seq,
        ...(licenseSeq > 0 ? { license_seq: licenseSeq } : {}),
    });
    if (!existing.data)
        return reply.code(404).send(fail("카테고리를 찾을 수 없습니다."));

    await entityServer.submit("board_category", {
        ...req.body,
        seq,
        ...(licenseSeq > 0 ? { license_seq: licenseSeq } : {}),
    });
    return reply.send(ok(null));
}

// ── 카테고리 삭제 ─────────────────────────────────────────────────────────────

/** 관리자 권한으로 게시판 카테고리를 삭제한다. */
export async function remove(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    if (!req.account?.is_admin)
        return reply.code(403).send(fail("관리자 권한이 필요합니다."));

    const seq = Number(req.params.seq);
    const licenseSeq = Number(req.account?.license_seq ?? 0);

    const existing = await entityServer.find("board_category", {
        seq,
        ...(licenseSeq > 0 ? { license_seq: licenseSeq } : {}),
    });
    if (!existing.data)
        return reply.code(404).send(fail("카테고리를 찾을 수 없습니다."));

    await entityServer.delete("board_category", seq);
    return reply.send(ok(null));
}
