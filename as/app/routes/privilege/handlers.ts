/**
 * Privilege 핸들러
 *
 * GET  /v1/privilege/items              — pv_item 목록 조회
 * GET  /v1/privilege/groups             — pv_group 목록 조회
 * GET  /v1/privilege/account/:account_seq     — 계정 권한·그룹 조회
 * POST /v1/privilege/account/:account_seq     — 계정 권한·그룹 일괄 저장
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, logger } from "@system/api";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface AccountSeqParams {
    account_seq: string;
}

interface SubmitBody {
    permissions?: string[]; // pv_item.name 배열
    groups?: string[]; // pv_group.name 배열
}

interface PvItemRow {
    seq: number;
    name: string;
    parent_seq: number | null;
    remark: string | null;
}

interface PvGroupRow {
    seq: number;
    name: string;
    description: string | null;
}

interface AccountPvItemRow {
    seq: number;
    account_seq: number;
    pv_item_seq: number;
}

interface AccountPvGroupRow {
    seq: number;
    account_seq: number;
    pv_group_seq: number;
}

// ─── 핸들러 ────────────────────────────────────────────────────────────────

/**
 * GET /v1/privilege/items
 * 전체 권한항목(pv_item) 목록 조회
 */
export async function listPrivilegeItems(
    _req: FastifyRequest,
    reply: FastifyReply,
) {
    const resp = await entityServer.list<PvItemRow>("pv_item", {
        limit: 1000,
        orderBy: "seq",
    });
    return reply.send(ok(resp.data));
}

/**
 * GET /v1/privilege/groups
 * 전체 권한그룹(pv_group) 목록 조회
 */
export async function listPrivilegeGroups(
    _req: FastifyRequest,
    reply: FastifyReply,
) {
    const resp = await entityServer.list<PvGroupRow>("pv_group", {
        limit: 1000,
        orderBy: "seq",
    });
    return reply.send(ok(resp.data));
}

/**
 * GET /v1/privilege/account/:account_seq
 * 특정 계정의 권한항목·권한그룹 조회
 */
export async function getAccountPrivileges(
    req: FastifyRequest<{ Params: AccountSeqParams }>,
    reply: FastifyReply,
) {
    const accountSeq = Number(req.params.account_seq);
    if (!accountSeq || accountSeq <= 0) {
        return reply.code(400).send(fail("account_seq is invalid"));
    }

    const [itemResp, groupResp] = await Promise.all([
        entityServer.list<AccountPvItemRow>("account_pv_item", {
            limit: 1000,
            conditions: { account_seq: accountSeq },
        }),
        entityServer.list<AccountPvGroupRow>("account_pv_group", {
            limit: 1000,
            conditions: { account_seq: accountSeq },
        }),
    ]);

    const pvItemSeqs = itemResp.data.items.map((r) => r.pv_item_seq);
    const pvGroupSeqs = groupResp.data.items.map((r) => r.pv_group_seq);

    // pv_item 이름 조회
    let permissions: string[] = [];
    if (pvItemSeqs.length > 0) {
        const pvItems = await entityServer.list<PvItemRow>("pv_item", {
            limit: 1000,
            conditions: { seq: pvItemSeqs },
        });
        permissions = pvItems.data.items.map((r) => r.name);
    }

    // pv_group 이름 조회
    let groups: string[] = [];
    if (pvGroupSeqs.length > 0) {
        const pvGroups = await entityServer.list<PvGroupRow>("pv_group", {
            limit: 1000,
            conditions: { seq: pvGroupSeqs },
        });
        groups = pvGroups.data.items.map((r) => r.name);
    }

    return reply.send(ok({ permissions, groups }));
}

/**
 * POST /v1/privilege/account/:account_seq
 * 특정 계정의 권한항목·권한그룹 일괄 저장 (덮어쓰기)
 *
 * body:
 *   permissions: string[]  — pv_item.name 배열
 *   groups:      string[]  — pv_group.name 배열
 */
export async function submitAccountPrivileges(
    req: FastifyRequest<{ Params: AccountSeqParams; Body: SubmitBody }>,
    reply: FastifyReply,
) {
    const accountSeq = Number(req.params.account_seq);
    if (!accountSeq || accountSeq <= 0) {
        return reply.code(400).send(fail("account_seq is invalid"));
    }

    const permissions = Array.isArray(req.body?.permissions)
        ? req.body.permissions
        : [];
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];

    // ── 1. 이름 → seq 변환 ─────────────────────────────────────────────────
    const [allItemsResp, allGroupsResp] = await Promise.all([
        entityServer.list<PvItemRow>("pv_item", { limit: 1000 }),
        entityServer.list<PvGroupRow>("pv_group", { limit: 1000 }),
    ]);

    const itemNameToSeq = new Map<string, number>(
        allItemsResp.data.items.map((r) => [r.name, r.seq]),
    );
    const groupNameToSeq = new Map<string, number>(
        allGroupsResp.data.items.map((r) => [r.name, r.seq]),
    );

    const pvItemSeqs = permissions
        .map((name) => itemNameToSeq.get(name))
        .filter((s): s is number => s !== undefined);

    const pvGroupSeqs = groups
        .map((name) => groupNameToSeq.get(name))
        .filter((s): s is number => s !== undefined);

    const unknownItems = permissions.filter((name) => !itemNameToSeq.has(name));
    const unknownGroups = groups.filter((name) => !groupNameToSeq.has(name));

    if (unknownItems.length > 0 || unknownGroups.length > 0) {
        logger.warn(
            { accountSeq, unknownItems, unknownGroups },
            "privilege/submit: unknown names ignored",
        );
    }

    // ── 2. 기존 매핑 조회 ──────────────────────────────────────────────────
    const [existingItemResp, existingGroupResp] = await Promise.all([
        entityServer.list<AccountPvItemRow>("account_pv_item", {
            limit: 1000,
            conditions: { account_seq: accountSeq },
        }),
        entityServer.list<AccountPvGroupRow>("account_pv_group", {
            limit: 1000,
            conditions: { account_seq: accountSeq },
        }),
    ]);

    const existingItems = existingItemResp.data.items;
    const existingGroups = existingGroupResp.data.items;

    // ── 3. 삭제·추가 계산 ──────────────────────────────────────────────────
    const newItemSeqSet = new Set(pvItemSeqs);
    const newGroupSeqSet = new Set(pvGroupSeqs);

    const itemsToDelete = existingItems.filter(
        (r) => !newItemSeqSet.has(r.pv_item_seq),
    );
    const groupsToDelete = existingGroups.filter(
        (r) => !newGroupSeqSet.has(r.pv_group_seq),
    );

    const existingItemSeqSet = new Set(existingItems.map((r) => r.pv_item_seq));
    const existingGroupSeqSet = new Set(
        existingGroups.map((r) => r.pv_group_seq),
    );

    const itemSeqsToAdd = pvItemSeqs.filter((s) => !existingItemSeqSet.has(s));
    const groupSeqsToAdd = pvGroupSeqs.filter(
        (s) => !existingGroupSeqSet.has(s),
    );

    // ── 4. 트랜잭션으로 적용 ───────────────────────────────────────────────
    const txId = await entityServer.transStart();
    try {
        // 4-a. 삭제
        await Promise.all([
            ...itemsToDelete.map((r) =>
                entityServer.delete("account_pv_item", r.seq, {
                    transactionId: txId,
                    hard: true,
                }),
            ),
            ...groupsToDelete.map((r) =>
                entityServer.delete("account_pv_group", r.seq, {
                    transactionId: txId,
                    hard: true,
                }),
            ),
        ]);

        // 4-b. 추가
        await Promise.all([
            ...itemSeqsToAdd.map((pv_item_seq) =>
                entityServer.submit(
                    "account_pv_item",
                    { account_seq: accountSeq, pv_item_seq },
                    { transactionId: txId },
                ),
            ),
            ...groupSeqsToAdd.map((pv_group_seq) =>
                entityServer.submit(
                    "account_pv_group",
                    { account_seq: accountSeq, pv_group_seq },
                    { transactionId: txId },
                ),
            ),
        ]);

        await entityServer.transCommit(txId);
    } catch (err) {
        await entityServer.transRollback(txId).catch(() => {});
        logger.error(
            { err, accountSeq },
            "privilege/submit: transaction failed",
        );
        return reply.code(500).send(fail("권한 저장에 실패했습니다."));
    }

    // ── 5. 응답 — pv 배열은 적용된 권한항목 이름 목록 ────────────────────
    const savedPermissions = pvItemSeqs
        .map((seq) => allItemsResp.data.items.find((r) => r.seq === seq)?.name)
        .filter((n): n is string => n !== undefined);

    return reply.send(ok({ pv: savedPermissions }));
}
