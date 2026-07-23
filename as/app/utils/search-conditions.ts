/** 주어진 검색어를 여러 필드의 OR like 조건으로 필터에 추가한다. */
export function applyOrLikeSearchConditions(
    filter: Record<string, unknown>,
    search: string | undefined,
    fields: string[],
): void {
    const keyword = search?.trim();
    if (!keyword || fields.length === 0) {
        return;
    }

    const likeKeyword = `%${keyword}%`;
    filter.or = fields.map((field) => ({ [`${field} like`]: likeKeyword }));
}
