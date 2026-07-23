/**
 * 표준 계정과목 API 핸들러
 *
 * GET /v1/gl-accounts                  → 계정과목 목록 (statement/sub_category/classification/level/q 필터)
 * GET /v1/gl-accounts/:code            → 코드 단건 조회
 * GET /v1/gl-accounts/items            → 거래항목별 매핑 목록 (q/account_code 필터)
 * GET /v1/gl-accounts/items/lookup     → 거래항목명으로 계정과목 역검색 (?q=)
 *
 * 모두 읽기 전용입니다. 데이터는 부팅 시 entities/ 기본값으로 적재됩니다.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer } from "@system/api";

const ACCOUNTS = "gl_accounts";
const ITEMS = "gl_account_items";

const MAX_LIMIT = 1000;

// search:true n-gram 최소 토큰 길이(엔티티 서버 기본값). 이보다 짧은 검색어는
// n-gram으로 매칭되지 않으므로 JS 부분일치로 폴백한다.
const NGRAM_MIN = 2;

// 양의 정수 쿼리 값을 안전하게 파싱한다.
const parsePositiveInt = (value?: string): number | undefined => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

// entityServer 응답에서 items 배열을 추출한다.
const extractItems = (resp: unknown): any[] => {
    const data = (resp as any)?.data ?? resp;
    return Array.isArray(data?.items) ? data.items : [];
};

/**
 * GET /v1/gl-accounts
 *
 * 쿼리:
 *  statement      재무제표 구분 (재무상태표 / 손익계산서)
 *  sub_category   하위 구분 (자산/부채/자본/매출액/매출원가/판매비와관리비/영업외수익/영업외비용)
 *  classification 회계 분류 (당좌자산 등)
 *  level          계층 (1=대분류, 2=세부)
 *  q              계정과목명 부분검색
 *  page, limit    페이지네이션 (limit 기본 200, 최대 1000)
 */
export async function handleListAccounts(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const qs = request.query as Record<string, string>;

    const level = qs.level ? parsePositiveInt(qs.level) : undefined;
    if (qs.level && level === undefined) {
        return reply.status(400).send(fail("level must be a positive integer"));
    }
    if (level !== undefined && level !== 1 && level !== 2) {
        return reply.status(400).send(fail("level must be 1 or 2"));
    }

    const page = parsePositiveInt(qs.page) ?? 1;
    const limit = Math.min(parsePositiveInt(qs.limit) ?? 200, MAX_LIMIT);

    const q = (qs.q ?? "").trim();
    const baseConditions: Record<string, unknown> = {};
    if (qs.statement) baseConditions.statement = qs.statement;
    if (qs.sub_category) baseConditions.sub_category = qs.sub_category;
    if (qs.classification) baseConditions.classification = qs.classification;
    if (level !== undefined) baseConditions.account_level = level;

    try {
        let items: any[];

        if (q.length >= NGRAM_MIN) {
            // account_name/std_name 둘 다 search:true. conditions는 AND라 OR 검색을
            // 한 번에 못 하므로 필드별 n-gram 검색을 병렬 실행 후 code 기준 병합한다.
            const like = `%${q}%`;
            const [byName, byStd] = await Promise.all([
                entityServer.list(ACCOUNTS, {
                    conditions: { ...baseConditions, account_name: like },
                    limit: MAX_LIMIT,
                    orderBy: "code",
                }),
                entityServer.list(ACCOUNTS, {
                    conditions: { ...baseConditions, std_name: like },
                    limit: MAX_LIMIT,
                    orderBy: "code",
                }),
            ]);
            const merged = new Map<number, any>();
            for (const it of [...extractItems(byName), ...extractItems(byStd)]) {
                merged.set(Number(it.code), it);
            }
            items = [...merged.values()].sort(
                (a, b) => Number(a.code) - Number(b.code),
            );
        } else {
            const resp = await entityServer.list(ACCOUNTS, {
                conditions: baseConditions,
                limit: MAX_LIMIT,
                orderBy: "code",
            });
            items = extractItems(resp);
            // 1글자 검색은 n-gram(최소 2글자)으로 못 잡으므로 JS 부분일치로 폴백한다.
            if (q) {
                items = items.filter(
                    (it) =>
                        String(it.account_name ?? "").includes(q) ||
                        String(it.std_name ?? "").includes(q),
                );
            }
        }

        const total = items.length;
        const start = (page - 1) * limit;
        const paged = items.slice(start, start + limit);

        return ok({ items: paged, total, page, limit });
    } catch (err) {
        request.log.error({ err }, "gl-accounts: list accounts failed");
        return reply.status(500).send(fail("failed to list accounts"));
    }
}

/**
 * GET /v1/gl-accounts/items
 *
 * 쿼리:
 *  account_code  특정 계정과목 코드에 매핑된 거래항목만
 *  q             거래항목명 부분검색
 *  page, limit   페이지네이션
 */
export async function handleListItems(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const qs = request.query as Record<string, string>;

    const accountCode = qs.account_code
        ? parsePositiveInt(qs.account_code)
        : undefined;
    if (qs.account_code && accountCode === undefined) {
        return reply
            .status(400)
            .send(fail("account_code must be a positive integer"));
    }

    const page = parsePositiveInt(qs.page) ?? 1;
    const limit = Math.min(parsePositiveInt(qs.limit) ?? 200, MAX_LIMIT);

    const q = (qs.q ?? "").trim();
    const conditions: Record<string, unknown> = {};
    if (accountCode !== undefined) conditions.account_code = accountCode;

    // tran_item 은 search:true → 2글자 이상이면 엔티티 서버의 n-gram 검색에 위임한다.
    // ("%"를 포함하면 LIKE로 추론되고 search 필드라 n-gram 토큰 매칭으로 처리됨)
    const useNgram = q.length >= NGRAM_MIN;
    if (useNgram) conditions.tran_item = `%${q}%`;

    try {
        const resp = await entityServer.list(ITEMS, {
            conditions,
            limit: MAX_LIMIT,
            orderBy: "tran_item",
        });
        let items = extractItems(resp);

        // 1글자 검색은 n-gram(최소 2글자)으로 못 잡으므로 JS 부분일치로 폴백한다.
        if (q && !useNgram) {
            items = items.filter((it) =>
                String(it.tran_item ?? "").includes(q),
            );
        }

        const total = items.length;
        const start = (page - 1) * limit;
        const paged = items.slice(start, start + limit);

        return ok({ items: paged, total, page, limit });
    } catch (err) {
        request.log.error({ err }, "gl-accounts: list items failed");
        return reply.status(500).send(fail("failed to list account items"));
    }
}

/**
 * GET /v1/gl-accounts/items/lookup?q=가계수표
 * 거래항목명으로 매핑된 계정과목을 역검색한다(부분일치).
 */
export async function handleLookupItem(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const qs = request.query as Record<string, string>;
    const q = (qs.q ?? "").trim();
    if (!q) {
        return reply.status(400).send(fail("q is required"));
    }

    try {
        // tran_item search:true → 2글자 이상은 n-gram 검색, 1글자는 JS 폴백.
        const useNgram = q.length >= NGRAM_MIN;
        const resp = await entityServer.list(ITEMS, {
            conditions: useNgram ? { tran_item: `%${q}%` } : {},
            limit: MAX_LIMIT,
            orderBy: "tran_item",
        });
        let items = extractItems(resp);
        if (!useNgram) {
            items = items.filter((it) =>
                String(it.tran_item ?? "").includes(q),
            );
        }
        return ok({ items, total: items.length });
    } catch (err) {
        request.log.error({ err }, "gl-accounts: lookup item failed");
        return reply.status(500).send(fail("failed to lookup account item"));
    }
}

/**
 * GET /v1/gl-accounts/items/by-tran?name=검사비(수입시)
 * 거래항목명 완전일치로 매핑된 계정과목 목록을 반환한다.
 * 한 거래항목이 여러 계정과목에 매핑(1:N)될 수 있어 accounts 배열로 묶어 돌려준다.
 */
export async function handleItemAccounts(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const qs = request.query as Record<string, string>;
    const name = (qs.name ?? "").trim();
    if (!name) {
        return reply.status(400).send(fail("name is required"));
    }

    try {
        const resp = await entityServer.list(ITEMS, {
            conditions: { tran_item: name },
            limit: MAX_LIMIT,
            orderBy: "account_code",
        });
        const rows = extractItems(resp);
        if (rows.length === 0) {
            return reply.status(404).send(fail("tran_item not found"));
        }

        // 동일 (코드,명칭) 중복 제거 후 코드순 계정과목 목록으로 정리한다.
        const seen = new Set<number>();
        const accounts = rows
            .filter((it) => {
                const code = Number(it.account_code);
                if (seen.has(code)) return false;
                seen.add(code);
                return true;
            })
            .map((it) => ({
                code: Number(it.account_code),
                account_name: String(it.account_name ?? ""),
            }))
            .sort((a, b) => a.code - b.code);

        return ok({ tran_item: name, accounts, total: accounts.length });
    } catch (err) {
        request.log.error({ err }, "gl-accounts: item accounts failed");
        return reply.status(500).send(fail("failed to get item accounts"));
    }
}

/**
 * GET /v1/gl-accounts/:code
 * 계정과목 코드(숫자) 단건 조회.
 */
export async function handleGetAccount(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const { code } = request.params as { code: string };
    const codeNum = Number.parseInt(code, 10);
    if (!Number.isInteger(codeNum) || codeNum <= 0) {
        return reply.status(400).send(fail("code must be a positive integer"));
    }

    try {
        const resp = await entityServer.list(ACCOUNTS, {
            conditions: { code: codeNum },
            limit: 1,
        });
        const items = extractItems(resp);
        if (items.length === 0) {
            return reply.status(404).send(fail("account not found"));
        }
        return ok(items[0]);
    } catch (err) {
        request.log.error({ err }, "gl-accounts: get account failed");
        return reply.status(500).send(fail("failed to get account"));
    }
}
