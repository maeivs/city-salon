/**
 * TemplateMatcher — JSON 기반 키워드+방향 매칭으로 필드 추출
 * PHP NaverClovaMatcher 포팅
 */

import type {
    TextBlock,
    RawOcrResult,
    ProcessedPage,
    ProcessedItem,
    BaseItem,
    MatchResult,
    FieldConfig,
    Template,
    RegionConfig,
    ParsedDocument,
    ParsedReceipt,
    ParsedNamecard,
    ParsedInvoice,
    ParsedBusinessReg,
    ParsedIdCard,
    ParsedDriverLicense,
    ParsedFacilityCard,
    ParsedCareerCert,
    Criterion,
} from "./types/index.ts";
import { TemplateLoader } from "./template-loader.ts";
import { TextPreprocessor } from "./preprocessor.ts";
import { Refiner } from "./refiner.ts";
import { checkDirectionMatch } from "./direction.ts";

export class TemplateMatcher {
    private readonly loader: TemplateLoader;
    private readonly preprocessor = new TextPreprocessor();
    private readonly refiner = new Refiner();
    private mergePatterns: string[] = [];

    /** 템플릿 로더로 TemplateMatcher를 초기화한다 */
    constructor(loader: TemplateLoader) {
        this.loader = loader;
    }

    /** 해당 문서 타입의 템플릿 존재 여부를 확인한다 */
    hasTemplate(docType: string): boolean {
        return this.loader.has(docType);
    }

    /** RawOcrResult를 템플릿 기반으로 매칭 */
    match(raw: RawOcrResult, docType: string): MatchResult {
        const template = this.loader.load(docType);

        // 전체 페이지의 모든 TextBlock 수집
        const allBlocks: TextBlock[] = [];
        for (const page of raw.pages) {
            allBlocks.push(...page.blocks);
        }

        // PreprocessConfig 구성
        const preprocessCfg = { ...template.preprocess };
        if (!preprocessCfg.keywords) preprocessCfg.keywords = {};
        for (const [k, v] of Object.entries(template.keywords ?? {})) {
            preprocessCfg.keywords[k] = v;
        }

        this.mergePatterns = preprocessCfg.mergePatterns ?? [];
        const page = this.preprocessor.preprocess(allBlocks, preprocessCfg);

        // 필드별 추출
        const extracted: Record<string, string> = {};
        for (const [fieldName, fieldCfg] of Object.entries(template.fields)) {
            let value = "";
            switch (fieldCfg.mode) {
                case "region":
                    if (fieldCfg.region)
                        value = this.extractRegion(allBlocks, fieldCfg.region);
                    break;
                case "regex_scan":
                    value = this.extractRegexScan(page, fieldCfg);
                    break;
                default: // anchor
                    value = this.findText(page, fieldCfg.criteria ?? [], "");
                    break;
            }
            if (fieldCfg.refine && value) {
                value = this.refiner.refine(value, fieldCfg.refine);
            }
            if (value) extracted[fieldName] = value;
        }

        const { confidence, missingRequired } = this.evaluateResult(
            template,
            extracted,
        );
        const parsed = buildParsedDocument(docType, extracted);

        return { parsed, confidence, missingRequired, extracted };
    }

    // ─── 내부 메서드 ───

    /** 기준점과 방향 조건으로 텍스트를 찾는다 */
    private findText(
        page: ProcessedPage,
        criteria: Criterion[],
        requiredKeyword: string,
    ): string {
        if (!criteria.length) return "";
        if (
            requiredKeyword &&
            !this.checkRequiredKeyword(page, requiredKeyword)
        )
            return "";

        const bases = this.findBaseItems(page, criteria);
        if (!bases.length) return "";

        const matchingItems = this.findMatchingItems(page, bases);
        return this.combineMatchingItems(matchingItems);
    }

    /** 필수 키워드가 페이지에 존재하는지 확인한다 */
    private checkRequiredKeyword(
        page: ProcessedPage,
        keyword: string,
    ): boolean {
        for (const items of Object.values(page.keywordList)) {
            if (items.some((item) => this.isPatternMatch(item.text, keyword)))
                return true;
        }
        return page.valueList.some((item) =>
            this.isPatternMatch(item.text, keyword),
        );
    }

    /** 기준점 매칭 항목들을 찾는다 */
    private findBaseItems(
        page: ProcessedPage,
        criteria: Criterion[],
    ): BaseItem[] {
        const bases: BaseItem[] = [];
        const allItems = getAllItems(page);

        for (const c of criteria) {
            const found = allItems.find((item) =>
                this.isPatternMatch(item.text, c.keyword),
            );
            if (found) bases.push({ item: found, direction: c.direction });
        }
        return bases;
    }

    /** 텍스트가 패턴과 일치하는지 검사한다 */
    private isPatternMatch(text: string, pattern: string): boolean {
        const itemText = text.replace(/ /g, "");
        const searchPattern = pattern.replace(/ /g, "");

        if (
            searchPattern.length > 2 &&
            searchPattern.startsWith("/") &&
            searchPattern.endsWith("/")
        ) {
            try {
                return new RegExp(searchPattern.slice(1, -1)).test(itemText);
            } catch {
                return false;
            }
        }
        return itemText === searchPattern;
    }

    /** 모든 기준점 방향 조건을 만족하는 항목들을 찾는다 */
    private findMatchingItems(
        page: ProcessedPage,
        bases: BaseItem[],
    ): ProcessedItem[] {
        return page.valueList.filter((item) => {
            for (const base of bases) {
                if (!checkDirectionMatch(item, base.item, base.direction))
                    return false;
            }
            // leading ':' 제거
            let text = item.text.trim();
            if (text.startsWith(":")) item.text = text.slice(1).trim();
            return true;
        });
    }

    /** 매칭된 항목들을 정렬하여 하나의 문자열로 결합한다 */
    private combineMatchingItems(items: ProcessedItem[]): string {
        if (!items.length) return "";

        items.sort((a, b) => {
            if (Math.abs(a.centerY - b.centerY) > 10) return a.top - b.top;
            return a.left - b.left;
        });

        const parts = items.map((i) => i.text.trim()).filter(Boolean);
        let combined = parts.join(" ").replace(/\s+/g, " ");

        // merge_patterns 재적용: "건 축 물" → "건축물"
        for (const pattern of this.mergePatterns) {
            const spaceless = pattern.replace(/ /g, "");
            const runes = [...spaceless];
            const reStr = runes.map((r) => escapeRegex(r)).join("\\s*");
            try {
                combined = combined.replace(new RegExp(reStr, "g"), pattern);
            } catch {
                /* ignore */
            }
        }

        return combined.trim();
    }

    /** 키워드 범위 영역에서 텍스트를 추출한다 */
    private extractRegion(
        blocks: TextBlock[],
        regionCfg: RegionConfig,
    ): string {
        const fromBlock = this.findKeywordBlock(blocks, regionCfg.from);
        if (!fromBlock) return "";

        const toBlock = regionCfg.to
            ? this.findKeywordBlock(blocks, regionCfg.to)
            : null;
        const bottomBound = toBlock ? toBlock.boundingBox.top : Infinity;
        const regionTop = fromBlock.boundingBox.bottom;
        const regionLeft = fromBlock.boundingBox.right;

        const collected = blocks.filter(
            (b) =>
                b.boundingBox.top >= regionTop &&
                b.boundingBox.bottom <= bottomBound &&
                b.boundingBox.left >= regionLeft,
        );

        collected.sort((a, b) => {
            const dt = Math.abs(a.boundingBox.top - b.boundingBox.top);
            if (dt > 5) return a.boundingBox.top - b.boundingBox.top;
            return a.boundingBox.left - b.boundingBox.left;
        });

        return collected
            .map((b) => b.text)
            .join(" ")
            .trim();
    }

    /** 키워드에 해당하는 TextBlock을 찾는다 */
    private findKeywordBlock(
        blocks: TextBlock[],
        keyword: string,
    ): TextBlock | null {
        const cleanKw = keyword.replace(/ /g, "");
        for (const block of blocks) {
            const cleanText = block.text.replace(/ /g, "");
            if (cleanText === cleanKw || cleanText.startsWith(cleanKw))
                return block;
        }
        return null;
    }

    /** 정규식 스캔으로 필드 값을 추출한다 */
    private extractRegexScan(page: ProcessedPage, field: FieldConfig): string {
        if (!field.pattern) return "";
        let re: RegExp;
        try {
            re = new RegExp(field.pattern);
        } catch {
            return "";
        }

        for (const item of page.valueList) {
            const matches = item.text.match(re);
            if (!matches) continue;
            const group = field.captureGroup ?? 0;
            if (group > 0 && group < matches.length) return matches[group];
            return matches[0];
        }
        return "";
    }

    /** 추출 결과의 신뢰도와 누락 필드를 평가한다 */
    private evaluateResult(
        template: Template,
        extracted: Record<string, string>,
    ): { confidence: number; missingRequired: string[] } {
        const missingRequired: string[] = [];
        for (const field of template.requiredFields ?? []) {
            if (!extracted[field]) missingRequired.push(field);
        }

        let totalWeight = 0;
        let matchedWeight = 0;
        for (const [field, weight] of Object.entries(
            template.confidenceWeight ?? {},
        )) {
            totalWeight += weight;
            if (extracted[field]) matchedWeight += weight;
        }
        const confidence = totalWeight > 0 ? matchedWeight / totalWeight : 0;
        return { confidence, missingRequired };
    }
}

// ─── 헬퍼 함수 ───

/** 페이지 내 모든 항목(키워드+값)을 하나의 배열로 반환한다 */
function getAllItems(page: ProcessedPage): ProcessedItem[] {
    const all: ProcessedItem[] = [];
    for (const items of Object.values(page.keywordList)) {
        all.push(...items);
    }
    all.push(...page.valueList);
    return all;
}

/** 정규식 특수문자를 이스케이프한다 */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 추출된 필드로 ParsedDocument 구성 */
function buildParsedDocument(
    docType: string,
    extracted: Record<string, string>,
): ParsedDocument {
    const doc: ParsedDocument = { docType };

    switch (docType) {
        case "business_reg":
            doc.businessReg = {
                corpNum: extracted["corp_num"],
                corpName: extracted["corp_name"],
                ceoName: extracted["ceo_name"],
                address: extracted["address"],
                bizType: extracted["biz_type"],
                bizClass: extracted["biz_class"],
                openDate: extracted["open_date"],
            };
            break;
        case "receipt":
            doc.receipt = {
                storeName: extracted["store_name"],
                storeAddr: extracted["store_addr"],
                corpNum: extracted["corp_num"],
                date: extracted["date"],
                totalAmount: extracted["total_amount"],
                paymentType: extracted["payment_type"],
                cardNumber: extracted["card_number"],
            };
            break;
        case "invoice":
            doc.invoice = {
                invoiceNum: extracted["invoice_num"],
                issuerCorpNum: extracted["issuer_corp_num"],
                issuerName: extracted["issuer_name"],
                receiverCorpNum: extracted["receiver_corp_num"],
                receiverName: extracted["receiver_name"],
                writeDate: extracted["write_date"],
                amountTotal: extracted["amount_total"],
                taxTotal: extracted["tax_total"],
                totalAmount: extracted["total_amount"],
            };
            break;
        case "namecard":
            doc.namecard = {
                name: extracted["name"],
                company: extracted["company"],
                department: extracted["department"],
                title: extracted["title"],
                address: extracted["address"],
                website: extracted["website"],
            };
            break;
        case "id_card":
            doc.idCard = {
                name: extracted["name"],
                idNumber: extracted["id_number"],
                issueDate: extracted["issue_date"],
                issuer: extracted["issuer"],
            };
            break;
        case "driver_license":
            doc.driverLicense = {
                name: extracted["name"],
                idNumber: extracted["id_number"],
                licenseNum: extracted["license_num"],
                licenseType: extracted["license_type"],
                issueDate: extracted["issue_date"],
                expiryDate: extracted["expiry_date"],
                issuer: extracted["issuer"],
            };
            break;
        case "facility_card":
            doc.facilityCard = {
                buildingName: extracted["building_name"],
                address: extracted["address"],
                buildingUse: extracted["building_use"],
                structure: extracted["structure"],
                area: extracted["area"],
                floorCount: extracted["floor_count"],
                approvalDate: extracted["approval_date"],
                owner: extracted["owner"],
            };
            break;
        case "career_cert":
            doc.careerCert = {
                name: extracted["name"],
                idNumber: extracted["id_number"],
                company: extracted["company"],
                department: extracted["department"],
                position: extracted["position"],
                joinDate: extracted["join_date"],
                leaveDate: extracted["leave_date"],
                issueDate: extracted["issue_date"],
                issuer: extracted["issuer"],
            };
            break;
    }
    return doc;
}
