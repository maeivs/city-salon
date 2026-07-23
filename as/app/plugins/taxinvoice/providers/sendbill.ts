/**
 * 센드빌 (Sendbill) 전자세금계산서 드라이버
 *
 * REST/JSON API — https://api.sendbill.co.kr
 * Auth: Header "SBKEY: {api_key}"
 *
 * 참고: https://www.sendbill.co.kr/RESTful/customercenterinfo/apiguide?menuid=4200
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

/** 센드빌 상태 코드 → 내부 state 변환 */
const SENDBILL_STATE_MAP: Record<string, string> = {
    "10": "draft", // 임시저장
    "20": "pre_issue_waiting", // 발행대기
    "30": "issued", // 발행완료
    "40": "refused", // 거부
    "50": "cancelled", // 취소
    "60": "issue_cancelled", // 역발행 취소
};

interface SendbillResponse {
    Result: number; // 양수 = 성공(billseq), 음수 = 오류
    Message: string;
}

interface SendbillStateResponse {
    Result: number;
    Message: string;
    data?: {
        status?: string;
        ntssendyn?: string; // Y/N
        ntsconfirmno?: string;
    };
}

interface SendbillListResponse {
    Result: number;
    Message: string;
    list?: SendbillListItem[];
}

interface SendbillListItem {
    billseq?: string;
    dt?: string;
    supmoney?: string;
    taxmoney?: string;
    status?: string;
    scompany?: string;
    rcompany?: string;
}

interface SendbillLogResponse {
    Result: number;
    Message: string;
    list?: Array<{ logdt?: string; msg?: string; logtype?: string }>;
}

export class SendbillDriver implements TaxInvoiceDriver {
    private apiKey: string;
    private endpoint: string;
    private timeoutMs: number;

    /** SendbillDriver 인스턴스를 초기화한다 */
    constructor(cfg: TaxInvoiceProviderConfig) {
        this.apiKey = cfg.api_key ?? "";
        this.endpoint = (
            cfg.api_endpoint ?? "https://api.sendbill.co.kr"
        ).replace(/\/$/, "");
        this.timeoutMs = (cfg.timeout_sec ?? 30) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name(): string {
        return "sendbill";
    }

    /** 세금계산서 등록 및 즉시 발행 API를 호출한다 */
    async registIssue(req: InvoiceRequest): Promise<ProviderState> {
        const body = buildRegistDirectBody(req);
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/registDirect",
            body,
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill registDirect: ${resp.Message} (${resp.Result})`,
            );
        }
        return {
            state: "issued",
            nts_state: "pending",
            nts_confirm_num: "",
            raw: JSON.stringify(resp),
        };
    }

    /**
     * 세금계산서 임시 저장 API를 호출한다
     * — 센드빌은 별도 임시저장 없이 registDirect 를 사용하므로 동일하게 처리
     */
    async register(req: InvoiceRequest): Promise<ProviderState> {
        const body = buildRegistDirectBody(req);
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/registDirect",
            body,
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill register: ${resp.Message} (${resp.Result})`,
            );
        }
        return {
            state: "draft",
            nts_state: "pending",
            nts_confirm_num: "",
            raw: JSON.stringify(resp),
        };
    }

    /**
     * 세금계산서 발행 API를 호출한다
     * — 센드빌은 등록과 발행이 분리되지 않으므로 registIssue 와 동일하게 처리
     */
    async issue(_docKey: string, _opts: IssueOptions): Promise<ProviderState> {
        throw new Error(
            "sendbill: use Service.registIssue() — 센드빌은 등록+발행을 한 번에 처리합니다",
        );
    }

    /** 세금계산서 발행 취소 API를 호출한다 */
    async cancelIssue(docKey: string, _memo: string): Promise<void> {
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/cancelDoc",
            { billseq: docKey },
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill cancelIssue: ${resp.Message} (${resp.Result})`,
            );
        }
    }

    /** 역발행 요청 등록 API를 호출한다 */
    async registReverseRequest(req: InvoiceRequest): Promise<ProviderState> {
        const body = { ...buildRegistDirectBody(req), reverseyn: "Y" };
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/registDirect",
            body,
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill registReverseRequest: ${resp.Message} (${resp.Result})`,
            );
        }
        return {
            state: "pre_issue_waiting",
            nts_state: "pending",
            nts_confirm_num: "",
            raw: JSON.stringify(resp),
        };
    }

    /** 역발행 요청 API를 호출한다 */
    async reverseRequest(docKey: string, _memo: string): Promise<void> {
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/reverseRequest",
            { billseq: docKey },
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill reverseRequest: ${resp.Message} (${resp.Result})`,
            );
        }
    }

    /** 역발행 요청 취소 API를 호출한다 */
    async cancelReverseRequest(docKey: string, _memo: string): Promise<void> {
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/cancelReverseRequest",
            { billseq: docKey },
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill cancelReverseRequest: ${resp.Message} (${resp.Result})`,
            );
        }
    }

    /** 역발행 거부 API를 호출한다 */
    async refuse(docKey: string, _memo: string): Promise<void> {
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/refuseDoc",
            { billseq: docKey },
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill refuse: ${resp.Message} (${resp.Result})`,
            );
        }
    }

    /** 세금계산서 삭제 API를 호출한다 */
    async delete(docKey: string): Promise<void> {
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/deleteDoc",
            { billseq: docKey },
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill delete: ${resp.Message} (${resp.Result})`,
            );
        }
    }

    /** 세금계산서 상태 조회 API를 호출한다 */
    async getState(docKey: string): Promise<ProviderState> {
        const resp = await this.call<SendbillStateResponse>(
            "POST",
            "/api/agent/document/getDocState",
            { billseq: docKey },
        );
        if (resp.Result < 0) {
            throw new Error(
                `sendbill getState: ${resp.Message} (${resp.Result})`,
            );
        }
        const statusCode = String(resp.data?.status ?? "");
        const state = SENDBILL_STATE_MAP[statusCode] ?? "draft";
        const ntsConfirmNum = resp.data?.ntsconfirmno ?? "";
        const ntsSent = resp.data?.ntssendyn === "Y";
        return {
            state,
            nts_state: ntsConfirmNum
                ? "confirmed"
                : ntsSent
                  ? "waiting"
                  : "pending",
            nts_confirm_num: ntsConfirmNum,
            raw: JSON.stringify(resp),
        };
    }

    /** 세금계산서 상세 조회 API를 호출한다 */
    async getDetail(docKey: string): Promise<unknown> {
        const resp = await this.call<SendbillStateResponse>(
            "POST",
            "/api/agent/document/getDoc",
            { billseq: docKey },
        );
        return resp;
    }

    /** 세금계산서 로그 조회 API를 호출한다 */
    async getLogs(docKey: string): Promise<ProviderLog[]> {
        const resp = await this.call<SendbillLogResponse>(
            "POST",
            "/api/agent/document/getDocLog",
            { billseq: docKey },
        );
        if (!resp.list) return [];
        return resp.list.map((item) => ({
            log_type: item.logtype ?? "",
            log_time: item.logdt ?? "",
            description: item.msg ?? "",
        }));
    }

    /** 세금계산서 목록 조회 API를 호출한다 */
    async list(filter: ListFilter): Promise<ProviderSummary[]> {
        const resp = await this.call<SendbillListResponse>(
            "POST",
            "/api/agent/document/getDocList",
            {
                sdt: filter.start_date ?? "",
                edt: filter.end_date ?? "",
                page: filter.page ?? 1,
                limit: filter.limit ?? 100,
            },
        );
        if (!resp.list) return [];
        return resp.list.map((item) => ({
            doc_key: item.billseq ?? "",
            mgt_key: item.billseq ?? "",
            state: SENDBILL_STATE_MAP[String(item.status ?? "")] ?? "draft",
            nts_state: "pending",
            write_date: item.dt ?? "",
            invoicer_name: item.scompany ?? "",
            invoicee_name: item.rcompany ?? "",
            amount_total: Number(item.supmoney ?? 0),
            tax_total: Number(item.taxmoney ?? 0),
        }));
    }

    /** 세금계산서 이메일 전송 API를 호출한다 */
    async sendEmail(docKey: string, emails: string[]): Promise<void> {
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/sendEmail",
            { billseq: docKey, email: emails.join(",") },
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill sendEmail: ${resp.Message} (${resp.Result})`,
            );
        }
    }

    /** 세금계산서 SMS 전송 API를 호출한다 */
    async sendSMS(docKey: string, to: string): Promise<void> {
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/sendSMS",
            { billseq: docKey, telno: to },
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill sendSMS: ${resp.Message} (${resp.Result})`,
            );
        }
    }

    /** 국세청 전송 API를 호출한다 */
    async sendToNTS(docKey: string): Promise<void> {
        const resp = await this.call<SendbillResponse>(
            "POST",
            "/api/agent/document/sendNts",
            { billseq: docKey },
        );
        if (resp.Result <= 0) {
            throw new Error(
                `sendbill sendToNTS: ${resp.Message} (${resp.Result})`,
            );
        }
    }

    // ── HTTP Transport ──

    /** JSON API 요청을 전송한다 */
    private async call<T>(
        method: string,
        path: string,
        body: unknown,
    ): Promise<T> {
        const resp = await fetch(`${this.endpoint}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "Accept-Charset": "UTF-8",
                SBKEY: this.apiKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        const text = await resp.text();
        if (!resp.ok) {
            throw new Error(
                `sendbill ${method} ${path}: HTTP ${resp.status}: ${text}`,
            );
        }
        return JSON.parse(text) as T;
    }
}

// ── Request builder ──

/** InvoiceRequest → 센드빌 registDirect 파라미터 변환 */
function buildRegistDirectBody(req: InvoiceRequest): Record<string, unknown> {
    const s = req.invoicer;
    const b = req.invoicee;
    const items = (req.items ?? []).map((it) => ({
        obj: it.name ?? "",
        vlm: String(it.quantity ?? ""),
        danga: String(it.unit_price ?? ""),
        unit: it.information ?? "",
        sup: String(it.amount ?? 0),
        tax: String(it.tax ?? 0),
        dt: it.purchase_date ?? req.write_date ?? "",
        remark: it.description ?? "",
    }));

    const billType =
        req.tax_invoice_type === 2
            ? "14" // 영세율
            : req.tax_invoice_type === 3
              ? "32" // 면세
              : "10"; // 기본 과세

    return {
        billseq: req.mgt_key ?? "",
        svenderno: (s.corp_num ?? "").replace(/-/g, ""),
        rvenderno: (b.corp_num ?? "").replace(/-/g, ""),
        dt: req.write_date ?? "",
        supmoney: String(req.amount_total ?? 0),
        taxmoney: String(req.tax_total ?? 0),
        taxrate: String(
            req.tax_type === "zero"
                ? "2"
                : req.tax_type === "exempt"
                  ? "3"
                  : "0",
        ),
        gubun: String(req.purpose_type ?? 2),
        bigo: req.remark1 ?? "",
        billtype: billType,
        scompany: s.corp_name ?? "",
        sceoname: s.ceo_name ?? "",
        suptae: s.biz_type ?? "",
        supjong: s.biz_class ?? "",
        saddress: s.addr ?? "",
        suser: s.contact_name ?? "",
        stelno: s.tel ?? "",
        semail: s.email ?? "",
        rcompany: b.corp_name ?? "",
        rceoname: b.ceo_name ?? "",
        ruptae: b.biz_type ?? "",
        rupjong: b.biz_class ?? "",
        raddress: b.addr ?? "",
        ruser: b.contact_name ?? "",
        rtelno: b.tel ?? "",
        remail: b.email ?? "",
        reverseyn: req.issue_direction === "reverse" ? "Y" : "N",
        report_except_yn: "N",
        item: items,
    };
}
