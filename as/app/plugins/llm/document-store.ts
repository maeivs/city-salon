/**
 * RAG 문서 저장소 — 인메모리 벡터 인덱스 + Entity Server 어댑터
 */

import { entityServer } from "@system/api";
import { logger } from "@system/api";
import { Chunker } from "./chunker.ts";
import type {
    DocumentStore,
    DocumentIngestInput,
    DocumentIngestResult,
    SearchInput,
    SearchResult,
    DocumentSummary,
    DocumentFilter,
    EmbedResponse,
} from "./types/index.ts";

/** LlmService에서 DocumentStore가 사용하는 메서드만 추출한 인터페이스 */
interface LlmServiceLike {
    defaultProviderName(): string;
    embed(
        providerName: string | undefined,
        input: string[],
    ): Promise<EmbedResponse>;
    embedOne(providerName: string | undefined, text: string): Promise<number[]>;
}

// ─── Memory Vector Index ─────────────────────────────────────────────────────

interface VectorChunk {
    documentId: string;
    chunkIndex: number;
    title: string;
    content: string;
    metadata?: Record<string, string>;
    tenantId?: string;
    providerName: string;
    vector: number[];
}

export class MemoryDocumentIndex {
    private chunks: VectorChunk[] = [];

    /** 벡터 청크를 인덱스에 추가한다 */
    add(chunk: VectorChunk): void {
        this.chunks.push(chunk);
    }

    /** 문서 ID로 청크를 삭제한다 */
    deleteByDocumentId(documentId: string): void {
        this.chunks = this.chunks.filter((c) => c.documentId !== documentId);
    }

    /** 쿼리 벡터로 유사 청크를 검색한다 */
    search(
        queryVec: number[],
        topK: number,
        minScore: number,
        tenantId?: string,
        metadata?: Record<string, string>,
    ): SearchResult[] {
        const scored: Array<{ chunk: VectorChunk; score: number }> = [];

        for (const chunk of this.chunks) {
            if (tenantId && chunk.tenantId !== tenantId) continue;
            if (metadata && !matchesMetadata(chunk.metadata, metadata))
                continue;

            const score = cosineSimilarity(queryVec, chunk.vector);
            if (score >= minScore) {
                scored.push({ chunk, score });
            }
        }

        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, topK);

        return top.map((r) => ({
            documentId: r.chunk.documentId,
            chunkIndex: r.chunk.chunkIndex,
            content: r.chunk.content,
            score: r.score,
            title: r.chunk.title,
            metadata: r.chunk.metadata,
        }));
    }

    /** 인덱스를 비운다 */
    clear(): void {
        this.chunks = [];
    }

    /** 인덱스를 교체한다 */
    replaceAll(chunks: VectorChunk[]): void {
        this.chunks = chunks;
    }
}

// ─── Document Entity Adapter ─────────────────────────────────────────────────

export class DocumentEntityAdapter implements DocumentStore {
    private readonly svc: LlmServiceLike;
    private readonly index: MemoryDocumentIndex;

    /** DocumentEntityAdapter 인스턴스를 초기화한다 */
    constructor(svc: LlmServiceLike) {
        this.svc = svc;
        this.index = new MemoryDocumentIndex();
    }

    /** 문서를 청킹·임베딩하여 인제스트한다 */
    async ingestDocument(
        input: DocumentIngestInput,
    ): Promise<DocumentIngestResult> {
        const chunkSize = input.chunkSize || 500;
        const chunkOverlap = input.chunkOverlap || 50;
        const chunker = new Chunker(chunkSize, chunkOverlap);
        const chunks = chunker.chunk(input.content, input.contentType);

        if (chunks.length === 0) {
            throw new Error("No chunks produced from document");
        }

        const providerName =
            input.providerName || this.svc.defaultProviderName();
        const metaJSON = JSON.stringify(input.metadata ?? {});
        let totalTokens = 0;

        for (let i = 0; i < chunks.length; i++) {
            // 임베딩 생성
            const embedResp = await this.svc.embed(providerName, [chunks[i]]);
            totalTokens += embedResp.totalTokens;

            const vector = embedResp.embeddings[0] ?? [];
            const vectorJSON = JSON.stringify(vector);

            // DB 저장
            const data: Record<string, unknown> = {
                document_id: input.documentId,
                chunk_index: i,
                title: input.title,
                content: chunks[i],
                content_type: input.contentType ?? "text/plain",
                vector: vectorJSON,
                vector_dim: vector.length,
                metadata: metaJSON,
                provider_name: providerName,
                token_count: Math.floor(chunks[i].length / 4),
            };
            if (input.tenantId) data.tenant_id = input.tenantId;

            await entityServer.submit("llm_document", data);

            // 인메모리 인덱스에 추가
            this.index.add({
                documentId: input.documentId,
                chunkIndex: i,
                title: input.title,
                content: chunks[i],
                metadata: input.metadata,
                tenantId: input.tenantId,
                providerName,
                vector,
            });
        }

        return {
            documentId: input.documentId,
            chunkCount: chunks.length,
            totalTokens,
        };
    }

    /** 유사 문서를 검색한다 */
    async searchSimilar(input: SearchInput): Promise<SearchResult[]> {
        const provider = input.providerName || this.svc.defaultProviderName();
        const queryVec = await this.svc.embedOne(provider, input.query);

        const topK = input.topK || 5;
        const minScore = input.minScore || 0.7;

        return this.index.search(
            queryVec,
            topK,
            minScore,
            input.tenantId,
            input.metadata,
        );
    }

    /** 문서를 삭제한다 */
    async deleteDocument(documentId: string): Promise<void> {
        // DB에서 해당 문서의 청크 삭제 (소프트 삭제)
        try {
            const resp = await entityServer.list("llm_document", {
                document_id: documentId,
                limit: 1000,
            } as any);
            const rows = (resp.data as any)?.items ?? [];
            for (const row of rows) {
                const seq = Number(row.seq);
                if (seq > 0) {
                    await entityServer.submit("llm_document", {
                        seq,
                        status: "deleted",
                    });
                }
            }
        } catch (err) {
            logger.error(
                { err },
                `Failed to delete document chunks: ${documentId}`,
            );
        }
        this.index.deleteByDocumentId(documentId);
    }

    /** 문서 목록을 조회한다 */
    async listDocuments(filter: DocumentFilter): Promise<DocumentSummary[]> {
        const opts: Record<string, unknown> = {
            chunk_index: 0, // 첫 번째 청크만 조회
            page: Math.floor(filter.offset / Math.max(filter.limit, 1)) + 1,
            limit: filter.limit || 50,
        };
        if (filter.tenantId) opts.tenant_id = filter.tenantId;
        if (filter.contentType) opts.content_type = filter.contentType;

        const resp = await entityServer.list("llm_document", opts);
        const rows = (resp.data as any)?.items ?? [];

        return rows.map((row: Record<string, unknown>) => {
            let meta: Record<string, string> | undefined;
            try {
                if (row.metadata) meta = JSON.parse(String(row.metadata));
            } catch {
                /* empty */
            }

            return {
                documentId: String(row.document_id ?? ""),
                title: String(row.title ?? ""),
                contentType: String(row.content_type ?? ""),
                chunkCount: 0, // 간단화 — 별도 쿼리 필요 시 추후 보강
                metadata: meta,
                createdAt: String(row.created_time ?? ""),
                updatedAt: String(row.updated_time ?? ""),
            };
        });
    }

    /** DB에서 인메모리 인덱스를 재구축한다 */
    async rebuildIndex(): Promise<void> {
        const resp = await entityServer.list("llm_document", { limit: 100000 });
        const rows = (resp.data as any)?.items ?? [];

        const newChunks: VectorChunk[] = [];
        for (const row of rows) {
            let vec: number[] = [];
            let meta: Record<string, string> | undefined;
            try {
                if (row.vector) vec = JSON.parse(String(row.vector));
            } catch {
                /* empty */
            }
            try {
                if (row.metadata) meta = JSON.parse(String(row.metadata));
            } catch {
                /* empty */
            }

            newChunks.push({
                documentId: String(row.document_id ?? ""),
                chunkIndex: Number(row.chunk_index ?? 0),
                title: String(row.title ?? ""),
                content: String(row.content ?? ""),
                metadata: meta,
                tenantId: String(row.tenant_id ?? ""),
                providerName: String(row.provider_name ?? ""),
                vector: vec,
            });
        }

        this.index.replaceAll(newChunks);
        logger.info(`RAG index rebuilt: ${newChunks.length} chunks`);
    }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/** 코사인 유사도를 계산한다 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** 메타데이터 필터 일치 여부를 확인한다 */
function matchesMetadata(
    chunkMeta: Record<string, string> | undefined,
    filterMeta: Record<string, string>,
): boolean {
    if (!chunkMeta) return false;
    for (const [k, v] of Object.entries(filterMeta)) {
        if (chunkMeta[k] !== v) return false;
    }
    return true;
}
