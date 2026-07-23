export interface TaxInvoiceConfig {
    enabled?: boolean;
    default: string;
    workers: number;
    queue_size: number;
    dispatch_interval_sec: number;
    max_retries: number;
    providers: Record<string, TaxInvoiceProviderConfig>;
    nts: TaxInvoiceNTSConfig;
    notify: string[];
    sync: TaxInvoiceSyncConfig;
}

export interface TaxInvoiceProviderConfig {
    driver: string; // "barobill" | "popbill" | "bolta" | "smartbill" | "esero"
    cert_key?: string;
    corp_num?: string;
    user_id?: string;
    link_id?: string;
    secret_key?: string;
    api_key?: string;
    customer_key?: string;
    cert_path?: string;
    cert_pass?: string;
    api_endpoint: string;
    corp_state_endpoint?: string;
    timeout_sec?: number;
}

export interface TaxInvoiceNTSConfig {
    auto_send: boolean;
    taxation_option: number;
    taxation_add_tax_allow: number;
    tax_exemption_option: number;
    tax_exemption_add_tax_allow: number;
}

export interface TaxInvoiceSyncConfig {
    enabled: boolean;
    interval_sec: number;
    state_sync_interval_min: number;
    max_list_days: number;
}
