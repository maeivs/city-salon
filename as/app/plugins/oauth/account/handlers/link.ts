/**
 * POST /v1/account/oauth/link
 *
 * 로그인된 계정에 OAuth 프로바이더를 연동한다.
 *
 * Go auth_handler.go HandleOAuthLink 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { entityServer, logger, ok, fail } from "@system/api";
import { getAccountSeqFromJwt } from "../../../../routes/email-verify/handlers/utils.ts";
import { validateState } from "../../state.ts";
import { getProvider, buildCallbackUrl } from "../../config.ts";
import { exchangeCode, getUserInfo } from "../../providers/index.ts";

interface LinkBody {
    provider?: string;
    code?: string;
    state?: string;
    redirect_uri?: string;
}

interface OAuthRow {
    seq: number;
    account_seq: number;
    provider: string;
    provider_id: string;
    status?: string;
}

export async function handleOAuthLink(
    req: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const accountSeq = getAccountSeqFromJwt(req);
    if (!accountSeq) {
        reply.code(401).send(fail("Not authenticated"));
        return;
    }

    const body = (req.body as LinkBody) ?? {};
    const provider = (body.provider ?? "").trim().toLowerCase();
    const code = (body.code ?? "").trim();
    if (!provider || !code) {
        reply.code(400).send(fail("provider and code are required"));
        return;
    }
    if (!getProvider(provider)) {
        reply.code(400).send(fail(`Unsupported OAuth provider: ${provider}`));
        return;
    }

    // state CSRF 검증 (선택)
    if (body.state) {
        try {
            validateState(body.state, provider);
        } catch (err) {
            logger.warn(
                { provider, err },
                "OAuth link: state validation failed",
            );
            reply.code(400).send(fail("Invalid OAuth state"));
            return;
        }
    }

    // 토큰 교환 + 사용자 정보 조회
    let userInfo;
    try {
        const redirectUri = body.redirect_uri || buildCallbackUrl(provider);
        const token = await exchangeCode({ provider, code, redirectUri });
        userInfo = await getUserInfo(provider, token);
    } catch (err) {
        logger.error({ provider, err }, "OAuth link: exchange failed");
        reply.code(500).send(fail("Failed to retrieve OAuth user info"));
        return;
    }

    // 이미 연동된 프로바이더 확인
    let existingItems: OAuthRow[] = [];
    try {
        const existing = await entityServer.list<OAuthRow>("account_oauth", {
            conditions: { account_seq: accountSeq, provider },
            limit: 1,
        });
        existingItems = (existing?.data?.items ?? []) as OAuthRow[];
    } catch {
        // account_oauth 엔티티 없는 환경
    }

    if (existingItems.length > 0) {
        const item = existingItems[0]!;
        if (String(item.status) === "active") {
            reply.code(409).send(fail("Provider already linked"));
            return;
        }
        // unlinked → 재활성화
        const reactivateData: Record<string, unknown> = {
            seq: item.seq,
            provider_id: userInfo.provider_id,
            email: userInfo.email,
            name: userInfo.name,
            profile_image: userInfo.profile_image,
            status: "active",
            linked_at: "now()",
            unlinked_at: null,
        };
        if (userInfo.access_token)
            reactivateData.access_token = userInfo.access_token;
        if (userInfo.refresh_token)
            reactivateData.refresh_token = userInfo.refresh_token;
        if (userInfo.token_expires_at)
            reactivateData.token_expires_at = userInfo.token_expires_at;
        await entityServer.submit("account_oauth", reactivateData);
        reply.send(ok({ message: "Provider re-linked" }));
        return;
    }

    // 다른 계정에 이미 연동된 provider_id 확인
    try {
        const other = await entityServer.list<OAuthRow>("account_oauth", {
            conditions: { provider, provider_id: userInfo.provider_id },
            limit: 1,
        });
        const otherItems = (other?.data?.items ?? []) as OAuthRow[];
        if (otherItems.length > 0) {
            reply
                .code(409)
                .send(
                    fail(
                        "This OAuth account is already linked to another account",
                    ),
                );
            return;
        }
    } catch {
        // ignore
    }

    // 새 연동 레코드 생성
    const linkData: Record<string, unknown> = {
        account_seq: accountSeq,
        provider: userInfo.provider,
        provider_id: userInfo.provider_id,
        email: userInfo.email,
        name: userInfo.name,
        profile_image: userInfo.profile_image,
        status: "active",
        linked_at: "now()",
    };
    if (userInfo.access_token) linkData.access_token = userInfo.access_token;
    if (userInfo.refresh_token) linkData.refresh_token = userInfo.refresh_token;
    if (userInfo.token_expires_at)
        linkData.token_expires_at = userInfo.token_expires_at;

    try {
        await entityServer.submit("account_oauth", linkData);
    } catch (err) {
        logger.error({ err }, "OAuth link: failed to create account_oauth");
        reply.code(500).send(fail("Failed to link provider"));
        return;
    }

    reply.send(ok({ message: "Provider linked", provider }));
}
