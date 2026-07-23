/**
 * 8방향 상수 + 공간 방향 판정
 * PHP 레거시 코드의 8방향 상수 계승
 */

import type { ProcessedItem } from "./types/index.ts";

// 겹침 없는 방향 (A 영역과 B 영역이 완전히 분리)
export const DIRECTION_RIGHT = "RIGHT";
export const DIRECTION_LEFT = "LEFT";
export const DIRECTION_DOWN = "DOWN";
export const DIRECTION_UP = "UP";

// 겹침 허용 방향 (중심점 비교만)
export const DIRECTION_RIGHT_OVERLAP = "RIGHT_OVERLAP";
export const DIRECTION_LEFT_OVERLAP = "LEFT_OVERLAP";
export const DIRECTION_DOWN_OVERLAP = "DOWN_OVERLAP";
export const DIRECTION_UP_OVERLAP = "UP_OVERLAP";

/**
 * item이 base에 대해 direction 조건을 만족하는지 확인합니다.
 */
export function checkDirectionMatch(
    item: ProcessedItem,
    base: ProcessedItem,
    direction: string,
): boolean {
    switch (direction) {
        case DIRECTION_RIGHT:
            return item.left >= base.right;
        case DIRECTION_LEFT:
            return item.right <= base.left;
        case DIRECTION_DOWN:
            return item.top >= base.bottom;
        case DIRECTION_UP:
            return item.bottom <= base.top;
        case DIRECTION_RIGHT_OVERLAP:
            return item.centerX > base.centerX;
        case DIRECTION_LEFT_OVERLAP:
            return item.centerX < base.centerX;
        case DIRECTION_DOWN_OVERLAP:
            return item.centerY > base.centerY;
        case DIRECTION_UP_OVERLAP:
            return item.centerY < base.centerY;
        default:
            return false;
    }
}
