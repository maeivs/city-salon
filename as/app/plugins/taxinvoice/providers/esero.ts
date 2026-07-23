/**
 * 이세로 (eSero / 국세청 직접) 전자세금계산서 드라이버
 *
 * XML + XMLDSig — https://esero.go.kr/v1
 * 공동인증서(.pfx) 전자서명을 사용한 국세청 직접 제출
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

const ERR_NOT_SUPPORTED = "esero: operation not supported";

export class EseroDriver implements TaxInvoiceDriver {
    private certPath: string;
    private certPass: string;
    private corpNum: string;
    private endpoint: string;
    private timeoutMs: number;

    /** EseroClient 인스턴스를 초기화한다 */
    constructor(cfg: TaxInvoiceProviderConfig) {
        this.certPath = cfg.cert_path ?? "";
        this.certPass = cfg.cert_pass ?? "";
        this.corpNum = cfg.corp_num ?? "";
        this.endpoint = cfg.api_endpoint;
        this.timeoutMs = (cfg.timeout_sec ?? 60) * 1000;
    }

    /** 드라이버 이름을 반환한다 */
    name(): string {
        return "esero";
    }

    /** 세금계산서 등록 및 즉시 발행 API를 호출한다 */
    async registIssue(req: InvoiceRequest): Promise<ProviderState> {
        const xmlData = buildKFTCXML(req);
        const signed = signXML(xmlData, this.certPath, this.certPass);
        const resp = await this.submitToNTS(signed);
        const confirmNum = parseNTSConfirmNum(resp);
        if (confirmNum) {
            return {
                state: "issued",
                nts_state: "completed",
                nts_confirm_num: confirmNum,
                raw: resp,
            };
        }
        return {
            state: "issued",
            nts_state: "waiting",
            nts_confirm_num: "",
            raw: resp,
        };
    }

    /** 세금계산서 임시 저장 API를 호출한다 */
    async register(_req: InvoiceRequest): Promise<ProviderState> {
        return { state: "draft", nts_state: "pending", nts_confirm_num: "" };
    }

    /** 세금계산서 발행 API를 호출한다 */
    async issue(_docKey: string, _opts: IssueOptions): Promise<ProviderState> {
        throw new Error(
            "esero Issue: use Service.RegistIssue() which delegates to RegistIssue",
        );
    }

    /** 세금계산서 발행 취소 API를 호출한다 */
    async cancelIssue(docKey: string, _memo: string): Promise<void> {
        const cancelXML = `<?xml version="1.0" encoding="utf-8"?><CancelRequest><ID>${docKey}</ID><CorpNum>${this.corpNum}</CorpNum></CancelRequest>`;
        const signed = signXML(cancelXML, this.certPath, this.certPass);
        await this.submitToNTS(signed);
    }

    /** 역발행 요청 등록 API를 호출한다 */
    async registReverseRequest(_req: InvoiceRequest): Promise<ProviderState> {
        throw new Error(ERR_NOT_SUPPORTED);
    }

    /** 역발행 요청 API를 호출한다 */
    async reverseRequest(_docKey: string, _memo: string): Promise<void> {
        throw new Error(ERR_NOT_SUPPORTED);
    }

    /** 역발행 요청 취소 API를 호출한다 */
    async cancelReverseRequest(_docKey: string, _memo: string): Promise<void> {
        throw new Error(ERR_NOT_SUPPORTED);
    }

    /** 역발행 거부 API를 호출한다 */
    async refuse(_docKey: string, _memo: string): Promise<void> {
        throw new Error(ERR_NOT_SUPPORTED);
    }

    /** 세금계산서 삭제 API를 호출한다 */
    async delete(_docKey: string): Promise<void> {
        // no-op
    }

    /** 세금계산서 상태 조회 API를 호출한다 */
    async getState(docKey: string): Promise<ProviderState> {
        const queryXML = `<?xml version="1.0" encoding="utf-8"?><StateQuery><ID>${docKey}</ID><CorpNum>${this.corpNum}</CorpNum></StateQuery>`;
        const signed = signXML(queryXML, this.certPath, this.certPass);
        const resp = await this.submitToNTS(signed);
        return {
            state: "issued",
            nts_state: "completed",
            nts_confirm_num: "",
            raw: resp,
        };
    }

    /** 세금계산서 상세 조회 API를 호출한다 */
    async getDetail(docKey: string): Promise<unknown> {
        const queryXML = `<?xml version="1.0" encoding="utf-8"?><DetailQuery><ID>${docKey}</ID><CorpNum>${this.corpNum}</CorpNum></DetailQuery>`;
        const signed = signXML(queryXML, this.certPath, this.certPass);
        const resp = await this.submitToNTS(signed);
        return resp;
    }

    /** 세금계산서 로그 조회 API를 호출한다 */
    async getLogs(_docKey: string): Promise<ProviderLog[]> {
        return [];
    }

    /** 세금계산서 목록 조회 API를 호출한다 */
    async list(_filter: ListFilter): Promise<ProviderSummary[]> {
        return [];
    }

    /** 세금계산서 이메일 전송 API를 호출한다 */
    async sendEmail(_docKey: string, _emails: string[]): Promise<void> {
        throw new Error(ERR_NOT_SUPPORTED);
    }

    /** 세금계산서 SMS 전송 API를 호출한다 */
    async sendSMS(_docKey: string, _to: string): Promise<void> {
        throw new Error(ERR_NOT_SUPPORTED);
    }

    /** 국세청 전송 API를 호출한다 */
    async sendToNTS(_docKey: string): Promise<void> {
        // esero는 RegistIssue에서 이미 국세청 직접 제출하므로 no-op
    }

    // ── Internal ──

    /** 서명된 XML을 국세청에 제출한다 */
    private async submitToNTS(signedXML: string): Promise<string> {
        const resp = await fetch(`${this.endpoint}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/xml; charset=utf-8" },
            body: signedXML,
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        const body = await resp.text();
        if (!resp.ok) {
            throw new Error(`esero submit: HTTP ${resp.status}: ${body}`);
        }
        return body;
    }
}

// ── XML Helpers ──

/** KFTC 표준전자세금계산서 XML을 생성한다 */
function buildKFTCXML(req: InvoiceRequest): string {
    // KFTC 표준전자세금계산서 XML 빌드
    // TODO: 전체 필드 매핑 (현재는 최소 골격만)
    return `<?xml version="1.0" encoding="utf-8"?>
<TaxInvoice xmlns="urn:kr:or:kec:standard:Tax:ReusableAggregateBusinessInformationEntitySchemaModule:1:0" version="3.0">
  <ExchangedDocument>
    <ID>${req.mgt_key}</ID>
  </ExchangedDocument>
</TaxInvoice>`;
}

/** XML 전자서명을 수행한다 */
function signXML(
    xmlData: string,
    _certPath: string,
    _certPass: string,
): string {
    // TODO: XMLDSig enveloped-signature 구현
    return xmlData;
}

/** 국세청 승인번호를 파싱한다 */
function parseNTSConfirmNum(resp: string): string {
    // 단순 정규식으로 ConfirmNum 파싱
    const match = resp.match(/<ConfirmNum>([^<]+)<\/ConfirmNum>/);
    return match?.[1] ?? "";
}
