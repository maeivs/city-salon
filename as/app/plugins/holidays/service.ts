/**
 * 공휴일 동기화 서비스
 *
 * 공공데이터포털(data.go.kr) SpcdeInfoService 4개 엔드포인트를 호출해
 * Entity Server의 holiday 엔티티에 저장합니다.
 *
 * 엔드포인트:
 *  - getRestDeInfo      : 공휴일
 *  - getHoliDeInfo      : 국경일
 *  - get24DivisionsInfo : 24절기
 *  - getSundryDayInfo   : 잡절
 *
 * 저장 필드: locdate, date_name, date_kind, is_holiday (PHP SpcdeInfoService 동일)
 * 동기화 방식: locdate 기준 upsert (기존 데이터 삭제 없음)
 *
 * API Base: https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService
 * 환경변수: DATAGOKR_API_KEY (data.go.kr API 키, 디코딩된 값)
 */

import { entityServer, logger } from "@system/api";
import type {
    HolidaysConfig,
    HolidayApiItem,
    HolidayRecord,
    SpcdeOperation,
} from "./types/index.ts";
import { SPCDE_OPERATIONS, DATE_NAME_MAP } from "./types/index.ts";

const API_BASE =
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService";

interface HolidaySyncOptions {
    startYear?: number;
    endYear?: number;
}

/** DB/API boolean 값을 공휴일 여부 boolean으로 정규화한다. */
function normalizeHolidayBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const normalized = String(value ?? "")
        .trim()
        .toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "y";
}

export class HolidayService {
    private readonly config: HolidaysConfig;
    private readonly apiKey: string;

    constructor(config: HolidaysConfig, apiKey: string) {
        this.config = config;
        this.apiKey = apiKey;
    }

    /** 동기화 대상 연도 목록을 계산합니다. */
    private resolveTargetYears(options?: HolidaySyncOptions): number[] {
        const currentYear = new Date().getFullYear();
        const startYear = options?.startYear ?? currentYear;
        const endYear =
            options?.endYear ?? currentYear + this.config.yearsAhead;
        const targetYears: number[] = [];

        for (let y = startYear; y <= endYear; y++) {
            targetYears.push(y);
        }

        return targetYears;
    }

    /** 설정된 연도 범위의 공휴일을 모두 동기화한다 */
    async sync(options?: HolidaySyncOptions): Promise<void> {
        const targetYears = this.resolveTargetYears(options);

        logger.info({ years: targetYears }, "Starting holiday sync");

        let total = 0;
        for (const year of targetYears) {
            const records = await this.fetchYear(year);
            await this.upsertYear(year, records);
            total += records.length;
        }

        logger.info({ total }, "Holiday sync completed");
    }

    /** 특정 연도의 4개 엔드포인트 데이터를 전부 가져온다 */
    private async fetchYear(year: number): Promise<HolidayRecord[]> {
        const allItems: HolidayApiItem[] = [];

        for (const operation of SPCDE_OPERATIONS) {
            for (let month = 1; month <= 12; month++) {
                const items = await this.fetchMonth(operation, year, month);
                allItems.push(...items);
            }
        }

        // locdate 기준으로 1건만 유지하고, 휴일 정보가 있으면 우선 반영합니다.
        const uniqueByLocdate = new Map<number, HolidayRecord>();
        for (const item of allItems) {
            const normalized: HolidayRecord = {
                locdate: item.locdate,
                date_name: DATE_NAME_MAP[item.dateName] ?? item.dateName,
                date_kind: item.dateKind,
                is_holiday: item.isHoliday === "Y",
            };
            const existing = uniqueByLocdate.get(item.locdate);

            if (!existing || (!existing.is_holiday && normalized.is_holiday)) {
                uniqueByLocdate.set(item.locdate, normalized);
            }
        }

        return Array.from(uniqueByLocdate.values()).sort(
            (left, right) => left.locdate - right.locdate,
        );
    }

    /** 특정 엔드포인트·연도·월의 데이터를 API에서 가져온다 (페이지네이션 포함) */
    private async fetchMonth(
        operation: SpcdeOperation,
        year: number,
        month: number,
    ): Promise<HolidayApiItem[]> {
        const results: HolidayApiItem[] = [];
        let pageNo = 1;
        const numOfRows = 100;

        while (true) {
            const url = new URL(`${API_BASE}/${operation}`);
            url.searchParams.set("ServiceKey", this.apiKey);
            url.searchParams.set("solYear", String(year));
            url.searchParams.set("solMonth", String(month).padStart(2, "0"));
            url.searchParams.set("pageNo", String(pageNo));
            url.searchParams.set("numOfRows", String(numOfRows));
            url.searchParams.set("_type", "json");

            const resp = await fetch(url.toString());
            if (!resp.ok) {
                logger.warn(
                    { operation, year, month, status: resp.status },
                    "Holiday API HTTP error, skipping",
                );
                break;
            }

            const json = (await resp.json()) as Record<string, unknown>;

            const response = json["response"] as
                | Record<string, unknown>
                | undefined;
            const header = response?.["header"] as
                | { resultCode: string; resultMsg: string }
                | undefined;

            if (header?.resultCode !== "00") {
                logger.warn(
                    {
                        operation,
                        year,
                        month,
                        resultCode: header?.resultCode,
                        resultMsg: header?.resultMsg,
                    },
                    "Holiday API result error, skipping",
                );
                break;
            }

            const body = response?.["body"] as
                | { totalCount: number; items: unknown }
                | undefined;

            if (!body || body.totalCount === 0 || !body.items) break;

            // items가 빈 문자열("")로 오는 경우 (결과 없음)
            if (typeof body.items !== "object") break;

            // API는 1건일 때 배열이 아닌 단일 객체를 반환하기도 함
            const raw = (body.items as Record<string, unknown>)["item"] as
                | HolidayApiItem
                | HolidayApiItem[]
                | undefined;

            if (!raw) break;
            const items = Array.isArray(raw) ? raw : [raw];
            results.push(...items);

            if (items.length < numOfRows) break;
            pageNo++;
        }

        return results;
    }

    /** 특정 연도의 holiday 레코드를 locdate 기준으로 upsert한다. */
    private async upsertYear(
        year: number,
        records: HolidayRecord[],
    ): Promise<void> {
        const yearStart = year * 10000 + 101; // YYYYMMDD: YYYY0101
        const yearEnd = year * 10000 + 1231; // YYYYMMDD: YYYY1231
        const existingByLocdate = new Map<
            number,
            {
                seq: number;
                date_name: string;
                date_kind: string;
                is_holiday: boolean;
            }
        >();
        let inserted = 0;
        let updated = 0;
        let skipped = 0;

        try {
            const existing = await entityServer.query<{
                seq: number;
                locdate: number;
                date_name: string;
                date_kind: string;
                is_holiday: boolean;
            }>(this.config.entity, {
                sql: `SELECT seq, locdate, date_name, date_kind, is_holiday FROM ${this.config.entity}
                          WHERE locdate >= ? AND locdate <= ?`,
                params: [yearStart, yearEnd],
                limit: 1000,
            });

            for (const row of existing.data.items) {
                const locdate = Number(row.locdate);
                if (!Number.isFinite(locdate)) {
                    continue;
                }
                existingByLocdate.set(locdate, {
                    seq: row.seq,
                    date_name: String(row.date_name ?? ""),
                    date_kind: String(row.date_kind ?? ""),
                    is_holiday: normalizeHolidayBoolean(row.is_holiday),
                });
            }
        } catch (err) {
            logger.debug(
                { err, year },
                "Could not load existing holidays (may be first sync)",
            );
        }

        for (const record of records) {
            try {
                const existingRow = existingByLocdate.get(
                    Number(record.locdate),
                );
                const payload: Record<string, unknown> = {
                    locdate: record.locdate,
                    date_name: record.date_name,
                    date_kind: record.date_kind,
                    is_holiday: record.is_holiday,
                };

                if (
                    existingRow &&
                    existingRow.date_name === record.date_name &&
                    existingRow.date_kind === record.date_kind &&
                    existingRow.is_holiday === record.is_holiday
                ) {
                    skipped++;
                    continue;
                }

                if (existingRow !== undefined) {
                    payload.seq = existingRow.seq;
                    updated++;
                } else {
                    inserted++;
                }

                await entityServer.submit(this.config.entity, payload);
            } catch (err) {
                logger.error(
                    {
                        err,
                        locdate: record.locdate,
                        date_name: record.date_name,
                    },
                    "Failed to save holiday record",
                );
            }
        }

        logger.info(
            { year, inserted, updated, skipped, upserted: records.length },
            "Holiday year sync done",
        );
    }
}
