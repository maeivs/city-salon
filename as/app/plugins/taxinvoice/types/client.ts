import type {
    InvoiceRequest,
    IssueOptions,
    ProviderState,
    ProviderLog,
    ProviderSummary,
    ListFilter,
} from "./invoice.ts";
import type { PendingTaxInvoiceLog } from "./queue.ts";
import type { Party } from "./invoice.ts";

export interface TaxInvoiceDriver {
    name(): string;
    registIssue(req: InvoiceRequest): Promise<ProviderState>;
    register(req: InvoiceRequest): Promise<ProviderState>;
    issue(docKey: string, opts: IssueOptions): Promise<ProviderState>;
    cancelIssue(docKey: string, memo: string): Promise<void>;
    registReverseRequest(req: InvoiceRequest): Promise<ProviderState>;
    reverseRequest(docKey: string, memo: string): Promise<void>;
    cancelReverseRequest(docKey: string, memo: string): Promise<void>;
    refuse(docKey: string, memo: string): Promise<void>;
    delete(docKey: string): Promise<void>;
    getState(docKey: string): Promise<ProviderState>;
    getDetail(docKey: string): Promise<unknown>;
    getLogs(docKey: string): Promise<ProviderLog[]>;
    list(filter: ListFilter): Promise<ProviderSummary[]>;
    sendEmail(docKey: string, emails: string[]): Promise<void>;
    sendSMS(docKey: string, to: string): Promise<void>;
    sendToNTS(docKey: string): Promise<void>;
}

export interface TaxInvoiceQuerier {
    submitTaxInvoiceLog(
        logEntry: Partial<PendingTaxInvoiceLog>,
    ): Promise<number>;
    claimPendingTaxInvoiceLogs(limit: number): Promise<PendingTaxInvoiceLog[]>;
    updateTaxInvoiceLogStatus(
        logSeq: number,
        status: string,
        result?: unknown,
    ): Promise<void>;
    resetStaleTaxInvoiceLogs(staleMinutes: number): Promise<number>;
    submitTaxInvoice(invoice: InvoiceRequest): Promise<number>;
    updateTaxInvoice(
        seq: number,
        fields: Record<string, unknown>,
    ): Promise<void>;
    getTaxInvoice(seq: number): Promise<Record<string, unknown>>;
    getTaxInvoiceByMgtKey(
        provider: string,
        mgtKey: string,
    ): Promise<Record<string, unknown>>;
    listTaxInvoicesForSync(
        provider: string,
    ): Promise<Record<string, unknown>[]>;
    findOrCreateParty(party: Party): Promise<number>;
}
