/**
 * 본인인증 플러그인 Fastify 플러그인
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadIdentityConfig } from "./config.ts";
import { IdentityService } from "./service.ts";
import { IdentityEntityAdapter } from "./entity-adapter.ts";
import { createClient, type IdentityClient } from "./providers/index.ts";
import { ensurePluginEntities } from "@system/api";

const __dirname = dirname(fileURLToPath(import.meta.url));

declare module "fastify" {
    interface FastifyInstance {
        /** 본인인증 서비스 인스턴스 (disabled 시 null) */
        identityService: IdentityService | null;
    }
}

/** 본인인증 플러그인을 등록한다 */
export default fp(async (app: FastifyInstance) => {
    const cfg = loadIdentityConfig();
    if (!cfg) {
        app.decorate("identityService", null);
        return;
    }

    // entities/account.json 의 identity 필드를 account 엔티티에 additive-sync
    await ensurePluginEntities(__dirname).catch((err) =>
        app.log.warn({ err }, "Identity: entity setup failed, continuing"),
    );

    // 프로바이더 클라이언트 생성
    const clients = new Map<string, IdentityClient>();
    let defaultClient: IdentityClient | null = null;

    for (const [name, providerCfg] of Object.entries(cfg.providers)) {
        const client = createClient(providerCfg);
        clients.set(name, client);
        if (name === cfg.default) {
            defaultClient = client;
        }
    }

    if (!defaultClient) {
        throw new Error(
            `identity: default provider '${cfg.default}' not found`,
        );
    }

    // 서비스 생성
    const service = new IdentityService(cfg, clients, defaultClient);

    // Entity Server 어댑터 연결
    const entityAdapter = new IdentityEntityAdapter();
    service.setQuerier(entityAdapter);

    app.decorate("identityService", service);

    // 만료 토큰 캐시 정리 (5분 주기)
    const cleanupInterval = setInterval(
        () => {
            service.cleanExpiredTokens();
        },
        5 * 60 * 1000,
    );

    app.addHook("onClose", async () => {
        clearInterval(cleanupInterval);
        console.log("Identity plugin stopped");
    });

    console.log(
        `Identity plugin enabled — default: ${cfg.default}, providers: ${Object.keys(cfg.providers).join(", ")}`,
    );
});
