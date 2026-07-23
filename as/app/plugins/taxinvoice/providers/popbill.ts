/**
 * 팝빌 (Popbill / 링크허브) 전자세금계산서 드라이버
 *
 * REST/JSON 기반 API — https://taxinvoice.linkhub.co.kr
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

const POPBILL_STATE_MAP: Record<number, string> = {
    1: "draft",
    3: "pre_issue_waiting",
    4: "issued",
    5: "cancelled",
    6: "issue_cancelled",
    7: "refused",
    20: "reverse_waiting",
};

export class PopbillDriver implements TaxInvoiceDriver {
    private linkID: string;
    private secretKey: string;
    private corpNum: string;
    private endpoint: string;
    private timeoutMs: number;

    /** PopbillClient 인스턴스를 초기화한다 */
    constructor(cfg: TaxInvoiceProviderConfig) {
        this.linkID = cfg.link_id ?? "";
        this.secretKey = cfg.secret_key ?? "";
        this.corpNum = cfg.corp_num ?? "";
        this.endpoint = cfg.api_endpoint;
        this.timeoutMs = (cfg.timeout_sec ?? 30) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name(): string {
        return "popbill";
    }

    /** 세금계산서 등록 및 즉시 발행 API를 호출한다 */
    async registIssue(req: InvoiceRequest): Promise<ProviderState> {
        const keyType = this.mgtKeyType(req.issue_direction);
        const resp = await this.apiCall("POST", `/TaxInvoice/${keyType}`, req, {
            "X-HTTP-Method": "ISSUE",
        });
        return this.parseProviderState(resp, "issued");
    }

    /** 세금계산서 임시 저장 API를 호출한다 */
    async register(req: InvoiceRequest): Promise<ProviderState> {
        const keyType = this.mgtKeyType(req.issue_direction);
        const resp = await this.apiCall("POST", `/TaxInvoice/${keyType}`, req);
        return this.parseProviderState(resp, "draft");
    }

    /** 세금계산서 발행 API를 호출한다 */
    async issue(docKey: string, opts: IssueOptions): Promise<ProviderState> {
        const resp = await this.apiCall(
            "POST",
            `/TaxInvoice/SELL/${docKey}`,
            { memo: opts.memo },
            { "X-HTTP-Method": "ISSUE" },
        );
        return this.parseProviderState(resp, "issued");
    }

    /** 세금계산서 발행 취소 API를 호출한다 */
    async cancelIssue(docKey: string, memo: string): Promise<void> {
        await this.apiCall(
            "POST",
            `/TaxInvoice/SELL/${docKey}`,
            { memo },
            { "X-HTTP-Method": "CANCELISSUE" },
        );
    }

    /** 역발행 요청 등록 API를 호출한다 */
    async registReverseRequest(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.apiCall("POST", `/TaxInvoice/BUY`, req, {
            "X-HTTP-Method": "REQUEST",
        });
        return this.parseProviderState(resp, "reverse_waiting");
    }

    /** 역발행 요청 API를 호출한다 */
    async reverseRequest(docKey: string, memo: string): Promise<void> {
        await this.apiCall(
            "POST",
            `/TaxInvoice/BUY/${docKey}`,
            { memo },
            { "X-HTTP-Method": "REQUEST" },
        );
    }

    /** 역발행 요청 취소 API를 호출한다 */
    async cancelReverseRequest(docKey: string, memo: string): Promise<void> {
        await this.apiCall(
            "POST",
            `/TaxInvoice/BUY/${docKey}`,
            { memo },
            { "X-HTTP-Method": "CANCELREQUEST" },
        );
    }

    /** 역발행 거부 API를 호출한다 */
    async refuse(docKey: string, memo: string): Promise<void> {
        await this.apiCall(
            "POST",
            `/TaxInvoice/SELL/${docKey}`,
            { memo },
            { "X-HTTP-Method": "REFUSE" },
        );
    }

    /** 세금계산서 삭제 API를 호출한다 */
    async delete(docKey: string): Promise<void> {
        await this.apiCall("POST", `/TaxInvoice/SELL/${docKey}`, null, {
            "X-HTTP-Method": "DELETE",
        });
    }

    /** 세금계산서 상태 조회 API를 호출한다 */
    async getState(docKey: string): Promise<ProviderState> {
        const resp = await this.apiCall(
            "GET",
            `/TaxInvoice/SELL/${docKey}/State`,
        );
        return this.parseProviderState(resp, "");
    }

    /** 세금계산서 상세 조회 API를 호출한다 */
    async getDetail(docKey: string): Promise<unknown> {
        const resp = await this.apiCall("GET", `/TaxInvoice/SELL/${docKey}`);
        return JSON.parse(resp);
    }

    /** 세금계산서 로그 조회 API를 호출한다 */
    async getLogs(docKey: string): Promise<ProviderLog[]> {
        await this.apiCall("GET", `/TaxInvoice/SELL/${docKey}/Logs`);
        return [];
    }

    /** 세금계산서 목록 조회 API를 호출한다 */
    async list(filter: ListFilter): Promise<ProviderSummary[]> {
        await this.apiCall("GET", `/TaxInvoice/SELL`);
        return [];
    }

    /** 세금계산서 이메일 전송 API를 호출한다 */
    async sendEmail(docKey: string, emails: string[]): Promise<void> {
        await this.apiCall("POST", `/TaxInvoice/SELL/${docKey}/Email`, {
            emails,
        });
    }

    /** 세금계산서 SMS 전송 API를 호출한다 */
    async sendSMS(docKey: string, to: string): Promise<void> {
        await this.apiCall("POST", `/TaxInvoice/SELL/${docKey}/SMS`, {
            receiver: to,
        });
    }

    /** 국세청 전송 API를 호출한다 */
    async sendToNTS(docKey: string): Promise<void> {
        await this.apiCall("POST", `/TaxInvoice/SELL/${docKey}/NTS`);
    }

    // ── Internal ──

    /** 링크허브 인증 토큰을 발급한다 */
    private async getToken(): Promise<string> {
        // TODO: 링크허브 Token API 구현
        throw new Error("popbill getToken: not implemented");
    }

    /** REST API 요청을 전송한다 */
    private async apiCall(
        method: string,
        path: string,
        body?: unknown,
        headers?: Record<string, string>,
    ): Promise<string> {
        const token = await this.getToken();
        const url = this.endpoint + path;

        const init: RequestInit = {
            method,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                Authorization: `Bearer ${token}`,
                "x-pb-userid": this.corpNum,
                ...(headers ?? {}),
            },
            signal: AbortSignal.timeout(this.timeoutMs),
        };

        if (body && method !== "GET") {
            init.body = JSON.stringify(body);
        }

        const resp = await fetch(url, init);
        const text = await resp.text();
        if (resp.status >= 400) {
            throw new Error(
                `popbill ${method} ${path}: HTTP ${resp.status}: ${text}`,
            );
        }
        return text;
    }

    /** 발행 방향에 따른 관리키 타입을 반환한다 */
    private mgtKeyType(direction: string): string {
        switch (direction) {
            case "reverse":
                return "BUY";
            case "trustee":
                return "TRUSTEE";
            default:
                return "SELL";
        }
    }

    /** 응답을 ProviderState로 파싱한다 */
    private parseProviderState(
        resp: string,
        defaultState: string,
    ): ProviderState {
        try {
            const result = JSON.parse(resp);
            let state = defaultState;
            if (typeof result.stateCode === "number") {
                state = POPBILL_STATE_MAP[result.stateCode] ?? state;
            }
            if (!state) state = "draft";
            return {
                state,
                nts_state: "pending",
                nts_confirm_num: result.ntsconfirmNum ?? "",
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
