/**
 * LlmParser — 템플릿 매칭 실패 시 LLM 서비스로 폴백
 */

import type { ParsedDocument, LlmPromptTemplate } from "./types/index.ts";
import { TemplateLoader } from "./template-loader.ts";

/** OCR이 LLM 서비스에 의존하기 위한 인터페이스 (순환 의존 방지) */
export interface LlmServiceLike {
    simpleChat(
        providerName: string,
        system: string,
        user: string,
    ): Promise<string>;
}

export class LlmParser {
    /** LLM 파서를 서비스와 프롬프트 설정으로 초기화한다 */
    constructor(
        private readonly llmService: LlmServiceLike,
        private readonly providerName: string,
        private readonly promptDir: string,
        private readonly loader: TemplateLoader,
    ) {}

    /** OCR 텍스트를 LLM으로 파싱 */
    async parse(ocrText: string, docType: string): Promise<ParsedDocument> {
        if (!this.llmService) throw new Error("LLM service not configured");

        // 1. 프롬프트 템플릿 로드
        const prompt = this.loader.loadPrompt(this.promptDir, docType);

        // 2. 프롬프트 조립
        const schemaJson = JSON.stringify(prompt.schema, null, 2);
        let userMsg = prompt.userMsg.replace("{{ocr_text}}", ocrText);
        userMsg = userMsg.replace("{{schema}}", schemaJson);

        // 3. LLM 서비스 호출
        const response = await this.llmService.simpleChat(
            this.providerName,
            prompt.systemMsg,
            userMsg,
        );

        // 4. JSON 파싱
        return parseResponse(docType, response);
    }
}

/** LLM 응답을 ParsedDocument로 변환한다 */
function parseResponse(docType: string, response: string): ParsedDocument {
    const cleaned = stripMarkdownJSON(response.trim());

    let raw: Record<string, string>;
    try {
        raw = JSON.parse(cleaned);
    } catch {
        throw new Error(`LLM JSON parse error: ${cleaned.slice(0, 200)}`);
    }

    const doc: ParsedDocument = { docType };

    switch (docType) {
        case "business_reg":
            doc.businessReg = {
                corpNum: raw["corp_num"],
                corpName: raw["corp_name"],
                ceoName: raw["ceo_name"],
                address: raw["address"],
                bizType: raw["biz_type"],
                bizClass: raw["biz_class"],
                openDate: raw["open_date"],
            };
            break;
        case "receipt":
            doc.receipt = {
                storeName: raw["store_name"],
                storeAddr: raw["store_addr"],
                corpNum: raw["corp_num"],
                date: raw["date"],
                totalAmount: raw["total_amount"],
                paymentType: raw["payment_type"],
                cardNumber: raw["card_number"],
            };
            break;
        case "invoice":
            doc.invoice = {
                invoiceNum: raw["invoice_num"],
                issuerCorpNum: raw["issuer_corp_num"],
                issuerName: raw["issuer_name"],
                receiverCorpNum: raw["receiver_corp_num"],
                receiverName: raw["receiver_name"],
                writeDate: raw["write_date"],
                amountTotal: raw["amount_total"],
                taxTotal: raw["tax_total"],
                totalAmount: raw["total_amount"],
            };
            break;
        case "namecard":
            doc.namecard = {
                name: raw["name"],
                company: raw["company"],
                department: raw["department"],
                title: raw["title"],
                address: raw["address"],
                website: raw["website"],
            };
            break;
        case "id_card":
            doc.idCard = {
                name: raw["name"],
                idNumber: raw["id_number"],
                issueDate: raw["issue_date"],
                issuer: raw["issuer"],
            };
            break;
        case "driver_license":
            doc.driverLicense = {
                name: raw["name"],
                idNumber: raw["id_number"],
                licenseNum: raw["license_num"],
                licenseType: raw["license_type"],
                issueDate: raw["issue_date"],
                expiryDate: raw["expiry_date"],
                issuer: raw["issuer"],
            };
            break;
        case "facility_card":
            doc.facilityCard = {
                buildingName: raw["building_name"],
                address: raw["address"],
                buildingUse: raw["building_use"],
                structure: raw["structure"],
                area: raw["area"],
                floorCount: raw["floor_count"],
                approvalDate: raw["approval_date"],
                owner: raw["owner"],
            };
            break;
        case "career_cert":
            doc.careerCert = {
                name: raw["name"],
                idNumber: raw["id_number"],
                company: raw["company"],
                department: raw["department"],
                position: raw["position"],
                joinDate: raw["join_date"],
                leaveDate: raw["leave_date"],
                issueDate: raw["issue_date"],
                issuer: raw["issuer"],
            };
            break;
        default:
            throw new Error(`Unsupported doc_type for LLM parsing: ${docType}`);
    }
    return doc;
}

/** 마크다운 코드 블록 구분자를 제거한다 */
function stripMarkdownJSON(s: string): string {
    s = s.replace(/^```json\s*/, "").replace(/^```\s*/, "");
    s = s.replace(/\s*```$/, "");
    return s.trim();
}
