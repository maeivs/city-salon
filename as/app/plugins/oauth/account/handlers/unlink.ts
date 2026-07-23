/**
 * DELETE /v1/account/oauth/link/:provider
 *
 * 로그인된 계정에서 OAuth 프로바이더 연동을 해제한다.
 * 비밀번호 또는 다른 활성 소셜 연동이 없으면 해제 불가.
 *
 * Go auth_handler.go HandleOAuthUnlink 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { entityServer, logger, ok, fail } from "@system/api";
import { getAccountSeqFromJwt } from "../../../../routes/email-verify/handlers/utils.ts";

interface OAuthRow {
    seq: number;
    provider: string;
    status?: string;
}

interface AccountRow {
    has_password?: boolean | number;
    passwd?: string;
}

export async function handleOAuthUnlink(
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

    // 연동 레코드 확인
    let linkItem: OAuthRow | null = null;
    try {
        const res = await entityServer.list<OAuthRow>("account_oauth", {
            conditions: { account_seq: accountSeq, provider, status: "active" },
            limit: 1,
        });
        const items = (res?.data?.items ?? []) as OAuthRow[];
        linkItem = items[0] ?? null;
    } catch (err) {
        logger.error({ err }, "OAuthUnlink: list account_oauth failed");
    }

    if (!linkItem) {
        reply.code(404).send(fail("Provider link not found"));
        return;
    }

    // 로그인 수단 0개 방지
    try {
        const accountRes = await entityServer.get<AccountRow>(
            "account",
            accountSeq,
        );
        const accountData = accountRes?.data;
        const hasPassword =
            accountData?.has_password === true ||
            accountData?.has_password === 1 ||
            (typeof accountData?.passwd === "string" &&
                accountData.passwd.length > 0);

        if (!hasPassword) {
            const allRes = await entityServer.list<OAuthRow>("account_oauth", {
                conditions: { account_seq: accountSeq, status: "active" },
                limit: 100,
            });
            const allItems = (allRes?.data?.items ?? []) as OAuthRow[];
            const otherLinks = allItems.filter(
                (i) => i.provider !== provider,
            ).length;
            if (otherLinks === 0) {
                reply
                    .code(400)
                    .send(
                        fail(
                            "Cannot unlink: no other login method available. Set a password first.",
                        ),
                    );
                return;
            }
        }
    } catch {
        // account 조회 실패 시에는 해제 허용 (방어적 처리)
    }

    await entityServer.submit("account_oauth", {
        seq: linkItem.seq,
        status: "unlinked",
        unlinked_at: "now()",
    });

    reply.send(ok({ message: "Provider unlinked", provider }));
}
