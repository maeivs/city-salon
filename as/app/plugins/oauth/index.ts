/**
 * OAuth 플러그인
 *
 * 두 가지 라우트 트리를 등록한다:
 *   1. /v1/oauth/:provider          → 소셜 로그인 (redirect + callback)
 *   2. /v1/account/oauth/*          → 계정 OAuth 연동 관리 (link/unlink/providers/refresh)
 *
 * 플러그인 config.json 의 enabled: true 일 때만 활성화된다.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isOAuthEnabled } from "./config.ts";
import {
    ensurePluginEntities,
    registerWithdrawHook,
    entityServer,
} from "@system/api";
import { oauthLoginRoutes, accountOAuthRoutes } from "./routes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function isPluginEnabled(): boolean {
    try {
        const raw = readFileSync(join(__dirname, "config.json"), "utf-8");
        return JSON.parse(raw)?.enabled === true;
    } catch {
        return false;
    }
}

export default fp(
    async (app: FastifyInstance) => {
        if (!isPluginEnabled()) {
            app.log.info("OAuth plugin: disabled (config.json enabled=false)");
            return;
        }

        if (!isOAuthEnabled()) {
            app.log.info("OAuth plugin: disabled (config.json enabled=false)");
            return;
        }

        // entities/ 폴더의 엔티티 JSON을 Go 엔티티 서버에 자동 등록
        await ensurePluginEntities(__dirname).catch((err) =>
            app.log.warn({ err }, "OAuth: entity setup failed, continuing"),
        );

        // 탈퇴 시 account_oauth 레코드 삭제
        registerWithdrawHook("oauth", async (accountSeq) => {
            const res = await entityServer.list<{ seq: number }>(
                "account_oauth",
                {
                    conditions: { account_seq: accountSeq },
                },
            );
            const items = (res?.data?.items ?? []) as { seq: number }[];
            await Promise.all(
                items.map((item) =>
                    entityServer.delete("account_oauth", item.seq),
                ),
            );
        });

        await app.register(oauthLoginRoutes, { prefix: "/v1/oauth" });
        await app.register(accountOAuthRoutes, {
            prefix: "/v1/account/oauth",
        });
    },
    { name: "oauth-plugin" },
);
