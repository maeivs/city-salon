export interface NtsBusinessmanConfig {
    enabled?: boolean;
    apiKey?: string;
    apiBaseUrl: string;
    timeoutMs: number;
    returnType: "JSON" | "XML";
}

export interface NtsBusinessmanStatusRequest {
    b_no: string[];
}

export interface NtsBusinessmanValidateBusiness {
    b_no: string;
    start_dt: string;
    p_nm: string;
    p_nm2?: string;
    b_nm?: string;
    corp_no?: string;
    b_sector?: string;
    b_type?: string;
    b_adr?: string;
}

export interface NtsBusinessmanValidateRequest {
    businesses: NtsBusinessmanValidateBusiness[];
}

export interface NtsBusinessmanApiError {
    status_code?: string;
    request_cnt?: number;
    valid_cnt?: number;
    data?: unknown[];
    [key: string]: unknown;
}
