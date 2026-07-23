export interface Party {
    corp_num: string;
    corp_name: string;
    tax_reg_id?: string;
    ceo_name?: string;
    addr?: string;
    biz_type?: string;
    biz_class?: string;
    contact_name?: string;
    tel?: string;
    hp?: string;
    email?: string;
}

export interface Item {
    item_seq: number;
    purchase_date?: string;
    name?: string;
    information?: string;
    quantity?: number;
    unit_price?: number;
    amount: number;
    tax: number;
    description?: string;
}

export interface InvoiceRequest {
    mgt_key: string;
    provider?: string;
    write_date: string;
    issue_direction: string; // "forward" | "reverse" | "trustee"
    tax_type: string; // "taxation" | "zero" | "exempt"
    purpose_type: number;
    tax_invoice_type: number;
    amount_total: number;
    tax_total: number;
    total_amount: number;
    cash?: number;
    chk_bill?: number;
    note?: number;
    credit?: number;
    remark1?: string;
    remark2?: string;
    remark3?: string;
    invoicer: Party;
    invoicee: Party;
    broker?: Party;
    items: Item[];
    force_issue?: boolean;
    send_sms?: boolean;
    send_email?: boolean;
    extra?: Record<string, unknown>;
    invoicer_seq?: number;
    invoicee_seq?: number;
    broker_seq?: number;
    state?: string;
    nts_state?: string;
    nts_confirm_num?: string;
}

export interface IssueOptions {
    force_issue?: boolean;
    memo?: string;
    send_sms?: boolean;
    send_email?: boolean;
}

export interface ProviderState {
    state: string;
    nts_state: string;
    nts_confirm_num: string;
    raw?: unknown;
}

export interface ProviderLog {
    log_type: string;
    log_time: string;
    description?: string;
    memo?: string;
    raw?: unknown;
}

export interface ProviderSummary {
    doc_key: string;
    mgt_key: string;
    state: string;
    nts_state: string;
    write_date: string;
    invoicer_name: string;
    invoicee_name: string;
    amount_total: number;
    tax_total: number;
    nts_confirm_num?: string;
}

export interface IssueResult {
    seq: number;
    mgt_key: string;
    provider_doc_key?: string;
    state: string;
    nts_state: string;
    nts_confirm_num?: string;
    message?: string;
}

export interface InvoiceState {
    mgt_key: string;
    state: string;
    nts_state: string;
    nts_confirm_num?: string;
}

export interface ListFilter {
    direction?: string;
    start_date: string;
    end_date: string;
    state?: string;
    nts_state?: string;
    page: number;
    limit: number;
}

export interface PagedResult {
    items: ProviderSummary[];
    total_count: number;
    page: number;
    limit: number;
}
