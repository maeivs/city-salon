/** 게시글 목록 조회 및 상세 조회 핸들러 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";
import {
    resolveAccountSeq,
    toBoardCommentResponse,
} from "../utils/board-helpers.ts";
import { queueViewCountIncrement } from "../utils/view-count.ts";
import { applyOrLikeSearchConditions } from "@utils/search-conditions.ts";
import { resolveBoardCategoryByName } from "../utils/board-category.ts";

// ── 목록 조회 ────────────────────────────────────────────────────────────────

/** 카테고리별 게시글 목록을 검색/필터 조건과 함께 조회한다. */
export async function list(
    req: FastifyRequest<{
        Params: { category: string };
        Querystring: {
            page?: number;
            per_page?: number;
            search?: string;
            sort?: string;
            order?: "asc" | "desc";
            created_date_min?: string;
            created_date_max?: string;
            pinned?: string | boolean;
            root_seq?: number;
            depth?: number;
            status?: string;
        };
    }>,
    reply: FastifyReply,
) {
    const { category } = req.params;
    const {
        page = 1,
        per_page = 20,
        search,
        sort = "created_time",
        order = "desc",
        created_date_min,
        created_date_max,
        pinned,
        root_seq,
        depth,
        status,
    } = req.query;

    const catItem = await resolveBoardCategoryByName(
        category,
        false,
        Number(req.account?.license_seq ?? 0),
    );
    if (!catItem)
        return reply.code(404).send(fail("카테고리를 찾을 수 없습니다."));
    const filter: Record<string, unknown> = {
        category_name: category,
        status: status === "draft" && req.account?.seq ? "draft" : "published",
    };

    if (status === "draft" && req.account?.seq) {
        filter.account_seq = req.account.seq;
    }

    if (pinned === true || pinned === "true") filter.pinned = true;
    if (pinned === false || pinned === "false") filter.pinned = false;
    if (root_seq !== undefined) filter.root_seq = root_seq;
    if (depth !== undefined) filter.depth = depth;
    applyCreatedDateRangeFilter(filter, created_date_min, created_date_max);
    await applyBoardPostSearchConditions(
        filter,
        search,
        Number(req.account?.license_seq ?? 0),
    );

    const resp = await entityServer.list("board_post", {
        conditions: filter,
        page,
        limit: per_page,
        orderBy: sort,
        orderDir: order === "asc" ? "ASC" : "DESC",
    } as Parameters<typeof entityServer.list>[1]);

    const isAnonymous = catItem.anonymous_enabled === true;
    resp.data.items = resp.data.items.map((entry: unknown) => {
        const item = entry as Record<string, unknown>;
        return {
            ...item,
            account_seq: isAnonymous ? null : resolveAccountSeq(item),
        };
    });

    return reply.send(ok(resp.data));
}

/** 게시글 제목/작성자와 첨부파일 원본명 검색 조건을 함께 적용한다. */
async function applyBoardPostSearchConditions(
    filter: Record<string, unknown>,
    search: string | undefined,
    licenseSeq: number,
): Promise<void> {
    const candidateLicenseSeqs = await collectBoardPostLicenseSeqs(
        filter,
        licenseSeq,
    );
    applyOrLikeSearchConditions(filter, search, ["title", "author_name"]);

    const matchedPostSeqs = await collectFileMatchedPostSeqs(
        search,
        candidateLicenseSeqs,
    );
    if (matchedPostSeqs.length === 0) {
        return;
    }

    const currentOr = Array.isArray(filter.or) ? filter.or : [];
    filter.or = [...currentOr, ...matchedPostSeqs.map((seq) => ({ seq }))];
}

/** 첨부파일 원본명 검색으로 매칭되는 게시글 seq 목록을 수집한다. */
async function collectFileMatchedPostSeqs(
    search: string | undefined,
    licenseSeqs: number[],
): Promise<number[]> {
    const keyword = search?.trim();
    if (!keyword || keyword.length < 2 || licenseSeqs.length === 0) {
        return [];
    }

    try {
        const results = await Promise.all(
            licenseSeqs.map((licenseSeq) =>
                entityServer.list("file_meta", {
                    conditions: {
                        entity_name: "board_post",
                        license_seq: licenseSeq,
                        "original_name like": `%${keyword}%`,
                        or: [{ status: "active" }, { status: "pending" }],
                    },
                    fields: ["entity_seq"],
                    limit: 1000,
                } as Parameters<typeof entityServer.list>[1]),
            ),
        );

        const seqs = results.flatMap((resp) =>
            (resp.data.items as Record<string, unknown>[])
                .map((item) => Number(item.entity_seq ?? 0))
                .filter((seq) => Number.isInteger(seq) && seq > 0),
        );
        return [...new Set(seqs)];
    } catch {
        return [];
    }
}

/** 현재 게시글 필터에 해당하는 실제 license_seq 후보를 수집한다. */
async function collectBoardPostLicenseSeqs(
    filter: Record<string, unknown>,
    requestLicenseSeq: number,
): Promise<number[]> {
    if (requestLicenseSeq > 0) {
        return [requestLicenseSeq];
    }

    try {
        const resp = await entityServer.list("board_post", {
            conditions: { ...filter },
            limit: 1000,
        } as Parameters<typeof entityServer.list>[1]);

        const licenseSeqs = (resp.data.items as Record<string, unknown>[])
            .map((item) => Number(item.license_seq ?? 0))
            .filter((seq) => Number.isInteger(seq) && seq > 0);
        return [...new Set(licenseSeqs)];
    } catch {
        return [];
    }
}

/** 카테고리별 유효 게시글을 서버에서 필터링해 제한 수만큼 조회한다. */
export async function validList(
    req: FastifyRequest<{
        Params: { category: string };
        Querystring: {
            limit?: number;
            per_page?: number;
        };
    }>,
    reply: FastifyReply,
) {
    const { category } = req.params;
    const limit = normalizeValidListLimit(
        req.query.limit ?? req.query.per_page,
    );

    const catItem = await resolveBoardCategoryByName(
        category,
        false,
        Number(req.account?.license_seq ?? 0),
    );
    if (!catItem)
        return reply.code(404).send(fail("카테고리를 찾을 수 없습니다."));

    const pinnedItems = await collectValidBoardPosts(category, limit, true);
    const normalItems =
        pinnedItems.length < limit
            ? await collectValidBoardPosts(
                  category,
                  limit - pinnedItems.length,
                  false,
              )
            : [];

    const isAnonymous = catItem.anonymous_enabled === true;
    const items = [...pinnedItems, ...normalItems].map((entry) => ({
        ...entry,
        account_seq: isAnonymous ? null : resolveAccountSeq(entry),
    }));

    return reply.send(
        ok({
            items,
            total: items.length,
            page: 1,
            limit,
        }),
    );
}

/** 등록일 범위를 ES 조건으로 변환한다. */
function applyCreatedDateRangeFilter(
    filter: Record<string, unknown>,
    createdDateMin?: string,
    createdDateMax?: string,
): void {
    const normalizedMin = normalizeDateInput(createdDateMin);
    const normalizedMax = normalizeDateInput(createdDateMax);

    if (normalizedMin) {
        filter["created_time >="] = `${normalizedMin} 00:00:00`;
    }

    if (normalizedMax) {
        filter["created_time <="] = `${normalizedMax} 23:59:59`;
    }
}

/** 날짜 입력을 YYYY-MM-DD 문자열로 정규화한다. */
function normalizeDateInput(value?: string): string | undefined {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        return undefined;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        return normalized;
    }

    const matched = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
    return matched?.[1];
}

/** valid_list limit 값을 안전한 범위로 정규화한다. */
function normalizeValidListLimit(value: unknown): number {
    const parsed = Number(value ?? 5);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 5;
    }

    return Math.min(50, Math.floor(parsed));
}

/** 유효기간 비교용 게시글 일시를 타임스탬프로 변환한다. */
function parseBoardPostValidityTime(value: unknown): number | null {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        return null;
    }

    const parsed = new Date(normalized.replace(" ", "T")).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

/** 현재 서버 시각 기준 게시글 유효기간이 살아있는지 판별한다. */
function isValidBoardPost(item: Record<string, unknown>): boolean {
    const now = Date.now();
    const validFromTime = parseBoardPostValidityTime(item.valid_from);
    const validToTime = parseBoardPostValidityTime(item.valid_to);

    if (validFromTime !== null && validFromTime > now) {
        return false;
    }

    if (validToTime !== null && validToTime < now) {
        return false;
    }

    return true;
}

/** pinned 여부별 후보를 최신순으로 훑어 유효 게시글만 수집한다. */
async function collectValidBoardPosts(
    category: string,
    limit: number,
    pinned: boolean,
): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    const pageSize = 100;

    for (let page = 1; items.length < limit; page += 1) {
        const resp = await entityServer.list("board_post", {
            conditions: {
                category_name: category,
                status: "published",
                pinned,
            },
            page,
            limit: pageSize,
            orderBy: "created_time",
            orderDir: "DESC",
        } as Parameters<typeof entityServer.list>[1]);

        const pageItems = (resp.data.items as Record<string, unknown>[]).filter(
            isValidBoardPost,
        );
        items.push(...pageItems);

        if ((resp.data.items as unknown[]).length < pageSize) {
            break;
        }
    }

    return items.slice(0, limit);
}

// ── 상세 조회 ────────────────────────────────────────────────────────────────

/** 게시글 상세와 태그, 파일, 댓글, 내 글 여부를 함께 반환한다. */
export async function detail(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);

    const post = await entityServer.get("board_post", seq);
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const item = post.data as Record<string, unknown>;
    if (item.status === "deleted")
        return reply.code(404).send(fail("삭제된 게시글입니다."));

    const catItem = item.category as Record<string, unknown> | undefined;
    const isAnonymous = catItem?.anonymous_enabled === true;

    if (catItem) queueViewCountIncrement(req, item, catItem);

    const tags = extractTagNames(item.tags);
    const files = await normalizeFiles(item.files);
    const comments = normalizeComments(item.comments, isAnonymous);

    const accountSeq = req.account?.seq as number | undefined;

    let likedByMe = false;
    if (accountSeq) {
        // 게시글 좋아요 여부는 ES after_get 훅(my_like)으로 이미 판별된다.
        likedByMe = !!item.my_like;

        // 댓글 좋아요 여부를 한 번에 조회한다.
        await markCommentLikedByMe(comments, accountSeq);
    }

    const ownerAccountSeq = resolveAccountSeq(item);
    const {
        category: _category,
        guest_password: _guestPassword,
        my_like: _myLike,
        ...safeItem
    } = item;

    return reply.send(
        ok({
            ...safeItem,
            account_seq: isAnonymous ? null : ownerAccountSeq,
            tags,
            files,
            comments,
            comment_count: comments.length,
            is_mine: accountSeq ? ownerAccountSeq === accountSeq : false,
            liked_by_me: likedByMe,
        }),
    );
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/** after_get 훅이 반환한 태그 배열에서 이름 문자열만 추출한다. */
function extractTagNames(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((tag) => {
            if (typeof tag === "string") return tag;
            const name = (tag as Record<string, unknown>).name;
            return typeof name === "string" ? name : null;
        })
        .filter((t): t is string => Boolean(t));
}

/** 파일 메타에서 원본 파일명을 조회해 상세 응답 파일명을 보강한다. */
async function resolveBoardFileDisplayName(
    file: Record<string, unknown>,
): Promise<string> {
    const originalName =
        typeof file.original_name === "string" ? file.original_name.trim() : "";
    if (originalName) {
        return originalName;
    }

    const currentName = typeof file.name === "string" ? file.name.trim() : "";
    if (currentName) {
        return currentName;
    }

    const uuid = typeof file.uuid === "string" ? file.uuid.trim() : "";
    if (!uuid) {
        return "";
    }

    try {
        const meta = await entityServer.fileMeta("board_post", uuid);
        const metaItem = (meta.data ?? {}) as unknown as Record<
            string,
            unknown
        >;
        const metaOriginalName =
            typeof metaItem.original_name === "string"
                ? metaItem.original_name.trim()
                : "";
        if (metaOriginalName) {
            return metaOriginalName;
        }
        const metaName =
            typeof metaItem.name === "string" ? metaItem.name.trim() : "";
        return metaName;
    } catch {
        return "";
    }
}

/** after_get 훅이 반환한 파일 배열에서 name 필드를 보정한다. */
async function normalizeFiles(
    raw: unknown,
): Promise<Record<string, unknown>[]> {
    if (!Array.isArray(raw)) return [];
    const normalized = await Promise.all(
        raw.map(async (file) => {
            const f = file as Record<string, unknown>;
            const displayName = await resolveBoardFileDisplayName(f);
            return {
                ...f,
                name: displayName,
            };
        }),
    );
    return normalized;
}

/** after_get 훅이 반환한 댓글 배열을 익명 여부 기준으로 정리한다. */
function normalizeComments(
    raw: unknown,
    isAnonymous: boolean,
): Record<string, unknown>[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((c) =>
        toBoardCommentResponse(c as Record<string, unknown>, isAnonymous),
    );
}

/** 댓글 목록에 현재 사용자의 좋아요 여부를 일괄 표시한다. */
async function markCommentLikedByMe(
    comments: Record<string, unknown>[],
    accountSeq: number,
): Promise<void> {
    if (comments.length === 0) return;

    const commentSeqs = comments.map((c) => c.seq as number);
    const myLikes = await entityServer.list("board_comment_like", {
        conditions: {
            account_seq: accountSeq,
            or: commentSeqs.map((s) => ({ comment_seq: s })),
        },
        limit: commentSeqs.length,
    });
    const likedSet = new Set(
        myLikes.data.items.map(
            (l: unknown) => (l as Record<string, unknown>).comment_seq,
        ),
    );
    for (const c of comments) {
        c.liked_by_me = likedSet.has(c.seq);
    }
}
