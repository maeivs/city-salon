import { entityServer, logger } from "@system/api";
import type {
    AddrSigunguRow,
    AddrSidoRow,
    BaseBootstrapPayload,
    BoardCategoryRow,
    BootstrapSidoRow,
    PvGroupRow,
    PvItemRow,
    RbacRoleRow,
} from "../types/baseBootstrap.ts";
import { listResolvedBoardCategories } from "../../board/utils/board-category.ts";

/** 목록 응답에서 엔티티 아이템 배열만 꺼낸다. */
async function listBootstrapRows<T>(
    entity: string,
    options: Record<string, unknown>,
): Promise<T[]> {
    const response = await entityServer.list<T>(entity, options);
    return response.data.items ?? [];
}

/** 선택 엔티티 목록 실패를 경고만 남기고 빈 배열로 처리한다. */
async function listOptionalBootstrapRows<T>(
    entity: string,
    options: Record<string, unknown>,
): Promise<T[]> {
    try {
        return await listBootstrapRows<T>(entity, options);
    } catch (error) {
        logger.warn(
            { err: error, entity },
            "bootstrap: optional entity list failed",
        );
        return [];
    }
}

/** seq 기반 상세 조회로 목록 아이템을 보강한다. */
async function hydrateBootstrapRows<T extends { seq: number }>(
    entity: string,
    rows: T[],
): Promise<T[]> {
    return Promise.all(
        rows.map(async (row) => {
            const detail = await entityServer.find(entity, { seq: row.seq });
            return (detail.data as T | null) ?? row;
        }),
    );
}

/** 선택 엔티티 상세 보강 실패를 경고만 남기고 원본 목록으로 처리한다. */
async function hydrateOptionalBootstrapRows<T extends { seq: number }>(
    entity: string,
    rows: T[],
): Promise<T[]> {
    try {
        return await hydrateBootstrapRows(entity, rows);
    } catch (error) {
        logger.warn(
            { err: error, entity },
            "bootstrap: optional entity hydrate failed",
        );
        return rows;
    }
}

/** 시도 목록에 시군구 배열을 묶어준다. */
function attachSigunguToSido(
    sidoRows: AddrSidoRow[],
    sigunguRows: AddrSigunguRow[],
): BootstrapSidoRow[] {
    return sidoRows.map((sidoRow) => ({
        ...sidoRow,
        sigungu: sigunguRows.filter(
            (sigunguRow) => sigunguRow.sido_seq === sidoRow.seq,
        ),
    }));
}

/** 공통 인증 부트스트랩 데이터를 조회한다. */
export async function getBaseBootstrapData(): Promise<BaseBootstrapPayload> {
    const [
        pvGroups,
        pvItems,
        sidoRows,
        sigunguRows,
        boardCategoryRows,
        rbacRoleRows,
    ] = await Promise.all([
        listOptionalBootstrapRows<PvGroupRow>("pv_group", {
            limit: 1000,
            orderBy: "seq",
            orderDir: "ASC",
        }),
        listOptionalBootstrapRows<PvItemRow>("pv_item", {
            limit: 1000,
            orderBy: "seq",
            orderDir: "ASC",
        }),
        listOptionalBootstrapRows<AddrSidoRow>("addr_sido", {
            limit: 1000,
            orderBy: "seq",
            orderDir: "ASC",
        }),
        listOptionalBootstrapRows<AddrSigunguRow>("addr_sigungu", {
            limit: 1000,
            orderBy: "seq",
            orderDir: "ASC",
        }),
        listResolvedBoardCategories(false).then(
            (result) => result.items as unknown as BoardCategoryRow[],
        ),
        listOptionalBootstrapRows<RbacRoleRow>("rbac_roles", {
            limit: 1000,
            orderBy: "seq",
            orderDir: "ASC",
        }),
    ]);

    const [rbacRoles] = await Promise.all([
        hydrateOptionalBootstrapRows<RbacRoleRow>("rbac_roles", rbacRoleRows),
    ]);

    return {
        pv_groups: pvGroups,
        pv_items: pvItems,
        sido: attachSigunguToSido(sidoRows, sigunguRows),
        sigungu: sigunguRows,
        board_categories: boardCategoryRows,
        rbac_roles: rbacRoles,
    };
}
