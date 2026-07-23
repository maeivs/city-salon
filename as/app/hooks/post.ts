/**
 * Post 엔티티 훅 예제 — 게시글 작성/조회 시 가공 로직
 *
 * Entity Server의 /v1/post 요청을 가로채는 훅입니다.
 * registry.ts 에서 { post: postHook } 으로 등록하면
 * 클라이언트 → Entity App Server → Entity Server 흐름에서 before/after 훅이 자동 실행됩니다.
 *
 * - beforeSubmit: XSS 방지, 자동 필드
 * - afterSubmit:  로깅
 * - afterGet:     본문 미리보기 추가 (find 조회에도 자동 적용)
 * - beforeDelete: 작성자 본인만 삭제 허용
 * - beforeList:   기본 페이징/정렬
 * - afterList:    요약 필드 추가
 */

import type {
    EntityHook,
    JwtUserInfo,
    SubmitContext,
    DeleteContext,
} from "@system/api";
import { logger, ForbiddenError } from "@system/api";

/** 간단한 HTML 태그 제거 (XSS 방지 예시) */
function stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, "");
}

export const postHook: EntityHook = {
    /**
     * 게시글 등록/수정 전 데이터 가공
     *
     * - ctx.old: 수정 전 데이터 (신규 시 null)
     * - ctx.new: 클라이언트 요청 데이터
     * - 제목/본문 HTML 태그 제거 (간이 XSS 방지)
     * - 신규: 작성자 자동 설정, 슬러그 생성
     */
    async beforeSubmit(entity: string, ctx: SubmitContext, user: JwtUserInfo) {
        const data = { ...ctx.new };

        // HTML 태그 제거
        if (data.title) {
            data.title = stripHtml(data.title as string);
        }
        if (data.content) {
            data.content = stripHtml(data.content as string);
        }

        if (!ctx.old) {
            // 신규 게시글
            data.author_id = user.sub;
            data.author_name = user.email?.split("@")[0] ?? "unknown";
            data.created_time = new Date().toISOString();

            // 제목 기반 슬러그 생성
            if (data.title) {
                data.slug = (data.title as string)
                    .toLowerCase()
                    .replace(/[^a-z0-9가-힣\s-]/g, "")
                    .replace(/\s+/g, "-")
                    .slice(0, 80);
            }
        }

        // 수정 시 수정일 갱신
        data.updated_time = new Date().toISOString();

        return data;
    },

    /**
     * 게시글 등록/수정 후 로깅
     *
     * - ctx.old / ctx.new 로 변경 전후 비교 가능
     */
    async afterSubmit(entity: string, ctx: SubmitContext, user: JwtUserInfo) {
        const action = ctx.old ? "수정" : "작성";
        logger.info(
            { seq: ctx.new.seq, title: ctx.new.title, action },
            `게시글 ${action} 완료`,
        );
        return ctx.new;
    },

    /**
     * 게시글 단건 조회 후 — 본문 미리보기 추가
     */
    async afterGet(entity: string, data: any, user: JwtUserInfo) {
        if (data.content) {
            data.preview =
                data.content.slice(0, 100) +
                (data.content.length > 100 ? "…" : "");
        }
        return data;
    },

    /**
     * 게시글 삭제 전 — 작성자 본인 또는 관리자만 삭제 허용
     *
     * ctx.data에 삭제 대상 게시글 데이터가 담겨 있으므로
     * 별도 entityServer.get() 호출 없이 바로 확인 가능
     */
    async beforeDelete(entity: string, ctx: DeleteContext, user: JwtUserInfo) {
        // 관리자는 항상 삭제 가능
        if (user.role === "admin") return true;

        // 작성자 본인 확인 — ctx.data에서 바로 확인
        if (ctx.data && ctx.data.author_id !== user.sub) {
            throw new ForbiddenError(
                "본인이 작성한 게시글만 삭제할 수 있습니다",
            );
        }

        logger.info(
            { seq: ctx.seq, title: ctx.data?.title, userId: user.sub },
            "게시글 삭제 요청",
        );
        return true;
    },

    /**
     * 게시글 목록 전 — 기본 파라미터 설정
     *
     * - 기본 정렬: 최신순
     * - 삭제된 게시글 제외 필터 자동 추가
     */
    async beforeList(entity: string, params: any, user: JwtUserInfo) {
        // 기본 정렬
        if (!params.orderBy) {
            params.orderBy = "created_time";
            params.orderDir = "desc";
        }

        // 삭제된 게시글 제외 (soft delete)
        params.conditions = params.conditions || [];
        params.conditions.push({
            field: "is_deleted",
            operator: "eq",
            value: false,
        });

        return params;
    },

    /**
     * 게시글 목록 후 — 본문 미리보기 추가
     *
     * - content → preview (100자 요약)
     */
    async afterList(entity: string, result: any, user: JwtUserInfo) {
        if (result.list) {
            result.list = result.list.map((post: any) => ({
                ...post,
                preview: post.content
                    ? post.content.slice(0, 100) +
                      (post.content.length > 100 ? "…" : "")
                    : "",
            }));
        }
        return result;
    },
};
