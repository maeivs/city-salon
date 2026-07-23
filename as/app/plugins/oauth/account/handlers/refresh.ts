/**
 * POST /v1/account/oauth/refresh/:provider
 *
 * OAuth 프로바이더 access_token을 refresh_token으로 갱신하고
 * account_oauth 레코드를 업데이트한다.
 *
 * Go auth_handler.go HandleOAuthTokenRefresh 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { entityServer, logger, ok, fail } from "@system/api";
import { getAccountSeqFromJwt } from "../../../../routes/email-verify/handlers/utils.ts";
import { refreshProviderToken } from "../../providers/index.ts";

interface OAuthRow {
    seq: number;
    refresh_token?: string;
}

export async function handleOAuthTokenRefresh(
    req: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const accountSeq = getAccountSeqFromJwt(req);
    if (!accountSeq) {
        reply.code(401).send(fail("Not authenticated"));
        return;
    }

    const provider = ((req.params as { provider?: string })?.provider ?? "")
        .trim()
        .toLowerCase();
    if (!provider) {
        reply.code(400).send(fail("provider is required"));
        return;
    }

    // account_oauth에서 refresh_token 조회
    let item: OAuthRow | null = null;
    try {
        const res = await entityServer.list<OAuthRow>("account_oauth", {
            conditions: { account_seq: accountSeq, provider, status: "active" },
            limit: 1,
        });
        item = ((res?.data?.items ?? []) as OAuthRow[])[0] ?? null;
    } catch (err) {
        logger.error({ err }, "OAuthRefresh: list account_oauth failed");
    }

    if (!item) {
        reply.code(404).send(fail("Provider link not found"));
        return;
    }

    const storedRefreshToken = item.refresh_token ?? "";
    if (!storedRefreshToken || storedRefreshToken === "<nil>") {
        reply.code(400).send(fail("No refresh_token stored for this provider"));
        return;
    }

    let newToken;
    try {
        newToken = await refreshProviderToken(provider, storedRefreshToken);
    } catch (err) {
        logger.error({ provider, err }, "OAuthRefresh: token refresh failed");
        reply.code(502).send(fail("Failed to refresh OAuth token"));
        return;
    }

    const updateData: Record<string, unknown> = {
        seq: item.seq,
        access_token: newToken.access_token,
    };
    if (newToken.refresh_token)
        updateData.refresh_token = newToken.refresh_token;

    let tokenExpiresAt = "";
    if (newToken.expires_in) {
        tokenExpiresAt = new Date(
            Date.now() + newToken.expires_in * 1000,
        ).toISOString();
        updateData.token_expires_at = tokenExpiresAt;
    }

    try {
        await entityServer.submit("account_oauth", updateData);
    } catch (err) {
        logger.warn({ err }, "OAuthRefresh: failed to update account_oauth");
    }

    reply.send(ok({ provider, token_expires_at: tokenExpiresAt }));
}
