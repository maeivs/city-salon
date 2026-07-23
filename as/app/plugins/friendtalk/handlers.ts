/**
 * 친구톡 핸들러 구현
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";
import type { AlimtalkButton } from "../alimtalk/types/index.ts";

/** 친구톡 발송 요청을 큐에 등록한다 */
export async function send(req: FastifyRequest, reply: FastifyReply) {
    const svc = req.server.alimtalkService;
    if (!svc)
        return reply.status(503).send(fail("FriendTalk service not available"));

    const body = req.body as Record<string, unknown> | undefined;
    const receiver = String(body?.receiver ?? "");
    const content = String(body?.content ?? "");

    if (!receiver || !content) {
        return reply
            .status(400)
            .send(fail("receiver and content are required"));
    }

    const msgType = String(body?.msg_type ?? "text");

    let isAd = true;
    if (body?.is_ad !== undefined && body?.is_ad !== null) {
        isAd = Boolean(body.is_ad);
    }

    let buttonsJSON = "";
    const buttons = body?.buttons as AlimtalkButton[] | undefined;
    if (buttons?.length) {
        buttonsJSON = JSON.stringify(buttons);
    }

    await svc.enqueueFriendTalkJob({
        provider: String(body?.provider ?? ""),
        msgType,
        receiver,
        content,
        imageUrl: String(body?.image_url ?? ""),
        imageLink: String(body?.image_link ?? ""),
        isAd,
        buttonsJSON,
        carouselJSON: String(body?.carousel_json ?? ""),
        itemsJSON: String(body?.items_json ?? ""),
        header: String(body?.header ?? ""),
        refEntity: "",
        refSeq: 0,
        msgSeq: 0,
    });

    return reply.status(202).send(ok({ message: "friendtalk queued" }));
}
