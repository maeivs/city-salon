/**
 * 휴일 데이터 핸들러
 *
 * GET  /v1/holidays          → 공휴일 목록 조회
 * GET  /v1/holidays/:locdate → 단건 조회
 * POST /v1/holidays/sync     → 수동 동기화 트리거 (관리자)
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";

const ENTITY = "holiday";

interface HolidayListQueryOptions {
    year?: number;
    years: number[];
    month?: number;
    isHoliday?: 0 | 1;
    dateKind?: string;
}

// 다중 연도 쿼리 문자열을 숫자 배열로 정규화합니다.
const parseYearsParam = (value?: string): number[] => {
    if (!value) return [];

    return Array.from(
        new Set(
            value
                .split(",")
                .map((year) => parseInt(year.trim(), 10))
                .filter((year) => Number.isInteger(year) && year >= 1900 && year <= 9999),
        ),
    ).sort((left, right) => left - right);
};

// 양의 정수 쿼리 값을 안전하게 파싱합니다.
const parsePositiveInt = (value?: string): number | undefined => {
    if (!value) return undefined;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return undefined;
    }

    return parsed;
};

const normalizeHolidayFlag = (value?: string): 0 | 1 | undefined => {
    if (!value) return undefined;

    const normalized = value.trim().toLowerCase();
    if (normalized === "y" || normalized === "true" || normalized === "1") {
        return 1;
    }
    if (normalized === "n" || normalized === "false" || normalized === "0") {
        return 0;
    }
    return undefined;
};

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

const ensureSvc = (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.server.holidayService) {
        reply.status(503).send(fail("Holidays plugin not enabled"));
        return null;
    }
    return req.server.holidayService;
};

// 휴일 목록 조회용 SQL과 바인딩 파라미터를 조합합니다.
const buildHolidayListQuery = ({
    year,
    years,
    month,
    isHoliday,
    dateKind,
}: HolidayListQueryOptions): { sql: string; params: unknown[] } => {
    const whereClauses: string[] = [];
    const params: unknown[] = [];
    const ranges: Array<{ start: number; end: number }> = [];

    if (years.length > 0) {
        years.forEach((selectedYear) => {
            if (month !== undefined) {
                const prefix = selectedYear * 10000 + month * 100;
                ranges.push({ start: prefix, end: prefix + 99 });
                return;
            }

            ranges.push({
                start: selectedYear * 10000 + 101,
                end: selectedYear * 10000 + 1231,
            });
        });
    } else if (year !== undefined) {
        if (month !== undefined) {
            const prefix = year * 10000 + month * 100;
            ranges.push({ start: prefix, end: prefix + 99 });
        } else {
            ranges.push({ start: year * 10000 + 101, end: year * 10000 + 1231 });
        }
    }

    if (ranges.length > 0) {
        whereClauses.push(
            `(${ranges.map(() => `(locdate >= ? AND locdate <= ?)`).join(" OR ")})`,
        );
        ranges.forEach((range) => {
            params.push(range.start, range.end);
        });
    }

    if (isHoliday !== undefined) {
        whereClauses.push("is_holiday = ?");
        params.push(isHoliday);
    }

    if (dateKind) {
        whereClauses.push("date_kind = ?");
        params.push(dateKind);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const sql = `SELECT locdate,
                        CAST(SUBSTRING(CAST(locdate AS CHAR), 1, 4) AS UNSIGNED) AS year,
                        date_name,
                        date_kind,
                        is_holiday
                 FROM ${ENTITY}
                 ${whereSql}
                 ORDER BY locdate ASC`;

    return { sql, params };
};

// ─── 핸들러 ──────────────────────────────────────────────────────────────────

/**
 * GET /v1/holidays
 *
 * 쿼리 파라미터:
 *  year       - 연도 (예: 2025)
 *  years      - 여러 연도 CSV (예: 2025,2026,2027)
 *  month      - 월 1-12 (예: 5)
 *  is_holiday - Y/N, true/false, 1/0
 *  date_kind  - 날짜 분류 코드
 *  page       - 페이지 번호 (limit 지정 시에만 사용)
 *  limit      - 응답 건수 제한 (선택)
 */
export async function handleList(request: FastifyRequest, reply: FastifyReply) {
    const qs = request.query as Record<string, string>;

    const year = parsePositiveInt(qs.year);
    const years = parseYearsParam(qs.years);
    const month = parsePositiveInt(qs.month);
    const isHoliday = normalizeHolidayFlag(qs.is_holiday);
    const dateKind = qs.date_kind;
    const page = parsePositiveInt(qs.page) ?? 1;
    const limit = qs.limit ? parsePositiveInt(qs.limit) : undefined;

    if (qs.is_holiday && isHoliday === undefined) {
        return reply
            .status(400)
            .send(fail("is_holiday must be one of Y, N, true, false, 1, 0"));
    }

    if (qs.year && year === undefined) {
        return reply.status(400).send(fail("year must be a positive integer"));
    }
    if (qs.years && years.length === 0) {
        return reply.status(400).send(fail("years must be a comma-separated year list"));
    }
    if (qs.month && month === undefined) {
        return reply.status(400).send(fail("month must be a positive integer"));
    }
    if (month !== undefined && (month < 1 || month > 12)) {
        return reply.status(400).send(fail("month must be between 1 and 12"));
    }
    if (qs.limit && limit === undefined) {
        return reply.status(400).send(fail("limit must be a positive integer"));
    }

    try {
        const resp = await entityServer.query(
            ENTITY,
            {
                ...buildHolidayListQuery({
                    year,
                    years,
                    month,
                    isHoliday,
                    dateKind,
                }),
                limit: 1000,
            },
        );
        const data = (resp as any).data ?? resp;
        const items = Array.isArray(data.items) ? data.items : [];

        if (limit !== undefined) {
            const start = (page - 1) * Math.min(limit, 1000);
            const pagedItems = items.slice(start, start + Math.min(limit, 1000));

            return ok({
                items: pagedItems,
                total: items.length,
                page,
                limit: Math.min(limit, 1000),
            });
        }

        return ok({
            items,
            total: items.length,
            page: 1,
            limit: items.length,
        });
    } catch (err) {
        request.log.error({ err }, "holidays: list failed");
        return reply.status(500).send(fail("failed to list holidays"));
    }
}

/**
 * GET /v1/holidays/:locdate
 * locdate 형식: YYYYMMDD (숫자 8자리)
 */
export async function handleGetByDate(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const { locdate } = request.params as { locdate: string };
    const locdateNum = parseInt(locdate, 10);

    if (isNaN(locdateNum) || locdate.length !== 8) {
        return reply
            .status(400)
            .send(fail("locdate must be 8-digit YYYYMMDD number"));
    }

    try {
        const resp = await entityServer.list(ENTITY, {
            conditions: { locdate: locdateNum },
            limit: 20,
            orderBy: "date_kind",
        });
        const data = (resp as any).data ?? resp;
        const items = data.items ?? [];
        if (items.length === 0) {
            return reply.status(404).send(fail("no holidays on that date"));
        }
        return ok({ items, total: items.length });
    } catch (err) {
        request.log.error({ err }, "holidays: get by date failed");
        return reply.status(500).send(fail("failed to get holiday"));
    }
}

/**
 * POST /v1/holidays/sync
 * 즉시 동기화를 트리거한다 (관리자 전용).
 */
export async function handleSync(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    try {
        await svc.sync();
        return ok({ message: "Holiday sync completed" });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        request.log.error({ err }, "holidays: manual sync failed");
        return reply.status(500).send(fail(`sync failed: ${msg}`));
    }
}
