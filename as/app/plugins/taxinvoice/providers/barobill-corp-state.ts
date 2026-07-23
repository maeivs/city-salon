import type { TaxInvoiceProviderConfig } from "../types/index.ts";

export interface BarobillCorpStateEx {
    CorpNum: string;
    CorpType: number;
    TaxType: number;
    TaxTypeChangeDate: string;
    TaxTypeBefore: number;
    TaxInvoiceApplyDate: string;
    State: number;
    StateDate: string;
    BaseDate: string;
}

export const BAROBILL_CORP_STATE_MAX_ITEMS = 1000;

const BAROBILL_NS = "http://ws.baroservice.com/";

const BAROBILL_CORP_TYPE_LABELS: Record<number, string> = {
    0: "없는사업자",
    1: "일반과세자",
    3: "법인사업자",
    6: "비영리법인",
    8: "고유번호가 부여된 단체",
};

const BAROBILL_TAX_TYPE_LABELS: Record<number, string> = {
    0: "없는사업자",
    1: "일반과세자",
    2: "간이과세자",
    4: "면세사업자",
    5: "과특사업자",
    6: "비영리법인",
    7: "간이과세자(세금계산서 발급사업자)",
    8: "고유번호가 부여된 단체",
};

const BAROBILL_STATE_LABELS: Record<number, string> = {
    0: "없는사업자",
    1: "계속사업자",
    2: "휴업자",
    3: "폐업자",
};

export class BarobillCorpStateClient {
    private readonly certKey: string;
    private readonly corpNum: string;
    private readonly endpoint: string;
    private readonly timeoutMs: number;

    /** 바로빌 휴폐업조회 클라이언트를 초기화한다. */
    constructor(config: TaxInvoiceProviderConfig) {
        this.certKey = config.cert_key ?? "";
        this.corpNum = normalizeBusinessNumber(config.corp_num ?? "");
        this.endpoint = config.corp_state_endpoint ?? config.api_endpoint;
        this.timeoutMs = (config.timeout_sec ?? 30) * 1000;
    }

    /** 바로빌 단건 사업자등록 상태조회 API를 호출한다. */
    async getCorpState(businessNumber: string): Promise<BarobillCorpStateEx> {
        this.ensureConfigured();
        const normalized = normalizeBusinessNumber(businessNumber);
        const response = await this.soapCall(
            "GetCorpStateEx",
            `<bar:CheckCorpNum>${escapeXml(normalized)}</bar:CheckCorpNum>`,
        );
        return parseBarobillCorpState(response, "GetCorpStateExResult");
    }

    /** 바로빌 대량 사업자등록 상태조회 API를 호출한다. */
    async getCorpStates(
        businessNumbers: string[],
    ): Promise<BarobillCorpStateEx[]> {
        this.ensureConfigured();
        const numbersXml = businessNumbers
            .map(
                (businessNumber) =>
                    `<bar:string>${escapeXml(normalizeBusinessNumber(businessNumber))}</bar:string>`,
            )
            .join("");
        const response = await this.soapCall(
            "GetCorpStatesEx",
            `<bar:CheckCorpNumList>${numbersXml}</bar:CheckCorpNumList>`,
        );
        return parseBarobillCorpStates(response);
    }

    /** 바로빌 연동 필수 설정을 검증한다. */
    private ensureConfigured(): void {
        if (!this.certKey || !this.corpNum) {
            throw new Error(
                "BAROBILL_CERT_KEY and BAROBILL_CORP_NUM are required",
            );
        }
    }

    /** 바로빌 SOAP 요청을 전송한다. */
    private async soapCall(
        action: "GetCorpStateEx" | "GetCorpStatesEx",
        bodyXml: string,
    ): Promise<string> {
        const response = await fetch(this.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                SOAPAction: `${BAROBILL_NS}${action}`,
            },
            body: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:bar="${BAROBILL_NS}">
  <soap:Body>
    <bar:${action}>
      <bar:CERTKEY>${escapeXml(this.certKey)}</bar:CERTKEY>
      <bar:CorpNum>${escapeXml(this.corpNum)}</bar:CorpNum>
      ${bodyXml}
    </bar:${action}>
  </soap:Body>
</soap:Envelope>`,
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        const text = await response.text();
        if (!response.ok) {
            const error = new Error(`Barobill SOAP ${action} failed`);
            Object.assign(error, { status: response.status, upstream: text });
            throw error;
        }
        return text;
    }
}

/** 바로빌 상태 객체를 AS 응답용 JSON으로 정규화한다. */
export function normalizeBarobillCorpState(
    state: BarobillCorpStateEx,
): Record<string, unknown> {
    return {
        b_no: state.CorpNum,
        corp_type: state.CorpType,
        corp_type_name: BAROBILL_CORP_TYPE_LABELS[state.CorpType] ?? "알수없음",
        tax_type: state.TaxType,
        tax_type_name: BAROBILL_TAX_TYPE_LABELS[state.TaxType] ?? "알수없음",
        tax_type_change_dt: state.TaxTypeChangeDate,
        tax_type_before: state.TaxTypeBefore,
        tax_type_before_name:
            BAROBILL_TAX_TYPE_LABELS[state.TaxTypeBefore] ?? "알수없음",
        tax_invoice_apply_dt: state.TaxInvoiceApplyDate,
        state: state.State,
        state_name: BAROBILL_STATE_LABELS[state.State] ?? "알수없음",
        state_dt: state.StateDate,
        base_dt: state.BaseDate,
        raw: state,
    };
}

/** 사업자등록번호를 숫자 10자리로 정규화한다. */
function normalizeBusinessNumber(value: string): string {
    const normalized = String(value ?? "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(normalized)) {
        throw new Error("business number must be 10 digits");
    }
    return normalized;
}

/** 바로빌 단건 SOAP 응답을 상태 객체로 파싱한다. */
function parseBarobillCorpState(
    xml: string,
    resultTag: string,
): BarobillCorpStateEx {
    const resultXml = extractXmlTag(xml, resultTag);
    if (!resultXml) {
        throw new Error(`Barobill ${resultTag} not found`);
    }
    return parseBarobillCorpStateBlock(resultXml);
}

/** 바로빌 대량 SOAP 응답을 상태 객체 배열로 파싱한다. */
function parseBarobillCorpStates(xml: string): BarobillCorpStateEx[] {
    const resultXml = extractXmlTag(xml, "GetCorpStatesExResult");
    if (!resultXml) {
        throw new Error("Barobill GetCorpStatesExResult not found");
    }

    const matches =
        resultXml.match(/<CorpStateEx[\s\S]*?<\/CorpStateEx>/g) ?? [];
    return matches.map((itemXml) => parseBarobillCorpStateBlock(itemXml));
}

/** 바로빌 CorpStateEx XML 블록을 객체로 변환한다. */
function parseBarobillCorpStateBlock(xml: string): BarobillCorpStateEx {
    return {
        CorpNum: extractXmlTag(xml, "CorpNum"),
        CorpType: extractXmlNumber(xml, "CorpType"),
        TaxType: extractXmlNumber(xml, "TaxType"),
        TaxTypeChangeDate: extractXmlTag(xml, "TaxTypeChangeDate"),
        TaxTypeBefore: extractXmlNumber(xml, "TaxTypeBefore"),
        TaxInvoiceApplyDate: extractXmlTag(xml, "TaxInvoiceApplyDate"),
        State: extractXmlNumber(xml, "State"),
        StateDate: extractXmlTag(xml, "StateDate"),
        BaseDate: extractXmlTag(xml, "BaseDate"),
    };
}

/** XML 태그의 문자열 값을 추출한다. */
function extractXmlTag(xml: string, tagName: string): string {
    const pattern = new RegExp(
        `<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`,
    );
    const value = xml.match(pattern)?.[1] ?? "";
    return unescapeXml(value.trim());
}

/** XML 태그의 숫자 값을 추출한다. */
function extractXmlNumber(xml: string, tagName: string): number {
    const parsed = Number.parseInt(extractXmlTag(xml, tagName), 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

/** SOAP XML에 넣을 값을 이스케이프한다. */
function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** SOAP XML에서 추출한 값을 원래 문자열로 되돌린다. */
function unescapeXml(value: string): string {
    return value
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}
