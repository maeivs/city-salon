/**
 * ExampleEntityAdapter — Entity Server 어댑터
 *
 * entity-server-client를 통해 엔티티에 접근하는 계층.
 * 서비스 로직과 DB/Entity Server를 분리하기 위한 어댑터 패턴.
 *
 * 새 확장을 만들 때:
 *  1. example → 모듈명으로 교체
 *  2. Querier 인터페이스에 필요한 메서드를 선언
 *  3. EntityAdapter 클래스에서 entityServer API를 호출하여 구현
 */

import { entityServer } from "@system/api";

// ─── Querier Interface ───────────────────────────────────────────────────────

/** 엔티티 접근 인터페이스 — 서비스에서 이 인터페이스만 의존한다 */
export interface ExampleQuerier {
    /** 레코드를 생성하고 seq를 반환한다 */
    create(data: Record<string, unknown>): Promise<number>;

    /** seq로 단건 조회한다 */
    getBySeq(seq: number): Promise<Record<string, unknown> | null>;

    /** 조건으로 목록을 조회한다 */
    list(
        filter: ExampleFilter,
    ): Promise<{ items: Record<string, unknown>[]; total: number }>;

    /** 레코드를 수정한다 */
    update(seq: number, patch: Record<string, unknown>): Promise<void>;

    /** 레코드를 삭제한다 */
    remove(seq: number): Promise<void>;
}

export interface ExampleFilter {
    page?: number;
    limit?: number;
    orderBy?: string;
    orderDir?: "ASC" | "DESC";
    conditions?: Record<string, unknown>;
}

// ─── Entity Adapter 구현 ────────────────────────────────────────────────────

/** Entity Server 기반 Querier 구현 */
export class ExampleEntityAdapter implements ExampleQuerier {
    /** 대상 엔티티 이름 (entities/*.json) */
    private readonly entity: string;

    constructor(entity = "example") {
        this.entity = entity;
    }

    async create(data: Record<string, unknown>): Promise<number> {
        const resp = await entityServer.submit(this.entity, data);
        return (resp as any).seq ?? 0;
    }

    async getBySeq(seq: number): Promise<Record<string, unknown> | null> {
        const resp = await entityServer.list(this.entity, {
            conditions: { seq },
            limit: 1,
        });
        const items = ((resp as any).data?.items ??
            (resp as any).items ??
            []) as Record<string, unknown>[];
        return items.length > 0 ? items[0] : null;
    }

    async list(
        filter: ExampleFilter,
    ): Promise<{ items: Record<string, unknown>[]; total: number }> {
        const resp = await entityServer.list(this.entity, {
            conditions: filter.conditions,
            limit: filter.limit ?? 20,
            page: filter.page ?? 1,
            orderBy: filter.orderBy,
            orderDir: filter.orderDir,
        });
        const data = (resp as any).data ?? resp;
        return {
            items: (data.items ?? []) as Record<string, unknown>[],
            total: (data.total ?? 0) as number,
        };
    }

    async update(seq: number, patch: Record<string, unknown>): Promise<void> {
        await entityServer.submit(this.entity, { ...patch, seq });
    }

    async remove(seq: number): Promise<void> {
        await entityServer.delete(this.entity, seq);
    }
}
