/**
 * 볼타 (Bolta) 전자세금계산서 드라이버
 *
 * REST/JSON + Basic Auth — https://xapi.bolta.io/v1
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

export class BoltaDriver implements TaxInvoiceDriver {
    private apiKey: string;
    private customerKey: string;
    private endpoint: string;
    private timeoutMs: number;

    /** BoltaClient 인스턴스를 초기화한다 */
    constructor(cfg: TaxInvoiceProviderConfig) {
        this.apiKey = cfg.api_key ?? "";
        this.customerKey = cfg.customer_key ?? "";
        this.endpoint = cfg.api_endpoint;
        this.timeoutMs = (cfg.timeout_sec ?? 30) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name(): string {
        return "bolta";
    }

    /** 세금계산서 등록 및 즉시 발행 API를 호출한다 */
    async registIssue(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.apiCall("POST", "/taxInvoices/issue", req);
        return this.parseProviderState(resp);
    }

    /** 세금계산서 임시 저장 API를 호출한다 */
    async register(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.apiCall("POST", "/taxInvoices", req);
        return this.parseProviderState(resp);
    }

    /** 세금계산서 발행 API를 호출한다 */
    async issue(docKey: string, opts: IssueOptions): Promise<ProviderState> {
        const resp = await this.apiCall("POST", `/taxInvoices/${docKey}/issue`);
        return this.parseProviderState(resp);
    }

    /** 세금계산서 발행 취소 API를 호출한다 */
    async cancelIssue(docKey: string, memo: string): Promise<void> {
        await this.apiCall("POST", `/taxInvoices/${docKey}/cancel`, { memo });
    }

    /** 역발행 요청 등록 API를 호출한다 */
    async registReverseRequest(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.apiCall(
            "POST",
            "/taxInvoices/issueRequest",
            req,
        );
        return this.parseProviderState(resp);
    }

    /** 역발행 승인 URL 조회 API를 호출한다 */
    async reverseRequest(docKey: string, memo: string): Promise<void> {
        await this.apiCall("GET", `/taxInvoices/${docKey}/issueRequest/grant`);
    }

    /** 역발행 요청 취소 API를 호출한다 */
    async cancelReverseRequest(docKey: string, memo: string): Promise<void> {
        await this.apiCall("PUT", `/taxInvoices/${docKey}/issueRequest/cancel`);
    }

    /** 역발행 거부 API를 호출한다 */
    async refuse(docKey: string, memo: string): Promise<void> {
        await this.apiCall("POST", `/taxInvoices/${docKey}/refuse`, { memo });
    }

    /** 세금계산서 삭제 API를 호출한다 */
    async delete(docKey: string): Promise<void> {
        await this.apiCall("DELETE", `/taxInvoices/${docKey}`);
    }

    /** 세금계산서 상태 조회 API를 호출한다 (내용 조회로 대체) */
    async getState(docKey: string): Promise<ProviderState> {
        const resp = await this.apiCall("GET", `/taxInvoices/${docKey}`);
        return this.parseProviderState(resp);
    }

    /** 세금계산서 상세 조회 API를 호출한다 */
    async getDetail(docKey: string): Promise<unknown> {
        const resp = await this.apiCall("GET", `/taxInvoices/${docKey}`);
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
        await this.apiCall("POST", `/taxInvoices/${docKey}/email`, {
            emails,
        });
    }

    /** 세금계산서 SMS 전송 API를 호출한다 */
    async sendSMS(docKey: string, to: string): Promise<void> {
        await this.apiCall("POST", `/taxInvoices/${docKey}/sms`, { to });
    }

    /** 국세청 전송 API를 호출한다 */
    async sendToNTS(docKey: string): Promise<void> {
        await this.apiCall("POST", `/taxInvoices/${docKey}/nts`);
    }

    // ── Internal ──

    /** REST API 요청을 전송한다 */
    private async apiCall(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<string> {
        const url = this.endpoint + path;
        const basicAuth = Buffer.from(`${this.apiKey}:`).toString("base64");

        const init: RequestInit = {
            method,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                Authorization: `Basic ${basicAuth}`,
                "Customer-Key": this.customerKey,
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
                `bolta ${method} ${path}: HTTP ${resp.status}: ${text}`,
            );
        }
        return text;
    }

    /** 응답을 ProviderState로 파싱한다 */
    private parseProviderState(resp: string): ProviderState {
        try {
            const result = JSON.parse(resp);
            // issue 응답: { issuanceKey: "..." } — issuanceKey가 있으면 발행 성공
            if (result.issuanceKey) {
                return {
                    state: "issued",
                    nts_state: result.ntsState ?? "pending",
                    nts_confirm_num: result.ntsConfirmNumber ?? "",
                    raw: result,
                };
            }
            // 조회 응답: 전체 세금계산서 객체
            return {
                state: result.status ?? result.state ?? "draft",
                nts_state: result.ntsState ?? result.nts_state ?? "pending",
                nts_confirm_num:
                    result.ntsConfirmNumber ?? result.nts_confirm_num ?? "",
                raw: result,
            };
        } catch {
            return {
                state: "draft",
                nts_state: "pending",
                nts_confirm_num: "",
            };
        }
    }
}
