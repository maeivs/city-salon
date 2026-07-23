/**
 * data.go.kr SpcdeInfoService API 응답 — 개별 항목
 *
 * 엔드포인트 4종 모두 동일한 구조를 반환합니다:
 *  - getRestDeInfo      : 공휴일
 *  - getHoliDeInfo      : 국경일
 *  - get24DivisionsInfo : 24절기
 *  - getSundryDayInfo   : 잡절
 */
export interface HolidayApiItem {
    /** 날짜 분류 코드 (01=공휴일 등) */
    dateKind: string;
    /** 특일 이름 */
    dateName: string;
    /** 공휴일 여부 (Y/N) */
    isHoliday: string;
    /** 날짜: YYYYMMDD 숫자 */
    locdate: number;
    /** API 고유 시퀀스 */
    seq: number;
}

/** Entity Server holiday 엔티티에 저장하는 레코드 (snake_case) */
export interface HolidayRecord {
    /** 날짜: YYYYMMDD 숫자 (API locdate와 동일) */
    locdate: number;
    /** 특일 이름 */
    date_name: string;
    /** 날짜 분류 코드 */
    date_kind: string;
    /** 공휴일 여부 */
    is_holiday: boolean;
}

/** 이름 정규화 맵 — PHP SpcdeInfoService.php 기준 */
export const DATE_NAME_MAP: Record<string, string> = {
    "1월1일": "신정",
    기독탄신일: "성탄절",
};

/** 호출할 SpcdeInfoService 오퍼레이션 목록 */
export const SPCDE_OPERATIONS = [
    "getRestDeInfo", // 공휴일
    "getHoliDeInfo", // 국경일
    "get24DivisionsInfo", // 24절기
    "getSundryDayInfo", // 잡절
] as const;

export type SpcdeOperation = (typeof SPCDE_OPERATIONS)[number];
