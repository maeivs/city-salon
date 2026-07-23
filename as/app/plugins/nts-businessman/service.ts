import type {
    NtsBusinessmanConfig,
    NtsBusinessmanStatusRequest,
    NtsBusinessmanValidateBusiness,
    NtsBusinessmanValidateRequest,
} from "./types/index.ts";
import { loadTaxInvoiceProviderConfig } from "../taxinvoice/config.ts";
import {
    BAROBILL_CORP_STATE_MAX_ITEMS,
    BarobillCorpStateClient,
    normalizeBarobillCorpState,
} from "../taxinvoice/providers/barobill-corp-state.ts";

const MAX_ITEMS_PER_REQUEST = 100;

export class NtsBusinessmanService {
    constructor(private readonly config: NtsBusinessmanConfig) {}

    /** 사업자등록 상태조회 API를 호출한다. */
    async status(payload: NtsBusinessmanStatusRequest): Promise<unknown> {
        const bNo = this.normalizeBusinessNumbers(payload.b_no);
        this.ensureMaxItems(bNo.length);
        return this.request("status", { b_no: bNo });
    }

    /** 사업자등록 진위확인 API를 호출한다. */
    async validate(payload: NtsBusinessmanValidateRequest): Promise<unknown> {
        const businesses = this.normalizeValidateBusinesses(payload.businesses);
        this.ensureMaxItems(businesses.length);
        return this.request("validate", { businesses });
    }

    /** 바로빌 사업자등록 상태조회 API를 호출한다. */
    async barobillStatus(
        payload: NtsBusinessmanStatusRequest,
    ): Promise<unknown> {
        const bNo = this.normalizeBusinessNumbers(payload.b_no);
        if (bNo.length > BAROBILL_CORP_STATE_MAX_ITEMS) {
            throw new Error(
                `request item count must be ${BAROBILL_CORP_STATE_MAX_ITEMS} or less`,
            );
        }

        const providerConfig = loadTaxInvoiceProviderConfig("barobill");
        if (!providerConfig || providerConfig.driver !== "barobill") {
            throw new Error("taxinvoice barobill provider is not configured");
        }

        const client = new BarobillCorpStateClient(providerConfig);
        const states =
            bNo.length === 1
                ? [await client.getCorpState(bNo[0])]
                : await client.getCorpStates(bNo);

        return {
            provider: "barobill",
            request_cnt: bNo.length,
            data: states.map((state) => normalizeBarobillCorpState(state)),
        };
    }

    /** 사업자등록번호 목록을 API 형식에 맞게 정리한다. */
    private normalizeBusinessNumbers(values: unknown): string[] {
        if (!Array.isArray(values)) {
            throw new Error("b_no must be an array");
        }

        const normalized = values.map((value) =>
            this.normalizeBusinessNumber(value),
        );
        if (normalized.length === 0) {
            throw new Error("b_no must contain at least one business number");
        }
        return normalized;
    }

    /** 진위확인 요청 항목을 API 형식에 맞게 정리한다. */
    private normalizeValidateBusinesses(
        values: unknown,
    ): NtsBusinessmanValidateBusiness[] {
        if (!Array.isArray(values)) {
            throw new Error("businesses must be an array");
        }
        if (values.length === 0) {
            throw new Error("businesses must contain at least one item");
        }

        return values.map((value) => {
            const item = value as Partial<NtsBusinessmanValidateBusiness>;
            const bNo = this.normalizeBusinessNumber(item.b_no);
            const startDt = this.normalizeDate(item.start_dt);
            const ownerName = this.normalizeRequiredText(item.p_nm, "p_nm");

            return {
                b_no: bNo,
                start_dt: startDt,
                p_nm: ownerName,
                ...this.optionalTextFields(item),
            };
        });
    }

    /** 단일 사업자등록번호를 숫자 10자리로 정규화한다. */
    private normalizeBusinessNumber(value: unknown): string {
        const normalized = String(value ?? "").replace(/\D/g, "");
        if (!/^\d{10}$/.test(normalized)) {
            throw new Error("business number must be 10 digits");
        }
        return normalized;
    }

    /** 개업일자를 YYYYMMDD 숫자 8자리로 정규화한다. */
    private normalizeDate(value: unknown): string {
        const normalized = String(value ?? "").replace(/\D/g, "");
        if (!/^\d{8}$/.test(normalized)) {
            throw new Error("start_dt must be 8-digit YYYYMMDD");
        }
        return normalized;
    }

    /** 필수 문자열 값을 검증하고 공백을 정리한다. */
    private normalizeRequiredText(value: unknown, field: string): string {
        const normalized = String(value ?? "").trim();
        if (!normalized) {
            throw new Error(`${field} is required`);
        }
        return normalized;
    }

    /** 선택 문자열 필드를 undefined 없이 API payload로 정리한다. */
    private optionalTextFields(
        item: Partial<NtsBusinessmanValidateBusiness>,
    ): Partial<NtsBusinessmanValidateBusiness> {
        const fields: Array<keyof NtsBusinessmanValidateBusiness> = [
            "p_nm2",
            "b_nm",
            "corp_no",
            "b_sector",
            "b_type",
            "b_adr",
        ];
        const result: Partial<NtsBusinessmanValidateBusiness> = {};

        for (const field of fields) {
            if (item[field] !== undefined) {
                result[field] = String(item[field] ?? "").trim();
            }
        }

        return result;
    }

    /** API 1회 호출 최대 건수를 검증한다. */
    private ensureMaxItems(count: number): void {
        if (count > MAX_ITEMS_PER_REQUEST) {
            throw new Error(
                `request item count must be ${MAX_ITEMS_PER_REQUEST} or less`,
            );
        }
    }

    /** 공공데이터포털 국세청 API에 JSON POST 요청을 보낸다. */
    private async request(
        path: "status" | "validate",
        body: unknown,
    ): Promise<unknown> {
        if (!this.config.apiKey) {
            throw new Error("DATAGOKR_API_KEY is not configured");
        }

        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            this.config.timeoutMs,
        );

        try {
            const url = new URL(
                `${this.config.apiBaseUrl.replace(/\/$/, "")}/${path}`,
            );
            url.searchParams.set("serviceKey", this.config.apiKey);
            url.searchParams.set("returnType", this.config.returnType);

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    accept:
                        this.config.returnType === "XML"
                            ? "application/xml"
                            : "application/json",
                    "content-type": "application/json",
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const text = await response.text();
            const parsed = this.parseResponseBody(text);

            if (!response.ok) {
                const error = new Error("NTS businessman API request failed");
                Object.assign(error, {
                    status: response.status,
                    upstream: parsed,
                });
                throw error;
            }

            return parsed;
        } finally {
            clearTimeout(timeout);
        }
    }

    /** 설정된 반환 형식에 맞춰 API 응답 본문을 해석한다. */
    private parseResponseBody(text: string): unknown {
        if (!text) {
            return null;
        }
        if (this.config.returnType === "XML") {
            return text;
        }
        return JSON.parse(text);
    }
}
