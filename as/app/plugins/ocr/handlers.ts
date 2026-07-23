/**
 * OCR 핸들러 구현
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";
import { httpStatusFromError } from "./errors.ts";
import type { RecognizeOptions, OcrResultFilter } from "./types/index.ts";

/** OCR 서비스가 활성화되어 있는지 확인한다 */
const ensureSvc = (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.server.ocrService) {
        reply.status(503).send(fail("OCR plugin not enabled"));
        return null;
    }
    return req.server.ocrService;
};

// ─── 인식 ───

/** OCR 인식을 요청한다 */
export async function recognize(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { data, mimeType } = await readOcrFile(request);
    const body = (request.body ?? {}) as Record<string, any>;
    const opts: RecognizeOptions = {
        mimeType,
        docType: body.doc_type ?? body.docType ?? "",
        languages: body.lang ? [].concat(body.lang) : undefined,
    };

    try {
        const result = await svc.recognize(data, opts);
        return ok(result);
    } catch (err) {
        const status = httpStatusFromError(err);
        return reply
            .status(status)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** 비동기 OCR 인식을 요청한다 */
export async function recognizeAsync(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { data, mimeType } = await readOcrFile(request);
    const body = (request.body ?? {}) as Record<string, any>;
    const opts: RecognizeOptions = {
        mimeType,
        docType: body.doc_type ?? body.docType ?? "",
        languages: body.lang ? [].concat(body.lang) : undefined,
    };

    try {
        const jobId = await svc.recognizeAsync(data, opts);
        return ok({ job_id: jobId });
    } catch (err) {
        const status = httpStatusFromError(err);
        return reply
            .status(status)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** 문서 타입 지정 OCR 인식을 요청한다 */
export async function recognizeByDocType(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { docType } = request.params as { docType: string };
    const { data, mimeType } = await readOcrFile(request);
    const opts: RecognizeOptions = { mimeType, docType };

    try {
        const result = await svc.recognize(data, opts);
        return ok(result);
    } catch (err) {
        const status = httpStatusFromError(err);
        return reply
            .status(status)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

// ─── 결과 조회 ───

/** OCR 결과 목록을 조회한다 */
export async function listResults(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const q = request.query as Record<string, string>;
    const filter: OcrResultFilter = {
        provider: q.provider,
        docType: q.doc_type,
        state: q.state,
        refTable: q.ref_table,
        refSeq: q.ref_seq ? parseInt(q.ref_seq) : undefined,
        limit: parseInt(q.limit ?? "20"),
        offset: parseInt(q.offset ?? "0"),
    };

    try {
        const { items, total } = await svc.listResults(filter);
        return ok({ items, total });
    } catch (err) {
        return reply
            .status(500)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** OCR 결과를 ID로 조회한다 */
export async function getResult(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { id } = request.params as { id: string };
    try {
        const record = await svc.getResult(id);
        if (!record)
            return reply.status(404).send(fail("OCR result not found"));
        return ok(record);
    } catch (err) {
        const status = httpStatusFromError(err);
        return reply
            .status(status)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** OCR 결과의 텍스트만 조회한다 */
export async function getResultText(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { id } = request.params as { id: string };
    try {
        const record = await svc.getResult(id);
        if (!record)
            return reply.status(404).send(fail("OCR result not found"));
        return ok({ text: record.text });
    } catch (err) {
        const status = httpStatusFromError(err);
        return reply
            .status(status)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** OCR 결과를 삭제한다 */
export async function deleteResult(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { id } = request.params as { id: string };
    try {
        await svc.deleteResult(id);
        return ok({ deleted: id });
    } catch (err) {
        const status = httpStatusFromError(err);
        return reply
            .status(status)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

/** OCR 할당량 정보를 반환한다 */
export async function getQuota(request: FastifyRequest, reply: FastifyReply) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    try {
        const status = await svc.getQuotaStatus();
        return ok(status);
    } catch (err) {
        return reply
            .status(500)
            .send(fail(err instanceof Error ? err.message : String(err)));
    }
}

// ─── 파일 읽기 헬퍼 ───

/** 요청에서 OCR 파일 데이터를 읽는다 */
async function readOcrFile(
    request: FastifyRequest,
): Promise<{ data: Buffer; mimeType: string }> {
    const file = await (request as any).file?.();
    if (file) {
        const chunks: Buffer[] = [];
        for await (const chunk of file.file) {
            chunks.push(chunk);
        }
        const data = Buffer.concat(chunks);
        const mimeType = file.mimetype || detectMimeType(data);
        return { data, mimeType };
    }

    const body = request.body;
    if (Buffer.isBuffer(body)) {
        const mimeType =
            request.headers["content-type"] || detectMimeType(body);
        return { data: body, mimeType };
    }

    throw new Error("file required (multipart 'file' field or raw body)");
}

/** 파일 매직 바이트로 MIME 타입을 감지한다 */
function detectMimeType(data: Buffer): string {
    if (data.length < 4) return "application/octet-stream";
    if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
    if (
        data[0] === 0x89 &&
        data[1] === 0x50 &&
        data[2] === 0x4e &&
        data[3] === 0x47
    )
        return "image/png";
    if (
        data[0] === 0x25 &&
        data[1] === 0x50 &&
        data[2] === 0x44 &&
        data[3] === 0x46
    )
        return "application/pdf";
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46)
        return "image/gif";
    return "application/octet-stream";
}
