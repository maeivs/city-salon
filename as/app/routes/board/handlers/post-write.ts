/** 게시글 작성(회원/게스트), 수정, 삭제, 게스트 본인확인 핸들러 */

import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { ok, fail, entityServer, env } from "@system/api";
import {
    resolveAccountSeq,
    resolveLicenseSeq,
} from "../utils/board-helpers.ts";
import { resolveBoardAuthorName } from "../utils/author-name.ts";
import {
    hashPassword,
    verifyPassword,
} from "../../password-reset/password-utils.ts";
import { setPostTags } from "./tags.ts";
import { parseMentions, updateMentions } from "../utils/mention-sync.ts";
import { resolveBoardCategoryByName } from "../utils/board-category.ts";

/** 본문 HTML에서 태그를 제거한 텍스트 길이를 계산한다. */
function calculateBoardPostTextLength(content: unknown): number {
    if (typeof content !== "string") {
        return 0;
    }

    const normalized = content
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .trim();

    return normalized.length;
}

// ── 게시글 작성 (회원/게스트 통합) ───────────────────────────────────────────

/** req.account 유무로 회원/게스트를 구분해 게시글을 생성한다. */
export async function create(
    req: FastifyRequest<{
        Params: { category: string };
        Body: {
            title: string;
            content: string;
            parent_seq?: number;
            pinned?: boolean | string;
            status?: string;
            post_type?: string;
            valid_from?: string;
            valid_to?: string;
            tags?: string[];
            guest_name?: string;
            guest_password?: string;
        };
    }>,
    reply: FastifyReply,
) {
    const { category } = req.params;
    const {
        title,
        content,
        parent_seq,
        pinned,
        status,
        post_type,
        valid_from,
        valid_to,
        tags,
    } = req.body;
    const account = req.account;
    const licenseSeq = Number(account?.license_seq ?? 0);

    const catItem = await resolveBoardCategoryByName(
        category,
        false,
        licenseSeq,
    );
    if (!catItem)
        return reply.code(404).send(fail("카테고리를 찾을 수 없습니다."));

    // 게스트 글쓰기: account 없고 guest_name/password 가 있는 경우
    if (!account) {
        return createAsGuest(req, reply, catItem, category);
    }

    // 회원 글쓰기
    if (isTrueValue(pinned) && !account.is_admin)
        return reply.code(403).send(fail("글 고정은 관리자만 가능합니다."));

    let rootSeq: number | undefined;
    let depth = 0;
    if (parent_seq) {
        const parent = await entityServer.find("board_post", {
            seq: parent_seq,
        });
        if (!parent.data)
            return reply.code(404).send(fail("부모 글을 찾을 수 없습니다."));
        const p = parent.data as Record<string, unknown>;
        rootSeq = (p.root_seq as number) ?? (p.seq as number);
        depth = ((p.depth as number) ?? 0) + 1;
    }

    const isAnonymous = catItem.anonymous_enabled === true;
    const authorName = resolveBoardAuthorName(account.name, isAnonymous);

    if (!authorName)
        return reply.code(400).send(fail("작성자 이름이 설정되지 않았습니다."));

    const validity = normalizeBoardPostValidityRange(valid_from, valid_to);
    if (!validity.ok) {
        return reply.code(400).send(fail(validity.message));
    }

    const resp = await entityServer.submit("board_post", {
        category_name: category,
        account_seq: account.seq,
        author_name: authorName,
        title,
        content,
        text_length: calculateBoardPostTextLength(content),
        post_type: normalizeBoardPostType(post_type, catItem),
        valid_from: validity.validFrom,
        valid_to: validity.validTo,
        status: status || "published",
        parent_seq: parent_seq ?? null,
        root_seq: rootSeq ?? null,
        depth,
        pinned: parent_seq ? false : isTrueValue(pinned),
    });

    if (!parent_seq) {
        await entityServer.submit("board_post", {
            seq: resp.seq,
            root_seq: resp.seq,
        });
    }

    if (tags && tags.length > 0) {
        await setPostTags(resp.seq as number, tags);
    }

    await parseMentions("post", resp.seq as number, content);

    return reply.code(201).send(ok({ seq: resp.seq }));
}

/** 게스트 요청에서 카테고리 허용 여부를 확인하고 게시글을 생성한다. */
async function createAsGuest(
    req: FastifyRequest<{
        Body: {
            title: string;
            content: string;
            guest_name?: string;
            guest_password?: string;
        };
    }>,
    reply: FastifyReply,
    catItem: Record<string, unknown>,
    category: string,
) {
    const { title, content, guest_name, guest_password } = req.body;

    if (catItem.guest_write_enabled !== true)
        return reply
            .code(403)
            .send(fail("이 게시판은 비회원 글작성이 허용되지 않습니다."));

    if (!guest_name || !guest_password)
        return reply
            .code(400)
            .send(fail("비회원은 guest_name, guest_password 가 필요합니다."));

    // 게스트는 X-License-Seq 헤더가 없으므로 직접 주입
    const licenseSeq = resolveLicenseSeq(catItem);
    if (!licenseSeq)
        return reply.code(400).send(fail("license 정보를 찾을 수 없습니다."));

    const hashed = hashPassword(guest_password);

    const resp = await entityServer.submit("board_post", {
        license_seq: licenseSeq,
        category_name: category,
        account_seq: null,
        author_name: guest_name,
        guest_password: hashed,
        title,
        content,
        text_length: calculateBoardPostTextLength(content),
        depth: 0,
    });

    await entityServer.submit("board_post", {
        seq: resp.seq,
        license_seq: licenseSeq,
        root_seq: resp.seq,
    });

    return reply.code(201).send(ok({ seq: resp.seq }));
}

// ── 게시글 수정 ──────────────────────────────────────────────────────────────

/** 작성자 또는 관리자가 게시글 본문, 상태, 태그를 수정한다. */
export async function update(
    req: FastifyRequest<{
        Params: { seq: string };
        Body: {
            title?: string;
            content?: string;
            status?: string;
            pinned?: boolean;
            post_type?: string;
            valid_from?: string;
            valid_to?: string;
            tags?: string[];
        };
    }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const {
        title,
        content,
        status,
        pinned,
        post_type,
        valid_from,
        valid_to,
        tags,
    } = req.body;
    const account = req.account!;

    const post = await entityServer.find("board_post", { seq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const item = post.data as Record<string, unknown>;
    const ownerAccountSeq = resolveAccountSeq(item);

    if (!ownerAccountSeq) {
        if (account.guest_post_seq !== seq)
            return reply.code(403).send(fail("수정 권한이 없습니다."));
    } else if (ownerAccountSeq !== account.seq && !account.is_admin) {
        return reply.code(403).send(fail("수정 권한이 없습니다."));
    }

    if (pinned === true && !account.is_admin) {
        return reply.code(403).send(fail("글 고정은 관리자만 가능합니다."));
    }

    const validity = normalizeBoardPostValidityRange(valid_from, valid_to);
    if (!validity.ok) {
        return reply.code(400).send(fail(validity.message));
    }

    await entityServer.submit("board_post", {
        seq,
        ...(title !== undefined && { title }),
        ...(content !== undefined && {
            content,
            text_length: calculateBoardPostTextLength(content),
        }),
        ...(post_type !== undefined && { post_type }),
        ...(valid_from !== undefined && { valid_from: validity.validFrom }),
        ...(valid_to !== undefined && { valid_to: validity.validTo }),
        ...(pinned !== undefined && {
            pinned: item.parent_seq ? false : pinned === true,
        }),
        ...(status !== undefined && { status }),
    });

    if (tags !== undefined) {
        await setPostTags(seq, tags);
    }

    if (content !== undefined) {
        await updateMentions("post", seq, content);
    }

    return reply.send(ok(null));
}

/** 작성자 또는 관리자가 게시글 유효 종료일을 현재 시각으로 설정한다. */
export async function expire(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const account = req.account!;

    const post = await entityServer.find("board_post", { seq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const item = post.data as Record<string, unknown>;
    const ownerAccountSeq = resolveAccountSeq(item);

    if (!ownerAccountSeq) {
        if (account.guest_post_seq !== seq)
            return reply.code(403).send(fail("종료 권한이 없습니다."));
    } else if (ownerAccountSeq !== account.seq && !account.is_admin) {
        return reply.code(403).send(fail("종료 권한이 없습니다."));
    }

    const validTo = formatCurrentBoardPostDateTime();
    await entityServer.submit("board_post", {
        seq,
        category_name: item.category_name,
        account_seq: item.account_seq ?? null,
        author_name: item.author_name,
        title: item.title,
        content: item.content ?? "",
        text_length:
            item.text_length ?? calculateBoardPostTextLength(item.content),
        post_type: item.post_type ?? null,
        valid_from: item.valid_from ?? null,
        valid_to: validTo,
        status: item.status === "draft" ? "draft" : "published",
        pinned: isTrueValue(item.pinned),
        parent_seq: item.parent_seq ?? null,
        root_seq: item.root_seq ?? seq,
        depth: item.depth ?? 0,
        like_count: item.like_count ?? 0,
        reply_count: item.reply_count ?? 0,
        comment_count: item.comment_count ?? 0,
        file_count: item.file_count ?? 0,
        rating_sum: item.rating_sum ?? 0,
        rating_count: item.rating_count ?? 0,
        accepted: item.accepted === true,
    });

    return reply.send(ok({ valid_to: validTo }));
}

/** 현재 게시글 종료 저장용 DB 일시 문자열을 만든다. */
function formatCurrentBoardPostDateTime(): string {
    const now = new Date();
    /** 날짜/시간 숫자를 2자리 문자열로 맞춘다. */
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/** boolean 또는 문자열 입력을 true 여부로 정규화한다. */
function isTrueValue(value: unknown): boolean {
    return value === true || value === "true" || value === "1";
}

type BoardPostValidityRange =
    | {
          ok: true;
          validFrom: string | null;
          validTo: string | null;
      }
    | {
          ok: false;
          message: string;
          validFrom: string | null;
          validTo: string | null;
      };

/** 게시판별 허용된 글 분류 값만 저장한다. */
function normalizeBoardPostType(
    value: unknown,
    catItem: Record<string, unknown>,
): string | null {
    const postType = String(value ?? "").trim();
    if (!postType) {
        return null;
    }

    const options = Array.isArray(catItem.post_type_options)
        ? catItem.post_type_options
        : [];
    if (options.length === 0) {
        return postType;
    }

    return options.some((option) => String(option ?? "") === postType)
        ? postType
        : null;
}

/** 작성 폼의 날짜 입력을 ES datetime 값으로 정규화한다. */
function normalizeBoardPostDateTime(
    value: unknown,
    boundary: "start" | "end",
): string | null {
    const dateTime = String(value ?? "").trim();
    if (!dateTime) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTime)) {
        return `${dateTime} ${boundary === "start" ? "00:00:00" : "23:59:59"}`;
    }

    const isoDateTimeMatch = dateTime.match(
        /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    );
    if (isoDateTimeMatch) {
        const [, datePart, timePart, secondsPart] = isoDateTimeMatch;
        return `${datePart} ${timePart}:${secondsPart ?? "00"}`;
    }

    return dateTime;
}

/** 작성 폼의 유효기간 범위를 정규화하고 순서를 검증한다. */
function normalizeBoardPostValidityRange(
    validFrom: unknown,
    validTo: unknown,
): BoardPostValidityRange {
    const normalizedValidFrom = normalizeBoardPostDateTime(validFrom, "start");
    const normalizedValidTo = normalizeBoardPostDateTime(validTo, "end");

    if (
        normalizedValidFrom &&
        normalizedValidTo &&
        normalizedValidFrom > normalizedValidTo
    ) {
        return {
            ok: false,
            message: "유효 종료일은 유효 시작일보다 빠를 수 없습니다.",
            validFrom: normalizedValidFrom,
            validTo: normalizedValidTo,
        };
    }

    return {
        ok: true,
        validFrom: normalizedValidFrom,
        validTo: normalizedValidTo,
    };
}

// ── 게시글 삭제 ──────────────────────────────────────────────────────────────

/** 작성자 또는 관리자가 게시글을 soft delete 처리한다. */
export async function remove(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const account = req.account!;

    const post = await entityServer.find("board_post", { seq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const item = post.data as Record<string, unknown>;
    const ownerAccountSeq = resolveAccountSeq(item);

    if (!ownerAccountSeq) {
        if (account.guest_post_seq !== seq)
            return reply.code(403).send(fail("삭제 권한이 없습니다."));
    } else if (ownerAccountSeq !== account.seq && !account.is_admin) {
        return reply.code(403).send(fail("삭제 권한이 없습니다."));
    }

    await entityServer.submit("board_post", { seq, status: "deleted" });
    return reply.send(ok(null));
}

// ── 게스트 본인확인 ───────────────────────────────────────────────────────────

/** 비회원 게시글 비밀번호를 확인하고 수정용 임시 JWT 를 발급한다. */
export async function guestAuth(
    req: FastifyRequest<{
        Params: { seq: string };
        Body: { guest_password: string };
    }>,
    reply: FastifyReply,
) {
    const seq = Number(req.params.seq);
    const { guest_password } = req.body;

    const post = await entityServer.find("board_post", { seq });
    if (!post.data)
        return reply.code(404).send(fail("게시글을 찾을 수 없습니다."));

    const item = post.data as Record<string, unknown>;
    if (!item.guest_password)
        return reply.code(400).send(fail("비회원 게시글이 아닙니다."));

    const matched = verifyPassword(
        guest_password,
        item.guest_password as string,
    );
    if (!matched)
        return reply.code(401).send(fail("비밀번호가 일치하지 않습니다."));

    const token = jwt.sign({ guest_post_seq: seq }, env.JWT_SECRET, {
        expiresIn: "30m",
    });
    return reply.send(
        ok({
            token,
            note: "이 토큰을 Authorization: Bearer 헤더에 담아 수정/삭제 요청",
        }),
    );
}
