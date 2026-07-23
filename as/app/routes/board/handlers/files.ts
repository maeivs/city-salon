import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, cache } from "@system/api";

interface MultipartFileData {
    filename?: string;
    mimetype?: string;
    toBuffer(): Promise<Buffer>;
}

interface EntityServerWithFormRequest {
    requestForm<T>(method: string, path: string, form: FormData): Promise<T>;
}

function resolveAccountSeq(item: Record<string, unknown>): number | null {
    const accountSeq = Number(item.account_seq);
    return Number.isInteger(accountSeq) && accountSeq > 0 ? accountSeq : null;
}

/** 게시글 첨부 multipart 파일을 ES 파일 업로드 FormData로 변환한다. */
async function uploadBoardPostFileToEntityServer(
    postSeq: number,
    data: MultipartFileData,
) {
    const buffer = await data.toBuffer();
    const form = new FormData();
    const filename = data.filename || "upload";
    const mimetype = data.mimetype || "application/octet-stream";
    const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });

    form.append("file", blob, filename);
    form.append("entity_seq", String(postSeq));
    form.append("field_name", "files");

    return (entityServer as unknown as EntityServerWithFormRequest).requestForm(
        "POST",
        "/v1/files/board_post/upload",
        form,
    );
}

// ── 파일 목록 ────────────────────────────────────────────────────────────────

/** 게시글에 연결된 첨부파일 목록을 조회한다. */
export async function list(
    req: FastifyRequest<{ Params: { postSeq: string } }>,
    reply: FastifyReply,
) {
    const postSeq = Number(req.params.postSeq);

    const post = await entityServer.find("board_post", { seq: postSeq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const resp = await entityServer.fileList("board_post", { refSeq: postSeq });
    return reply.send(ok(resp.data));
}

// ── 파일 업로드 ──────────────────────────────────────────────────────────────

/** 작성자 또는 관리자가 게시글 첨부파일을 업로드하고 file_count를 갱신한다. */
export async function upload(
    req: FastifyRequest<{ Params: { postSeq: string } }>,
    reply: FastifyReply,
) {
    const postSeq = Number(req.params.postSeq);
    const account = req.account!;
    const userSeq = account.seq;

    const post = await entityServer.find("board_post", { seq: postSeq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const item = post.data as Record<string, unknown>;
    if (resolveAccountSeq(item) !== userSeq && !account.is_admin)
        return reply.code(403).send(fail("파일 업로드 권한이 없습니다."));

    // multipart/form-data 파일 처리
    const data = await (
        req as unknown as { file(): Promise<MultipartFileData | undefined> }
    ).file();
    if (!data) return reply.code(400).send(fail("파일이 없습니다."));

    const resp = await uploadBoardPostFileToEntityServer(postSeq, data);

    // file_count 캐시 갱신
    const currentCount = (item.file_count as number) ?? 0;
    await entityServer.submit("board_post", {
        seq: postSeq,
        file_count: currentCount + 1,
    });

    return reply.code(201).send(ok(resp));
}

// ── 파일 다운로드/뷰 ─────────────────────────────────────────────────────────

/** ES 파일 엔드포인트로 리다이렉트해 첨부파일을 내려준다. */
export async function view(
    req: FastifyRequest<{ Params: { uuid: string } }>,
    reply: FastifyReply,
) {
    const { uuid } = req.params;
    const entityServerBaseUrl = (
        entityServer as unknown as Record<string, unknown>
    ).baseUrl as string;
    return reply.redirect(`${entityServerBaseUrl}/v1/files/${uuid}`);
}

// ── 파일 삭제 ────────────────────────────────────────────────────────────────

/** 작성자 또는 관리자가 첨부파일을 삭제하고 file_count를 감소시킨다. */
export async function remove(
    req: FastifyRequest<{ Params: { uuid: string } }>,
    reply: FastifyReply,
) {
    const { uuid } = req.params;
    const account = req.account!;
    const userSeq = account.seq;

    // 파일 메타에서 게시글 seq 확인
    const fileMeta = await entityServer.fileMeta("board_post", uuid);
    if (!fileMeta.data)
        return reply.code(404).send(fail("파일을 찾을 수 없습니다."));

    const fileMetaItem = fileMeta.data as unknown as Record<string, unknown>;
    const postSeq = Number(fileMetaItem.entity_seq);
    const post = await entityServer.find("board_post", { seq: postSeq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const item = post.data as Record<string, unknown>;
    if (resolveAccountSeq(item) !== userSeq && !account.is_admin)
        return reply.code(403).send(fail("파일 삭제 권한이 없습니다."));

    await entityServer.fileDelete("board_post", uuid);

    const currentCount = Math.max(0, ((item.file_count as number) ?? 1) - 1);
    await entityServer.submit("board_post", {
        seq: postSeq,
        file_count: currentCount,
    });

    // 파일 삭제는 ES 파일 핸들러 경로를 타므로 board_post 단건 캐시를 명시적으로 비운다.
    await cache().del(`entity_get:board_post:${postSeq}`);

    return reply.send(ok(null));
}
