/**
 * Order 엔티티 훅 예제 — 주문 엔티티의 비즈니스 로직
 *
 * Entity Server의 /v1/order 요청을 가로채는 훅입니다.
 * registry.ts 에서 { order: orderHook } 으로 등록하면
 * 클라이언트 → Entity App Server → Entity Server 흐름에서 before/after 훅이 자동 실행됩니다.
 *
 * - beforeGet:    조회 권한 제어
 * - afterGet:     민감 정보 마스킹 (find 조회에도 자동 적용)
 * - beforeSubmit: 데이터 유효성 검증 + 자동 필드 설정
 * - afterSubmit:  주문 생성 후 알림/로깅
 * - beforeDelete: 완료된 주문 삭제 차단
 * - afterDelete:  연관 데이터 정리
 * - beforeList:   기본 정렬/필터 추가
 * - afterList:    응답 데이터 가공
 */

import type {
    EntityHook,
    JwtUserInfo,
    SubmitContext,
    DeleteContext,
} from "@system/api";
import { logger, ForbiddenError, ValidationError } from "@system/api";

export const orderHook: EntityHook = {
    // ─────────────────────────────────────────────
    // Get 훅
    // ─────────────────────────────────────────────

    /**
     * 주문 단건 조회 전 — 접근 제어
     *
     * - 일반 사용자는 본인 주문만 조회 가능 (아래 예시는 주석)
     * - false 반환 또는 throw 시 조회 차단
     */
    async beforeGet(entity: string, seq: number, user: JwtUserInfo) {
        // 예: 관리자가 아니면 요청만 허용 (소유권 검사는 afterGet 또는 beforeList에서)
        logger.debug({ entity, seq, userId: user.sub }, "주문 조회 요청");
        return true;
    },

    /**
     * 주문 단건 조회 후 — 민감 정보 마스킹
     *
     * - 반환값이 클라이언트 응답이 됨
     * - 관리자가 아닌 경우 전화번호 마스킹
     */
    async afterGet(entity: string, data: any, user: JwtUserInfo) {
        if (user.role !== "admin" && data.phone) {
            data.phone = data.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
        }
        return data;
    },

    // ─────────────────────────────────────────────
    // Submit 훅
    // ─────────────────────────────────────────────

    /**
     * 주문 등록/수정 전 데이터 변환 및 검증
     *
     * - ctx.old: 수정 전 데이터 (신규 INSERT 시 null)
     * - ctx.new: 클라이언트가 보낸 요청 데이터
     * - 반환값이 실제 submit 되는 데이터가 됨
     */
    async beforeSubmit(entity: string, ctx: SubmitContext, user: JwtUserInfo) {
        const data = { ...ctx.new };

        if (!ctx.old) {
            // ── 신규 주문 ─────────────────────────────
            if (!data.items || (data.items as any[]).length === 0) {
                throw new ValidationError("주문 항목이 비어있습니다");
            }

            data.order_no = `ORD-${Date.now()}`;
            data.status = "pending";
            data.ordered_by = user.sub;
            data.ordered_time = new Date().toISOString();

            logger.info(
                { orderNo: data.order_no, userId: user.sub },
                "새 주문 생성 준비",
            );
        } else {
            // ── 수정 — 변경 불가 필드 보호 ───────────
            delete data.order_no;
            delete data.ordered_by;
            delete data.ordered_time;

            // old/new 비교 예시: 상태 변경 감지
            if (ctx.old.status !== data.status) {
                logger.info(
                    { seq: data.seq, from: ctx.old.status, to: data.status },
                    "주문 상태 변경 감지",
                );
            }
        }

        return data;
    },

    /**
     * 주문 등록/수정 후 사이드이펙트
     *
     * - ctx.old: 수정 전 데이터 (신규 시 null)
     * - ctx.new: 엔티티서버에 저장된 결과 데이터
     * - 실패해도 주문 데이터는 이미 저장됨 (로그만 남김)
     */
    async afterSubmit(entity: string, ctx: SubmitContext, user: JwtUserInfo) {
        logger.info(
            { seq: ctx.new.seq, orderNo: ctx.new.order_no },
            "주문 처리 완료",
        );

        // 신규 주문 알림
        // if (!ctx.old && ctx.new.status === "pending") {
        //     await sendNotification(user.email, `주문 ${ctx.new.order_no} 접수`);
        // }

        // 상태 변경 시 알림
        // if (ctx.old && ctx.old.status !== ctx.new.status) {
        //     await sendStatusChangeNotification(ctx.new, ctx.old.status, ctx.new.status);
        // }

        return ctx.new;
    },

    // ─────────────────────────────────────────────
    // Delete 훅
    // ─────────────────────────────────────────────

    /**
     * 주문 삭제 전 검증
     *
     * - ctx.data로 삭제 대상 데이터 확인 가능
     * - 완료/배송중 주문은 삭제 차단
     * - false 반환 시 삭제가 실행되지 않음
     */
    async beforeDelete(entity: string, ctx: DeleteContext, user: JwtUserInfo) {
        // 완료/배송중 주문 삭제 차단
        if (ctx.data) {
            const status = ctx.data.status;
            if (status === "completed" || status === "shipping") {
                throw new ForbiddenError(
                    "완료/배송중인 주문은 삭제할 수 없습니다",
                );
            }
        }

        logger.info(
            { seq: ctx.seq, orderNo: ctx.data?.order_no, userId: user.sub },
            "주문 삭제 요청",
        );
        return true;
    },

    /**
     * 주문 삭제 후 정리
     *
     * - ctx.data로 삭제된 주문 정보 확인 (로그/알림 등)
     * - 연관 데이터 정리 (결제 취소, 재고 복구 등)
     * - 실패해도 삭제는 이미 완료됨
     */
    async afterDelete(entity: string, ctx: DeleteContext, user: JwtUserInfo) {
        logger.info(
            { seq: ctx.seq, orderNo: ctx.data?.order_no, userId: user.sub },
            "주문 삭제 완료 — 정리 작업 수행",
        );

        // 예: 결제 취소 API 호출
        // await cancelPayment(seq);
    },

    // ─────────────────────────────────────────────
    // List 훅
    // ─────────────────────────────────────────────

    /**
     * 주문 목록 조회 전 파라미터 변환
     *
     * - 기본 정렬 추가
     * - 관리자가 아니면 본인 주문만 조회하도록 필터 추가
     */
    async beforeList(entity: string, params: any, user: JwtUserInfo) {
        // 기본 정렬: 최신 주문 순
        if (!params.orderBy) {
            params.orderBy = "ordered_time";
            params.orderDir = "desc";
        }

        // 일반 사용자는 본인 주문만 조회
        if (user.role !== "admin") {
            params.conditions = params.conditions || [];
            params.conditions.push({
                field: "ordered_by",
                operator: "eq",
                value: user.sub,
            });
        }

        return params;
    },

    /**
     * 주문 목록 조회 후 응답 가공
     *
     * - 민감 정보 마스킹
     * - 추가 필드 계산
     */
    async afterList(entity: string, result: any, user: JwtUserInfo) {
        // 목록의 각 주문에 대해 가공
        if (result.list) {
            result.list = result.list.map((order: any) => ({
                ...order,
                // 민감 정보 마스킹 (관리자가 아닌 경우)
                ...(user.role !== "admin" && order.phone
                    ? {
                          phone: order.phone.replace(
                              /(\d{3})\d{4}(\d{4})/,
                              "$1****$2",
                          ),
                      }
                    : {}),
            }));
        }

        return result;
    },
};
