import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, entityServer } from "@system/api";

/** 태그명을 저장용 slug 형태로 정규화한다. */
function normalizeBoardTagSlug(tagName: string): string {
    return tagName.trim().toLowerCase().replace(/\s+/g, "-");
}

/** 없는 태그 조회 오류는 null 로 낮춰 find-or-create 흐름을 유지한다. */
async function findBoardTagBySlug(
    slug: string,
): Promise<Record<string, unknown> | null> {
    try {
        const tagRes = await entityServer.find("board_tag", { name: slug });
        return (tagRes.data as Record<string, unknown> | null) ?? null;
    } catch (error) {
        if ((error as { status?: number })?.status === 404) {
            return null;
        }
        throw error;
    }
}

// ── 태그 목록 검색 ────────────────────────────────────────────────────────────

/** 검색어와 사용량 기준으로 태그 후보 목록을 반환한다. */
export async function list(
    req: FastifyRequest<{
        Querystring: { search?: string; limit?: number };
    }>,
    reply: FastifyReply,
) {
    const { search, limit = 30 } = req.query;

    const resp = await entityServer.list("board_tag", {
        ...(search ? { conditions: { name: search } } : {}),
        limit,
        orderBy: "use_count",
        orderDir: "DESC",
    });

    return reply.send(ok(resp.data));
}

// ── 게시글 태그 설정 ──────────────────────────────────────────────────────────

/** 요청으로 받은 태그 배열을 특정 게시글에 반영한다. */
export async function setPostTagsHandler(
    req: FastifyRequest<{
        Params: { seq: string };
        Body: { tags: string[] };
    }>,
    reply: FastifyReply,
) {
    const postSeq = Number(req.params.seq);
    const { tags } = req.body;

    await setPostTags(postSeq, tags);
    return reply.send(ok(null));
}

// ── 내부 공유 헬퍼 ────────────────────────────────────────────────────────────

/**
 * posts.ts create/update 에서도 공유 사용
 */
/** 게시글의 태그 연결을 전체 재구성하고 새 태그는 자동 생성한다. */
export async function setPostTags(
    postSeq: number,
    tags: string[],
): Promise<void> {
    // 기존 post-tag 연결 전체 삭제
    const existing = await entityServer.list("board_post_tag", {
        conditions: { post_seq: postSeq },
        limit: 200,
    });
    for (const pt of existing.data.items) {
        await entityServer.delete(
            "board_post_tag",
            (pt as Record<string, unknown>).seq as number,
        );
    }

    const normalizedTags = Array.from(
        new Map(
            tags
                .map((tagName) => tagName.trim())
                .filter(Boolean)
                .map((tagName) => [normalizeBoardTagSlug(tagName), tagName]),
        ).entries(),
    );

    // 각 태그 이름 → slug 변환 후 find-or-create
    for (const [slug, label] of normalizedTags) {
        const tag = await findBoardTagBySlug(slug);

        let tagSeq: number;
        if (tag) {
            tagSeq = tag.seq as number;
        } else {
            const created = await entityServer.submit("board_tag", {
                name: slug,
                label,
            });
            tagSeq = created.seq;
        }

        await entityServer.submit("board_post_tag", {
            post_seq: postSeq,
            tag_seq: tagSeq,
        });
    }
}
