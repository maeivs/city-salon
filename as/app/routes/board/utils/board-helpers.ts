/** board 라우트 공용 헬퍼 함수 모음 */

/** 작성자 account_seq 를 정규화한다. */
export function resolveAccountSeq(
    item: Record<string, unknown>,
): number | null {
    const accountSeq = Number(item.account_seq);
    return Number.isInteger(accountSeq) && accountSeq > 0 ? accountSeq : null;
}

/** 엔티티 응답에서 유효한 license_seq 를 추출한다 (게스트 전용). */
export function resolveLicenseSeq(
    item: Record<string, unknown>,
): number | null {
    const licenseSeq = Number(item.license_seq);
    return Number.isInteger(licenseSeq) && licenseSeq > 0 ? licenseSeq : null;
}

/** 익명 여부에 맞춰 댓글 응답의 작성자 식별값을 정리한다. */
export function toBoardCommentResponse(
    item: Record<string, unknown>,
    isAnonymous: boolean,
) {
    return {
        ...item,
        account_seq: isAnonymous ? null : resolveAccountSeq(item),
    };
}
