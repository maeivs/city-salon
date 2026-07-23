/**
 * Board 라우트 플러그인
 *
 * 자동 로더가 `app/routes/board/routes.ts`를 탐색하여
 * prefix `/v1/board` 으로 등록한다.
 *
 * 엔드포인트 목록:
 *   GET    /categories                         → 카테고리 목록
 *   GET    /categories/:seq                    → 카테고리 상세
 *   POST   /categories                         → 카테고리 생성 (관리자)
 *   PUT    /categories/:seq                    → 카테고리 수정 (관리자)
 *   DELETE /categories/:seq                    → 카테고리 삭제 (관리자)
 *
 *   GET    /:category/list                     → 게시글 목록
 *   GET    /:category/valid_list               → 유효 게시글 목록
 *   GET    /posts/:seq                         → 게시글 상세
 *   POST   /:category/submit                   → 게시글 작성 (회원)
 *   PATCH  /posts/:seq                         → 게시글 수정
 *   DELETE /posts/:seq                         → 게시글 삭제
 *
 *   GET    /posts/:postSeq/comments            → 댓글 목록
 *   POST   /posts/:postSeq/comments/submit     → 댓글 작성
 *   PUT    /comments/:seq                      → 댓글 수정
 *   DELETE /comments/:seq                      → 댓글 삭제
 *
 *   GET    /posts/:postSeq/files               → 파일 목록
 *   POST   /posts/:postSeq/files               → 파일 업로드
 *   GET    /files/:uuid                        → 파일 뷰/다운로드
 *   DELETE /files/:uuid                        → 파일 삭제
 *
 *   POST   /:category/guest-submit             → 비회원 글작성
 *   POST   /posts/:seq/guest-auth              → 비회원 본인확인 → 임시 토큰
 *
 *   POST   /posts/:seq/like                    → 좋아요 토글
 *   POST   /posts/:seq/accept                  → 답변 채택
 *
 *   POST   /posts/:seq/rating                  → 게시글 별점
 *   POST   /comments/:seq/rating               → 댓글 별점
 *
 *   GET    /tags                               → 태그 목록
 *   PUT    /posts/:seq/tags                    → 게시글 태그 일괄 설정
 *
 *   POST   /posts/:seq/report                  → 게시글 신고
 *   POST   /comments/:seq/report               → 댓글 신고
 *   GET    /admin/reports                      → 신고 목록 (관리자)
 *   PATCH  /admin/reports/:seq                 → 신고 상태 변경 (관리자)
 *
 *   POST   /posts/:seq/read                    → 읽음 표시
 *
 *   GET    /mentions                           → 내 멘션 목록
 *   PATCH  /mentions/:seq/read                 → 멘션 읽음 처리
 */

import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger, logFmt, ensurePluginEntities } from "@system/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h = (fn: any): RouteHandlerMethod => fn;
import * as posts from "./handlers/posts.ts";
import * as postWrite from "./handlers/post-write.ts";
import * as postAccept from "./handlers/post-accept.ts";
import * as postReadLog from "./handlers/post-read-log.ts";
import * as comments from "./handlers/comments.ts";
import * as files from "./handlers/files.ts";
import * as categories from "./handlers/categories.ts";
import * as likes from "./handlers/likes.ts";
import * as commentLikes from "./handlers/comment-likes.ts";
import * as ratings from "./handlers/ratings.ts";
import * as tags from "./handlers/tags.ts";
import * as reports from "./handlers/reports.ts";
import * as mentions from "./handlers/mentions.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const suppressRouteRegisterLog = true;

export default async function boardRoutes(app: FastifyInstance): Promise<void> {
    await ensurePluginEntities(__dirname).catch((err) =>
        logger.warn({ err }, "board: ensureEntities failed"),
    );

    const auth = { preHandler: app.authRequired.bind(app) };

    // ── 카테고리 ──────────────────────────────────────────────────────────
    app.get("/categories", h(categories.list));
    app.get("/categories/:seq", h(categories.detail));
    app.post("/categories", auth, h(categories.create));
    app.put("/categories/:seq", auth, h(categories.update));
    app.delete("/categories/:seq", auth, h(categories.remove));

    // ── 게시글 · 답글 (board_post 통합) ──────────────────────────────────
    app.get("/:category/list", h(posts.list));
    app.get("/:category/valid_list", h(posts.validList));
    app.get("/posts/:seq", h(posts.detail));
    app.post("/:category/submit", auth, h(postWrite.create));
    app.patch("/posts/:seq", auth, h(postWrite.update));
    app.post("/posts/:seq/expire", auth, h(postWrite.expire));
    app.delete("/posts/:seq", auth, h(postWrite.remove));

    // ── 댓글 ──────────────────────────────────────────────────────────────
    app.get("/posts/:postSeq/comments", h(comments.list));
    app.post("/posts/:postSeq/comments/submit", auth, h(comments.create));
    app.put("/comments/:seq", auth, h(comments.update));
    app.delete("/comments/:seq", auth, h(comments.remove));

    // ── 파일 ──────────────────────────────────────────────────────────────
    app.get("/posts/:postSeq/files", h(files.list));
    app.post("/posts/:postSeq/files", auth, h(files.upload));
    app.get("/files/:uuid", h(files.view));
    app.delete("/files/:uuid", auth, h(files.remove));

    // ── 비회원 글작성 ─────────────────────────────────────────────────────
    app.post("/:category/guest-submit", h(postWrite.create));
    app.post("/posts/:seq/guest-auth", h(postWrite.guestAuth));

    // ── 좋아요 토글 ───────────────────────────────────────────────────────
    app.post("/posts/:seq/like", auth, h(likes.toggle));
    app.post("/comments/:seq/like", auth, h(commentLikes.toggle));
    // ── 답변 채택 ─────────────────────────────────────────────────────────
    app.post("/posts/:seq/accept", auth, h(postAccept.accept));

    // ── 별점 ──────────────────────────────────────────────────────────────
    app.post("/posts/:seq/rating", auth, h(ratings.upsert));
    app.post("/comments/:seq/rating", auth, h(ratings.upsert));

    // ── 태그 ──────────────────────────────────────────────────────────────
    app.get("/tags", h(tags.list));
    app.put("/posts/:seq/tags", auth, h(tags.setPostTagsHandler));

    // ── 신고 ──────────────────────────────────────────────────────────────
    app.post("/posts/:seq/report", auth, h(reports.submit));
    app.post("/comments/:seq/report", auth, h(reports.submit));
    app.get("/admin/reports", auth, h(reports.adminList));
    app.patch("/admin/reports/:seq", auth, h(reports.adminUpdate));

    // ── 읽음 표시 ─────────────────────────────────────────────────────────
    app.post("/posts/:seq/read", auth, h(postReadLog.markRead));

    // ── 멘션 ──────────────────────────────────────────────────────────────
    app.get("/mentions", auth, h(mentions.list));
    app.patch("/mentions/:seq/read", auth, h(mentions.markRead));
}
