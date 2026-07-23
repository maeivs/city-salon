/** 공통 부트스트랩 권한 그룹 행 타입이다. */
export interface PvGroupRow {
    seq: number;
    name: string;
    remark?: string | null;
}

/** 공통 부트스트랩 권한 아이템 행 타입이다. */
export interface PvItemRow {
    seq: number;
    parent_seq?: number | null;
    name: string;
    remark?: string | null;
    readonly?: boolean | number;
}

/** 공통 부트스트랩 시도 행 타입이다. */
export interface AddrSidoRow {
    seq: number;
    sido: string;
    sido_short: string;
}

/** 공통 부트스트랩 시군구 행 타입이다. */
export interface AddrSigunguRow {
    seq: number;
    sigungu: string;
    sido_seq: number;
    sido: string;
    sido_short: string;
}

/** 공통 부트스트랩 시도-시군구 결합 타입이다. */
export interface BootstrapSidoRow extends AddrSidoRow {
    sigungu: AddrSigunguRow[];
}

/** 공통 부트스트랩 게시판 카테고리 행 타입이다. */
export interface BoardCategoryRow {
    seq: number;
    name: string;
    label: string;
    status?: string;
    anonymous_enabled?: string;
    comment_enabled?: string;
    file_enabled?: string;
    like_enabled?: string;
    rating_enabled?: string;
    guest_write_enabled?: string;
    sort_order?: number;
}

/** 공통 부트스트랩 RBAC 역할 행 타입이다. */
export interface RbacRoleRow {
    seq: number;
    name: string;
    description?: string | null;
    permissions?: string[];
}

/** 공통 부트스트랩 페이로드 타입이다. */
export interface BaseBootstrapPayload {
    pv_groups: PvGroupRow[];
    pv_items: PvItemRow[];
    sido: BootstrapSidoRow[];
    sigungu: AddrSigunguRow[];
    board_categories: BoardCategoryRow[];
    rbac_roles: RbacRoleRow[];
}
