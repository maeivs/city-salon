/**
 * GET /v1/account/oauth/providers
 *
 * 로그인된 계정에 연동된 OAuth 프로바이더 목록 반환
 *
 * Go auth_handler.go HandleOAuthProviders 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { entityServer, logger, ok, fail } from "@system/api";
import { getAccountSeqFromJwt } from "../../../../routes/email-verify/handlers/utils.ts";

interface OAuthRow {
    provider?: string;
    email?: string;
    name?: string;
    profile_image?: string;
    linked_at?: string;
}

export async function handleOAuthProviders(
    req: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const accountSeq = getAccountSeqFromJwt(req);
    if (!accountSeq) {
        reply.code(401).send(fail("Not authenticated"));
        return;
    }

    try {
        const res = await entityServer.list<OAuthRow>("account_oauth", {
            conditions: { account_seq: accountSeq, status: "active" },
            limit: 100,
        });
        const items = (res?.data?.items ?? []) as OAuthRow[];
        const providers = items.map((item) => ({
            provider: item.provider,
            email: item.email,
            name: item.name,
            profile_image: item.profile_image,
            linked_at: item.linked_at,
        }));
        reply.send(ok(providers));
    } catch (err) {
        logger.error({ err }, "OAuthProviders: list failed");
        reply.code(500).send(fail("Failed to query linked providers"));
    }
}
