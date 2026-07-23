/**
 * OcrEntityAdapter — Entity Server를 통한 OCR 결과/사용량 영속화
 */

import type {
    OcrEntityStore,
    OcrResultRecord,
    OcrResult,
    OcrResultFilter,
    OcrUsageRecord,
} from "./types/index.ts";
import { OcrError, ERR_RESULT_NOT_FOUND } from "./errors.ts";

interface EntityServerClient {
    submit(
        entity: string,
        data: unknown,
    ): Promise<{ ok: boolean; seq?: number }>;
    get<T>(
        entity: string,
        seq: number | string,
    ): Promise<{ ok: boolean; data: T }>;
    list(
        entity: string,
        params: unknown,
    ): Promise<{ ok: boolean; data: unknown }>;
    delete(entity: string, seq: number | string): Promise<{ ok: boolean }>;
}

export class OcrEntityAdapter implements OcrEntityStore {
    /** Entity Server 클라이언트로 어댑터를 초기화한다 */
    constructor(private readonly es: EntityServerClient) {}

    /** OCR 결과 레코드를 생성한다 */
    async createResult(record: OcrResultRecord): Promise<string> {
        const resp = await this.es.submit("ocr_result", {
            ocr_id: record.ocrId,
            file_seq: record.fileSeq ?? 0,
            file_hash: record.fileHash,
            provider: record.provider,
            doc_type: record.docType,
            state: record.state,
            ref_table: record.refTable ?? "",
            ref_seq: record.refSeq ?? 0,
        });
        return record.ocrId; // ocr_id가 PK
    }

    /** OCR 결과 상태를 갱신한다 */
    async updateResultState(
        id: string,
        state: string,
        result: OcrResult | null,
        errMsg: string,
    ): Promise<void> {
        const data: Record<string, unknown> = {
            ocr_id: id,
            state,
            error_message: errMsg,
        };
        if (result?.raw) {
            data.text = result.raw.fullText;
            data.pages = JSON.stringify(result.raw.pages);
            data.confidence = result.raw.confidence;
            data.processing_ms = result.raw.processingMs;
            data.provider_raw = JSON.stringify(result.raw.providerRaw);
        }
        if (result?.parsed) {
            data.parsed = JSON.stringify(result.parsed);
            data.parse_method = result.parseMethod;
        }
        await this.es.submit("ocr_result", data);
    }

    /** OCR 결과를 ID로 조회한다 */
    async getResult(id: string): Promise<OcrResultRecord | null> {
        try {
            const resp = await this.es.list("ocr_result", {
                filter_ocr_id: id,
                limit: 1,
            } as any);
            const items = (resp.data as any)?.items ?? [];
            if (items.length === 0) return null;
            return this.mapResultRecord(items[0]);
        } catch {
            return null;
        }
    }

    /** OCR 결과 목록을 필터 조건으로 조회한다 */
    async listResults(
        filter: OcrResultFilter,
    ): Promise<{ items: OcrResultRecord[]; total: number }> {
        const params: Record<string, unknown> = {
            limit: filter.limit ?? 20,
            offset: filter.offset ?? 0,
        };
        if (filter.provider) params.filter_provider = filter.provider;
        if (filter.docType) params.filter_doc_type = filter.docType;
        if (filter.state) params.filter_state = filter.state;
        if (filter.refTable) params.filter_ref_table = filter.refTable;
        if (filter.refSeq) params.filter_ref_seq = filter.refSeq;

        const resp = await this.es.list("ocr_result", params as any);
        const data = resp.data as any;
        const items = (data?.items ?? []).map((r: any) =>
            this.mapResultRecord(r),
        );
        return { items, total: data?.count ?? items.length };
    }

    /** OCR 결과를 삭제한다 */
    async deleteResult(id: string): Promise<void> {
        // ocr_id로 검색 후 seq 기반 삭제
        const record = await this.getResult(id);
        if (!record)
            throw new OcrError("OCR result not found", ERR_RESULT_NOT_FOUND);
        // seq를 사용해서 삭제 (entity-server는 seq 기반 삭제)
        const resp = await this.es.list("ocr_result", {
            filter_ocr_id: id,
            limit: 1,
        } as any);
        const items = (resp.data as any)?.items ?? [];
        if (items.length > 0 && items[0].seq) {
            await this.es.delete("ocr_result", items[0].seq);
        }
    }

    /** OCR 사용량 카운터를 증가시킨다 */
    async incrementUsage(record: OcrUsageRecord): Promise<void> {
        await this.es.submit("ocr_usage", {
            usage_date: record.usageDate,
            provider: record.provider,
            doc_type: record.docType,
            request_count: record.requestCount,
            page_count: record.pageCount,
        });
    }

    /** 특정 날짜의 일일 사용량을 조회한다 */
    async getDailyQuotaUsage(date: string): Promise<number> {
        try {
            const resp = await this.es.list("ocr_usage", {
                filter_usage_date: date,
                limit: 1000,
            } as any);
            const items = (resp.data as any)?.items ?? [];
            return items.reduce(
                (sum: number, r: any) => sum + (r.request_count ?? 0),
                0,
            );
        } catch {
            return 0;
        }
    }

    /** 특정 월의 월간 사용량을 조회한다 */
    async getMonthlyQuotaUsage(month: string): Promise<number> {
        try {
            const resp = await this.es.list("ocr_usage", {
                filter_usage_date_gte: `${month}-01`,
                filter_usage_date_lte: `${month}-31`,
                limit: 1000,
            } as any);
            const items = (resp.data as any)?.items ?? [];
            return items.reduce(
                (sum: number, r: any) => sum + (r.request_count ?? 0),
                0,
            );
        } catch {
            return 0;
        }
    }

    /** Entity Server 응답을 OcrResultRecord로 변환한다 */
    private mapResultRecord(r: any): OcrResultRecord {
        return {
            ocrId: r.ocr_id ?? "",
            fileSeq: r.file_seq,
            fileHash: r.file_hash ?? "",
            provider: r.provider ?? "",
            docType: r.doc_type ?? "",
            state: r.state ?? "",
            refTable: r.ref_table,
            refSeq: r.ref_seq,
            text: r.text,
            pages: r.pages,
            parsed: r.parsed,
            confidence: r.confidence,
            processingMs: r.processing_ms,
            providerRaw: r.provider_raw,
            errorMessage: r.error_message,
            parseMethod: r.parse_method,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
}
