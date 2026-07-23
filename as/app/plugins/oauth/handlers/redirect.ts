/**
 * GET /v1/oauth/:provider
 *
 * OAuth 프로바이더로 리다이렉트
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { logger } from "@system/api";
import { getProvider, buildCallbackUrl } from "../config.ts";
import {
    generateCodeVerifier,
    codeChallenge,
    generateState,
} from "../state.ts";
import { buildAuthUrl } from "../providers/index.ts";

export async function handleOAuthRedirect(
    req: FastifyRequest<{ Params: { provider: string } }>,
    reply: FastifyReply,
): Promise<void> {
    const provider = req.params.provider.toLowerCase();
    const p = getProvider(provider);
    if (!p) {
        reply.code(400).send({
            ok: false,
            error: `Unsupported OAuth provider: ${provider}`,
        });
        return;
    }

    const redirectUri = buildCallbackUrl(provider);
    const needPkce = p.pkce === true;
    const verifier = needPkce ? generateCodeVerifier() : "";
    const challenge = needPkce ? codeChallenge(verifier) : undefined;

    const state = generateState(provider, verifier);

    const url = buildAuthUrl({
        provider,
        redirectUri,
        state,
        codeChallenge: challenge,
    });

    logger.debug({ provider, redirectUri }, "OAuth redirect");
    reply.redirect(url, 302);
}
