import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";

function resolveLicenseSeq(item: Record<string, unknown>): number | null {
    const licenseSeq = Number(item.license_seq);
    return Number.isInteger(licenseSeq) && licenseSeq > 0 ? licenseSeq : null;
}

// ── 멘션 목록 ────────────────────────────────────────────────────────────────

/** 현재 사용자에게 도착한 멘션 목록을 읽음 상태 조건과 함께 조회한다. */
export async function list(
    req: FastifyRequest<{
        Querystring: {
            is_read?: string | boolean;
            page?: number;
            per_page?: number;
        };
    }>,
    reply: FastifyReply,
) {
    const userSeq = req.account!.seq;
    const licenseSeq = Number(req.account!.license_seq);
    const { is_read, page = 1, per_page = 20 } = req.query;

    const conditions: Record<string, unknown> = {
        ...(Number.isInteger(licenseSeq) && licenseSeq > 0
            ? { license_seq: licenseSeq }
            : {}),
        mentioned_account_seq: userSeq,
    };
    if (is_read === true || is_read === "true") conditions.is_read = true;
    if (is_read === false || is_read === "false") conditions.is_read = false;

    const resp = await entityServer.list("board_mention", {
        conditions,
        page,
        limit: per_page,
        orderBy: "created_time",
        orderDir: "DESC",
    });

    return reply.send(ok(resp.data));
}

// ── 멘션 읽음 처리 ────────────────────────────────────────────────────────────

/** 현재 사용자 본인의 멘션만 읽음 상태로 변경한다. */
export async function markRead(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const userSeq = req.account!.seq;

    const mention = await entityServer.find("board_mention", { seq });
    if (!mention.data)
        return reply.code(404).send(fail("멘션을 찾을 수 없습니다."));

    const mentionData = mention.data as Record<string, unknown>;
    const licenseSeq = resolveLicenseSeq(mentionData);
    if (mentionData.mentioned_account_seq !== userSeq)
        return reply.code(403).send(fail("권한이 없습니다."));

    if (!licenseSeq)
        return reply.code(400).send(fail("license 정보를 찾을 수 없습니다."));

    await entityServer.submit("board_mention", {
        seq,
        license_seq: licenseSeq,
        is_read: true,
    });
    return reply.send(ok(null));
}
