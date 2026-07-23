export interface PgConfig {
    enabled?: boolean;
    default: string;
    webhook_secret: string;
    order_id_prefix: string;
    success_url: string;
    fail_url: string;
    webhook_url: string;
    amount_limit?: PgAmountLimit;
    workers: number;
    providers: Record<string, PgProviderConfig>;
}

export interface PgProviderConfig {
    driver: string; // "toss_payments" | "kcp" | "inicis" | "danal" | "hecto" | "kakaopay" | "naverpay" | "payco" | "wanna" | "payletter" | "paypal"
    client_key?: string;
    secret_key?: string;
    api_url?: string;
    api_urls?: Record<string, string | Record<string, string>>;
    webhook_ips?: Record<string, string[]>;
    environment?: string;
    api_version?: string;
    webhook_secret?: string;
    mid?: string;
    merchant_key?: string;
    merchant_id?: string;
    site_cd?: string;
    store_id?: string;
    sign_key?: string;
    aes_key?: string;
    cp_id?: string;
    cp_key?: string;
    app_id?: string;
    cid?: string;
    partner_id?: string;
    service_id?: string;
    client_id?: string;
    api_key?: string;
    api_key_search?: string;
    cert_info?: string;
    site_name?: string;
    private_key?: string;
}

export interface PgAmountLimit {
    min: number;
    max: number;
}
