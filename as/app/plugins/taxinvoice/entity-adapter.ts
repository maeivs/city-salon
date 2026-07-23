/**
 * 전자세금계산서 Entity Adapter
 *
 * entity-server-client를 통해 DB entity CRUD를 TaxInvoiceQuerier 인터페이스로 어댑팅
 *
 * 엔티티:
 *   - tax_invoice       : 세금계산서 본문
 *   - tax_invoice_log   : 비동기 처리 큐 / 이력
 *   - tax_invoice_party : 거래처 (공급자·공급받는자)
 *   - tax_invoice_item  : 품목
 */

import { EntityServerApi } from "entity-client";
import type {
    TaxInvoiceQuerier,
    PendingTaxInvoiceLog,
    InvoiceRequest,
    Party,
} from "./types/index.ts";

const entityServer = new EntityServerApi();

/** 값을 문자열로 변환한다 */
function toString(v: unknown): string {
    if (v == null) return "";
    return String(v);
}

/** 값을 숫자로 변환한다 */
function toNumber(v: unknown): number {
    if (v == null) return 0;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
}

export class TaxInvoiceEntityAdapter implements TaxInvoiceQuerier {
    // ── TaxInvoiceLog ──

    /** 세금계산서 로그를 등록한다 */
    async submitTaxInvoiceLog(
        logEntry: Partial<PendingTaxInvoiceLog>,
    ): Promise<number> {
        const data: Record<string, unknown> = {
            tax_invoice_seq: logEntry.tax_invoice_seq,
            log_type: logEntry.log_type,
            provider: logEntry.provider,
            mgt_key: logEntry.mgt_key,
            memo: logEntry.memo ?? "",
            status: "pending",
            retry_count: 0,
            log_time: new Date().toISOString().slice(0, 19).replace("T", " "),
        };
        const resp = await entityServer.submit("tax_invoice_log", data);
        return resp.seq ?? 0;
    }

    /** 대기 중인 세금계산서 로그를 클레임한다 */
    async claimPendingTaxInvoiceLogs(
        limit: number,
    ): Promise<PendingTaxInvoiceLog[]> {
        const resp = await entityServer.list("tax_invoice_log", {
            status: "pending",
            limit,
            order: "seq ASC",
        } as any);
        const rows = (resp.data as any)?.items ?? [];

        // Entity App Server는 단일 프로세스이므로 CAS 없이 직접 status 업데이트
        const claimed: PendingTaxInvoiceLog[] = [];
        for (const row of rows) {
            const seq = toNumber(row.seq);
            try {
                await entityServer.submit("tax_invoice_log", {
                    seq,
                    status: "processing",
                } as any);
                claimed.push({
                    log_seq: seq,
                    tax_invoice_seq: toNumber(row.tax_invoice_seq),
                    log_type: toString(row.log_type),
                    provider: toString(row.provider),
                    mgt_key: toString(row.mgt_key),
                    memo: toString(row.memo),
                    retry_count: toNumber(row.retry_count),
                });
            } catch {
                // 이미 다른 곳에서 처리 중 — skip
            }
        }
        return claimed;
    }

    /** 세금계산서 로그 상태를 갱신한다 */
    async updateTaxInvoiceLogStatus(
        logSeq: number,
        status: string,
        result?: unknown,
    ): Promise<void> {
        const data: Record<string, unknown> = { status };
        if (status === "pending") {
            try {
                const row = await entityServer.get("tax_invoice_log", logSeq);
                data.retry_count = toNumber((row.data as any)?.retry_count) + 1;
            } catch {
                // ignore
            }
        }
        if (result != null) {
            data.result =
                typeof result === "string" ? result : JSON.stringify(result);
        }
        await entityServer.submit("tax_invoice_log", {
            seq: logSeq,
            ...data,
        } as any);
    }

    /** 오래된 처리 중 로그를 초기화한다 */
    async resetStaleTaxInvoiceLogs(staleMinutes: number): Promise<number> {
        const cutoff = new Date(Date.now() - staleMinutes * 60_000)
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");

        const resp = await entityServer.list("tax_invoice_log", {
            status: "processing",
            updated_at_lt: cutoff,
        } as any);
        const rows = (resp.data as any)?.items ?? [];

        let count = 0;
        for (const row of rows) {
            const seq = toNumber(row.seq);
            const retryCount = toNumber(row.retry_count);
            const newStatus = retryCount >= 3 ? "failed" : "pending";
            try {
                await entityServer.submit("tax_invoice_log", {
                    seq,
                    status: newStatus,
                } as any);
                count++;
            } catch {
                // ignore
            }
        }
        return count;
    }

    // ── TaxInvoice ──

    /** 세금계산서를 저장한다 */
    async submitTaxInvoice(invoice: InvoiceRequest): Promise<number> {
        const data: Record<string, unknown> = {
            provider: invoice.provider,
            mgt_key: invoice.mgt_key,
            issue_direction: invoice.issue_direction,
            tax_type: invoice.tax_type,
            purpose_type: invoice.purpose_type,
            supply_value: invoice.amount_total,
            tax_amount: invoice.tax_total,
            total_amount: invoice.total_amount,
            write_date: invoice.write_date,
            invoicer_seq: invoice.invoicer_seq,
            invoicee_seq: invoice.invoicee_seq,
            state: invoice.state ?? "draft",
            nts_state: invoice.nts_state ?? "pending",
        };
        if (invoice.nts_confirm_num) {
            data.nts_confirm_num = invoice.nts_confirm_num;
        }
        if (invoice.broker_seq && invoice.broker_seq > 0) {
            data.broker_seq = invoice.broker_seq;
        }
        const resp = await entityServer.submit("tax_invoice", data);
        return resp.seq ?? 0;
    }

    /** 세금계산서 필드를 갱신한다 */
    async updateTaxInvoice(
        seq: number,
        fields: Record<string, unknown>,
    ): Promise<void> {
        await entityServer.submit("tax_invoice", { seq, ...fields } as any);
    }

    /** 세금계산서를 조회한다 */
    async getTaxInvoice(seq: number): Promise<Record<string, unknown>> {
        const resp = await entityServer.get("tax_invoice", seq);
        return (resp.data as Record<string, unknown>) ?? {};
    }

    /** 관리키로 세금계산서를 조회한다 */
    async getTaxInvoiceByMgtKey(
        provider: string,
        mgtKey: string,
    ): Promise<Record<string, unknown>> {
        const resp = await entityServer.list("tax_invoice", {
            provider,
            mgt_key: mgtKey,
            limit: 1,
        } as any);
        const items = (resp.data as any)?.items ?? [];
        if (items.length === 0) {
            throw new Error(
                `tax_invoice not found: provider=${provider} mgt_key=${mgtKey}`,
            );
        }
        return items[0];
    }

    /** 동기화 대상 세금계산서 목록을 조회한다 */
    async listTaxInvoicesForSync(
        provider: string,
    ): Promise<Record<string, unknown>[]> {
        const resp = await entityServer.list("tax_invoice", {
            provider,
            nts_state_in: "waiting,sending",
        } as any);
        return (resp.data as any)?.items ?? [];
    }

    // ── Party ──

    /** 거래처를 조회하거나 생성한다 */
    async findOrCreateParty(party: Party): Promise<number> {
        // 기존 거래처 조회
        const resp = await entityServer.list("tax_invoice_party", {
            corp_num: party.corp_num,
            tax_reg_id: party.tax_reg_id ?? "",
        } as any);
        const items = (resp.data as any)?.items ?? [];

        if (items.length > 0) {
            const existing = items[0];
            const seq = toNumber(existing.seq);

            // 변경 사항 있으면 업데이트
            const updates: Record<string, unknown> = {};
            if (
                party.corp_name &&
                party.corp_name !== toString(existing.corp_name)
            ) {
                updates.corp_name = party.corp_name;
            }
            if (
                party.ceo_name &&
                party.ceo_name !== toString(existing.ceo_name)
            ) {
                updates.ceo_name = party.ceo_name;
            }
            if (party.email && party.email !== toString(existing.email)) {
                updates.email = party.email;
            }
            if (Object.keys(updates).length > 0) {
                try {
                    await entityServer.submit("tax_invoice_party", {
                        seq,
                        ...updates,
                    } as any);
                } catch {
                    // 업데이트 실패해도 기존 seq 반환
                }
            }
            return seq;
        }

        // 신규 생성
        const data: Record<string, unknown> = {
            corp_num: party.corp_num,
            tax_reg_id: party.tax_reg_id ?? "",
            corp_name: party.corp_name,
            ceo_name: party.ceo_name ?? "",
            addr: party.addr ?? "",
            biz_type: party.biz_type ?? "",
            biz_class: party.biz_class ?? "",
            email: party.email ?? "",
        };
        if (party.contact_name) data.contact_name = party.contact_name;
        if (party.tel) data.tel = party.tel;
        if (party.hp) data.hp = party.hp;

        const createResp = await entityServer.submit("tax_invoice_party", data);
        return createResp.seq ?? 0;
    }
}
