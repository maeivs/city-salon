/**
 * Entity Server Example 핸들러 — entityServer 클라이언트 사용 예제
 *
 * 이 파일은 Entity App Server에서 Entity Server에 접속하여 엔티티 CRUD를 수행하는 방법을 보여줍니다.
 * entityServer 는 @system/api 에서 import 하며 Entity Server의 REST API를 호출합니다.
 *
 * ⚠ 주의: .env 에 ENTITY_SERVER_URL, ENTITY_API_KEY 이 설정되어 있어야 합니다.
 *   사용하는 엔티티(예: "post")는 entities/ 폴더에 JSON 정의가 필요합니다.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, NotFoundError } from "@system/api";
import type {
    CreatePostBody,
    UpdatePostBody,
    SeqParams,
    SearchPostsQuery,
    HistoryQuery,
} from "./types/index.ts";

// 엔티티 이름 — entities/post.json 에 정의된 엔티티
const ENTITY = "post";

// ─────────────────────────────────────────────────
// 기본 CRUD 예제
// ─────────────────────────────────────────────────

/**
 * GET /example-es/posts?page=1&limit=20
 * 게시글 목록 조회 (list)
 */
export async function listPosts(
    req: FastifyRequest<{ Querystring: SearchPostsQuery }>,
    reply: FastifyReply,
) {
    const { page = 1, limit = 20, orderBy, orderDir } = req.query;

    const resp = await entityServer.list(ENTITY, {
        page,
        limit,
        orderBy,
        orderDir,
    });

    return reply.send(ok(resp.data));
}

/**
 * GET /example-es/posts/:seq
 * 게시글 단건 조회 (get)
 */
export async function getPost(
    req: FastifyRequest<{ Params: SeqParams }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);

    const resp = await entityServer.get(ENTITY, seq);
    if (!resp.data) {
        throw new NotFoundError(`Post ${seq} not found`);
    }

    return reply.send(ok(resp.data));
}

/**
 * POST /example-es/posts
 * 게시글 생성 (submit — seq 없으면 INSERT)
 */
export async function createPost(
    req: FastifyRequest<{ Body: CreatePostBody }>,
    reply: FastifyReply,
) {
    const { title, content, category = "general" } = req.body;

    const resp = await entityServer.submit(ENTITY, {
        title,
        content,
        category,
        status: "draft",
    });

    return reply.code(201).send(ok({ seq: resp.seq }));
}

/**
 * PUT /example-es/posts/:seq
 * 게시글 수정 (submit — seq 있으면 UPDATE)
 */
export async function updatePost(
    req: FastifyRequest<{ Params: SeqParams; Body: UpdatePostBody }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const updates = req.body;

    const resp = await entityServer.submit(ENTITY, {
        seq,
        ...updates,
    });

    return reply.send(ok({ seq: resp.seq }));
}

/**
 * DELETE /example-es/posts/:seq
 * 게시글 삭제 (soft delete)
 */
export async function deletePost(
    req: FastifyRequest<{ Params: SeqParams }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);

    const resp = await entityServer.delete(ENTITY, seq);

    return reply.send(ok({ deleted: resp.deleted }));
}

// ─────────────────────────────────────────────────
// 고급 예제
// ─────────────────────────────────────────────────

/**
 * GET /example-es/posts/search?q=keyword&category=tech&status=published
 * 게시글 검색 (query — 조건 기반 검색)
 */
export async function searchPosts(
    req: FastifyRequest<{ Querystring: SearchPostsQuery }>,
    reply: FastifyReply,
) {
    const { q, category, status, page = 1, limit = 20 } = req.query;

    // conditions 동적 구성
    const conditions: Record<string, unknown> = {};
    if (category) conditions.category = category;
    if (status) conditions.status = status;
    if (q) conditions.title = q; // title 필드에서 검색 (엔티티 인덱스 필드)

    const resp = await entityServer.list(ENTITY, {
        page,
        limit,
        conditions,
    });

    if (resp.data.items.length === 0) {
        return reply.send(fail("No posts found"));
    }

    return reply.send(ok(resp.data));
}

/**
 * POST /example-es/posts/:seq/publish
 * 게시글 발행 — 트랜잭션 예제
 *
 * 게시글 상태를 published로 변경하고,
 * publish_log 엔티티에 발행 기록을 남기는 것을 하나의 트랜잭션으로 처리합니다.
 */
export async function publishPost(
    req: FastifyRequest<{ Params: SeqParams }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);

    // 트랜잭션 시작
    const txId = await entityServer.transStart();

    try {
        // 1) 게시글 상태 변경
        await entityServer.submit(
            ENTITY,
            {
                seq,
                status: "published",
                published_time: new Date().toISOString(),
            },
            { transactionId: txId },
        );

        // 2) 발행 로그 기록 (publish_log 엔티티가 있다고 가정)
        await entityServer.submit(
            "publish_log",
            {
                post_seq: seq,
                action: "publish",
                created_time: new Date().toISOString(),
            },
            { transactionId: txId },
        );

        // 커밋
        const result = await entityServer.transCommit(txId);
        return reply.send(ok({ published: true, results: result.results }));
    } catch (err) {
        // 롤백
        await entityServer.transRollback(txId).catch(() => {});
        throw err;
    }
}

/**
 * GET /example-es/posts/:seq/history?page=1&limit=10
 * 게시글 변경 이력 조회 (history)
 */
export async function getPostHistory(
    req: FastifyRequest<{ Params: SeqParams; Querystring: HistoryQuery }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const { page = 1, limit = 10 } = req.query;

    const resp = await entityServer.history(ENTITY, seq, { page, limit });

    return reply.send(ok(resp.data));
}
