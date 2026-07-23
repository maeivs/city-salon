import type { InvoiceRequest, IssueOptions } from "./invoice.ts";

export interface TaxInvoiceJob {
    provider: string;
    action: string;
    mgt_key: string;
    request?: InvoiceRequest;
    options?: IssueOptions;
    memo?: string;
    ref_entity?: string;
    ref_seq?: number;
}

export interface PendingTaxInvoiceLog {
    log_seq: number;
    tax_invoice_seq: number;
    log_type: string;
    provider: string;
    mgt_key: string;
    memo: string;
    retry_count: number;
}
