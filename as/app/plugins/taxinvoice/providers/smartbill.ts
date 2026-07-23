/**
 * 스마트빌 (Smartbill) 전자세금계산서 드라이버
 *
 * REST/JSON + Bearer Token (자동 갱신) — https://nxapi.smartbill.co.kr
 */

import type {
    TaxInvoiceProviderConfig,
    TaxInvoiceDriver,
    InvoiceRequest,
    IssueOptions,
    ProviderState,
    ProviderLog,
    ProviderSummary,
    ListFilter,
} from "../types/index.ts";

export class SmartbillDriver implements TaxInvoiceDriver {
    private apiKey: string;
    private corpNum: string;
    private endpoint: string;
    private timeoutMs: number;

    // 토큰 캐시
    private token = "";
    private tokenExpiry = 0;

    /** SmartbillClient 인스턴스를 초기화한다 */
    constructor(cfg: TaxInvoiceProviderConfig) {
        this.apiKey = cfg.api_key ?? "";
        this.corpNum = cfg.corp_num ?? "";
        this.endpoint = cfg.api_endpoint;
        this.timeoutMs = (cfg.timeout_sec ?? 30) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name(): string {
        return "smartbill";
    }

    /** 세금계산서 등록 및 즉시 발행 API를 호출한다 */
    async registIssue(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.apiCall("POST", "/v2/tax-invoices/issue", req);
        return this.parseState(resp, "issued");
    }

    /** 세금계산서 임시 저장 API를 호출한다 */
    async register(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.apiCall("POST", "/v2/tax-invoices", req);
        return this.parseState(resp, "draft");
    }

    /** 세금계산서 발행 API를 호출한다 */
    async issue(docKey: string, opts: IssueOptions): Promise<ProviderState> {
        const resp = await this.apiCall(
            "POST",
            `/v2/tax-invoices/${docKey}/issue`,
        );
        return this.parseState(resp, "issued");
    }

    /** 세금계산서 발행 취소 API를 호출한다 */
    async cancelIssue(docKey: string, memo: string): Promise<void> {
        await this.apiCall("POST", `/v2/tax-invoices/${docKey}/cancel`, {
            memo,
        });
    }

    /** 역발행 요청 등록 API를 호출한다 */
    async registReverseRequest(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.apiCall(
            "POST",
            "/v2/tax-invoices/reverse-issue",
            req,
        );
        return this.parseState(resp, "reverse_waiting");
    }

    /** 역발행 요청 API를 호출한다 */
    async reverseRequest(docKey: string, memo: string): Promise<void> {
        await this.apiCall("POST", `/v2/tax-invoices/${docKey}/request`, {
            memo,
        });
    }

    /** 역발행 요청 취소 API를 호출한다 */
    async cancelReverseRequest(docKey: string, memo: string): Promise<void> {
        await this.apiCall(
            "POST",
            `/v2/tax-invoices/${docKey}/cancel-request`,
            {
                memo,
            },
        );
    }

    /** 역발행 거부 API를 호출한다 */
    async refuse(docKey: string, memo: string): Promise<void> {
        await this.apiCall("POST", `/v2/tax-invoices/${docKey}/refuse`, {
            memo,
        });
    }

    /** 세금계산서 삭제 API를 호출한다 */
    async delete(docKey: string): Promise<void> {
        await this.apiCall("DELETE", `/v2/tax-invoices/${docKey}`);
    }

    /** 세금계산서 상태 조회 API를 호출한다 */
    async getState(docKey: string): Promise<ProviderState> {
        const resp = await this.apiCall(
            "GET",
            `/v2/tax-invoices/${docKey}/state`,
        );
        return this.parseState(resp, "");
    }

    /** 세금계산서 상세 조회 API를 호출한다 */
    async getDetail(docKey: string): Promise<unknown> {
        const resp = await this.apiCall("GET", `/v2/tax-invoices/${docKey}`);
        return JSON.parse(resp);
    }

    /** 세금계산서 로그 조회 API를 호출한다 */
    async getLogs(docKey: string): Promise<ProviderLog[]> {
        return [];
    }

    /** 세금계산서 목록 조회 API를 호출한다 */
    async list(filter: ListFilter): Promise<ProviderSummary[]> {
        return [];
    }

    /** 세금계산서 이메일 전송 API를 호출한다 */
    async sendEmail(docKey: string, emails: string[]): Promise<void> {
        await this.apiCall("POST", `/v2/tax-invoices/${docKey}/email`, {
            emails,
        });
    }

    /** 세금계산서 SMS 전송 API를 호출한다 */
    async sendSMS(docKey: string, to: string): Promise<void> {
        await this.apiCall("POST", `/v2/tax-invoices/${docKey}/sms`, { to });
    }

    /** 국세청 전송 API를 호출한다 */
    async sendToNTS(docKey: string): Promise<void> {
        await this.apiCall("POST", `/v2/tax-invoices/${docKey}/nts`);
    }

    // ── Token Management ──

    /** 인증 토큰을 발급 또는 갱신한다 */
    private async refreshToken(): Promise<string> {
        const now = Date.now();
        if (this.token && now < this.tokenExpiry) {
            return this.token;
        }

        const resp = await fetch(`${this.endpoint}/v2/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: this.apiKey,
                corp_num: this.corpNum,
            }),
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`smartbill token: HTTP ${resp.status}: ${body}`);
        }

        const data = (await resp.json()) as {
            token: string;
            expires_in: number;
        };
        this.token = data.token;
        this.tokenExpiry = now + (data.expires_in - 30) * 1000;
        return this.token;
    }

    /** REST API 요청을 전송한다 */
    private async apiCall(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<string> {
        const token = await this.refreshToken();
        const url = this.endpoint + path;

        const init: RequestInit = {
            method,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(this.timeoutMs),
        };

        if (body && method !== "GET" && method !== "DELETE") {
            init.body = JSON.stringify(body);
        }

        const resp = await fetch(url, init);
        const text = await resp.text();
        if (resp.status >= 400) {
            throw new Error(
                `smartbill ${method} ${path}: HTTP ${resp.status}: ${text}`,
            );
        }
        return text;
    }

    /** 응답을 ProviderState로 파싱한다 */
    private parseState(resp: string, defaultState: string): ProviderState {
        try {
            const result = JSON.parse(resp);
            return {
                state: result.state ?? (defaultState || "draft"),
                nts_state: result.nts_state ?? "pending",
                nts_confirm_num: result.nts_confirm_num ?? "",
                raw: result,
            };
        } catch {
            return {
                state: defaultState || "draft",
                nts_state: "pending",
                nts_confirm_num: "",
            };
        }
    }
}
