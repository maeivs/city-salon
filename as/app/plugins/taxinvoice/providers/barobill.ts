/**
 * 바로빌 (Barobill) 전자세금계산서 드라이버
 *
 * SOAP/XML 기반 API — https://barobill.co.kr/TAPI/TaxInvoiceService.asmx
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

const BAROBILL_STATE_MAP: Record<number, string> = {
    1000: "draft",
    2010: "pre_issue_waiting",
    3014: "issued",
    3011: "issued",
    4012: "refused",
    5013: "cancelled",
    5014: "issue_cancelled",
};

export class BarobillDriver implements TaxInvoiceDriver {
    private certKey: string;
    private corpNum: string;
    private userID: string;
    private endpoint: string;
    private timeoutMs: number;

    /** BarobillClient 인스턴스를 초기화한다 */
    constructor(cfg: TaxInvoiceProviderConfig) {
        this.certKey = cfg.cert_key ?? "";
        this.corpNum = cfg.corp_num ?? "";
        this.userID = cfg.user_id ?? "";
        this.endpoint = cfg.api_endpoint;
        this.timeoutMs = (cfg.timeout_sec ?? 30) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name(): string {
        return "barobill";
    }

    /** 세금계산서 등록 및 즉시 발행 API를 호출한다 */
    async registIssue(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.soapCall(
            "RegistAndIssueTaxInvoice",
            this.buildEnvelope("RegistAndIssueTaxInvoice"),
        );
        return this.parseProviderState(resp);
    }

    /** 세금계산서 임시 저장 API를 호출한다 */
    async register(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.soapCall(
            "RegistTaxInvoice",
            this.buildEnvelope("RegistTaxInvoice"),
        );
        return this.parseProviderState(resp);
    }

    /** 세금계산서 발행 API를 호출한다 */
    async issue(docKey: string, opts: IssueOptions): Promise<ProviderState> {
        const resp = await this.soapCall(
            "IssueTaxInvoice",
            this.buildEnvelope("IssueTaxInvoice"),
        );
        return this.parseProviderState(resp);
    }

    /** 세금계산서 발행 취소 API를 호출한다 */
    async cancelIssue(docKey: string, memo: string): Promise<void> {
        await this.soapCall(
            "CancelIssueTaxInvoice",
            this.buildEnvelope("CancelIssueTaxInvoice"),
        );
    }

    /** 역발행 요청 등록 API를 호출한다 */
    async registReverseRequest(req: InvoiceRequest): Promise<ProviderState> {
        const resp = await this.soapCall(
            "RegistAndRequestReverseIssueTaxInvoice",
            this.buildEnvelope("RegistAndRequestReverseIssueTaxInvoice"),
        );
        return this.parseProviderState(resp);
    }

    /** 역발행 요청 API를 호출한다 */
    async reverseRequest(docKey: string, memo: string): Promise<void> {
        await this.soapCall(
            "RequestReverseIssueTaxInvoice",
            this.buildEnvelope("RequestReverseIssueTaxInvoice"),
        );
    }

    /** 역발행 요청 취소 API를 호출한다 */
    async cancelReverseRequest(docKey: string, memo: string): Promise<void> {
        await this.soapCall(
            "CancelRequestReverseIssueTaxInvoice",
            this.buildEnvelope("CancelRequestReverseIssueTaxInvoice"),
        );
    }

    /** 역발행 거부 API를 호출한다 */
    async refuse(docKey: string, memo: string): Promise<void> {
        await this.soapCall(
            "RefuseReverseIssueTaxInvoice",
            this.buildEnvelope("RefuseReverseIssueTaxInvoice"),
        );
    }

    /** 세금계산서 삭제 API를 호출한다 */
    async delete(docKey: string): Promise<void> {
        await this.soapCall(
            "DeleteTaxInvoice",
            this.buildEnvelope("DeleteTaxInvoice"),
        );
    }

    /** 세금계산서 상태 조회 API를 호출한다 */
    async getState(docKey: string): Promise<ProviderState> {
        const resp = await this.soapCall(
            "GetTaxInvoiceState",
            this.buildEnvelope("GetTaxInvoiceState"),
        );
        return this.normalizeState(resp);
    }

    /** 세금계산서 상세 조회 API를 호출한다 */
    async getDetail(docKey: string): Promise<unknown> {
        const resp = await this.soapCall(
            "GetTaxInvoice",
            this.buildEnvelope("GetTaxInvoice"),
        );
        return resp;
    }

    /** 세금계산서 로그 조회 API를 호출한다 */
    async getLogs(docKey: string): Promise<ProviderLog[]> {
        await this.soapCall(
            "GetTaxInvoiceLogs",
            this.buildEnvelope("GetTaxInvoiceLogs"),
        );
        return [];
    }

    /** 세금계산서 목록 조회 API를 호출한다 */
    async list(filter: ListFilter): Promise<ProviderSummary[]> {
        await this.soapCall(
            "GetTaxInvoiceList",
            this.buildEnvelope("GetTaxInvoiceList"),
        );
        return [];
    }

    /** 세금계산서 이메일 전송 API를 호출한다 */
    async sendEmail(docKey: string, emails: string[]): Promise<void> {
        await this.soapCall(
            "SendEmailTaxInvoice",
            this.buildEnvelope("SendEmailTaxInvoice"),
        );
    }

    /** 세금계산서 SMS 전송 API를 호출한다 */
    async sendSMS(docKey: string, to: string): Promise<void> {
        await this.soapCall(
            "SendSMSTaxInvoice",
            this.buildEnvelope("SendSMSTaxInvoice"),
        );
    }

    /** 국세청 전송 API를 호출한다 */
    async sendToNTS(docKey: string): Promise<void> {
        await this.soapCall("SendToNTS", this.buildEnvelope("SendToNTS"));
    }

    // ── SOAP Transport ──

    /** SOAP 요청을 전송한다 */
    private async soapCall(action: string, envelope: string): Promise<string> {
        const soapAction = `https://barobill.co.kr/${action}`;
        const resp = await fetch(this.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                SOAPAction: soapAction,
            },
            body: envelope,
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        const body = await resp.text();
        if (!resp.ok) {
            throw new Error(
                `barobill SOAP ${action}: HTTP ${resp.status}: ${body}`,
            );
        }
        return body;
    }

    /** SOAP 봉투 XML을 생성한다 */
    private buildEnvelope(action: string): string {
        return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:bar="https://barobill.co.kr/">
  <soap:Body>
    <bar:${action}>
      <bar:CERTKEY>${this.certKey}</bar:CERTKEY>
      <bar:CorpNum>${this.corpNum}</bar:CorpNum>
      <bar:ID>${this.userID}</bar:ID>
    </bar:${action}>
  </soap:Body>
</soap:Envelope>`;
    }

    /** SOAP 응답에서 Result 태그 값을 추출한다 */
    private extractResultValue(xml: string, action: string): string {
        // <{action}Result>VALUE</{action}Result> 패턴 매칭
        const re = new RegExp(`<${action}Result>([^<]*)</${action}Result>`);
        const m = xml.match(re);
        return m?.[1] ?? "";
    }

    /** SOAP 응답에서 NTS 승인번호를 추출한다 */
    private extractNtsConfirmNum(xml: string): string {
        const m = xml.match(/<NTSConfirmNum>([^<]*)<\/NTSConfirmNum>/);
        return m?.[1] ?? "";
    }

    /** 응답을 ProviderState로 파싱한다 */
    private parseProviderState(resp: string): ProviderState {
        // Barobill 등록/발행 API 는 Result 에 상태 코드(long)를 반환
        const raw =
            this.extractResultValue(resp, "RegistAndIssueTaxInvoiceResult") ||
            this.extractResultValue(resp, "RegistTaxInvoiceResult") ||
            this.extractResultValue(resp, "IssueTaxInvoiceResult") ||
            this.extractResultValue(
                resp,
                "RegistAndRequestReverseIssueTaxInvoiceResult",
            );
        const code = parseInt(raw, 10);
        const state =
            code > 0 && BAROBILL_STATE_MAP[code]
                ? BAROBILL_STATE_MAP[code]
                : "draft";
        const ntsConfirmNum = this.extractNtsConfirmNum(resp);
        return {
            state,
            nts_state: ntsConfirmNum ? "confirmed" : "pending",
            nts_confirm_num: ntsConfirmNum,
            raw: resp,
        };
    }

    /** GetTaxInvoiceState 상태 응답을 정규화한다 */
    private normalizeState(resp: string): ProviderState {
        const raw = this.extractResultValue(resp, "GetTaxInvoiceStateResult");
        const code = parseInt(raw, 10);
        const state =
            code > 0 && BAROBILL_STATE_MAP[code]
                ? BAROBILL_STATE_MAP[code]
                : "draft";
        const ntsConfirmNum = this.extractNtsConfirmNum(resp);
        return {
            state,
            nts_state: ntsConfirmNum ? "confirmed" : "pending",
            nts_confirm_num: ntsConfirmNum,
            raw: resp,
        };
    }
}
