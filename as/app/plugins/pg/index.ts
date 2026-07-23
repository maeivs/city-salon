/**
 * PG 결제 Fastify 플러그인
 *
 * 설정 로드 → PgClient 인스턴스 생성 → Entity Adapter 주입 →
 * PgService 시작 → app.pgService 데코레이터 등록
 */

import { fileURLToPath } from "url";
import path from "path";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { ensurePluginEntities } from "@system/api";
import { loadPgConfig } from "./config.ts";
import { createPgClient } from "./providers/index.ts";
import { PgService, registerClientKey } from "./service.ts";
import { PgEntityAdapter } from "./entity-adapter.ts";
import type { PgClient } from "./types/index.ts";

declare module "fastify" {
    interface FastifyInstance {
        pgService: PgService | null;
    }
}

/** PG 결제 플러그인을 등록한다 */
export default fp(
    async (app: FastifyInstance) => {
        const config = loadPgConfig();

        if (!config) {
            app.log.info("PG plugin disabled in config");
            app.decorate("pgService", null);
            return;
        }

        // 필요한 엔티티가 서버에 없으면 자동 생성
        const pluginDir = path.dirname(fileURLToPath(import.meta.url));
        await ensurePluginEntities(pluginDir).catch((err) =>
            app.log.warn(err, "PG: entity setup failed, continuing"),
        );

        // PgClient 인스턴스 생성
        const clients = new Map<string, PgClient>();

        for (const [name, provCfg] of Object.entries(config.providers)) {
            try {
                const client = createPgClient(provCfg);
                clients.set(name, client);

                // clientKey 글로벌 등록 (getClientConfig에서 사용)
                const publicClientKey =
                    provCfg.client_key ||
                    (provCfg.driver === "kcp" ? provCfg.site_cd : "");
                if (publicClientKey) {
                    registerClientKey(name, publicClientKey);
                }

                app.log.info(
                    `PG provider registered: ${name} (${provCfg.driver})`,
                );
            } catch (err) {
                app.log.error(
                    err,
                    `Failed to create pg provider: ${name} (${provCfg.driver})`,
                );
            }
        }

        if (clients.size === 0) {
            app.log.warn("PG: no valid providers configured, service disabled");
            app.decorate("pgService", null);
            return;
        }

        const service = new PgService({
            clients,
            defaultClient: config.default,
            webhookSecret: config.webhook_secret ?? "",
            amountLimit: config.amount_limit ?? null,
            orderIdPrefix: config.order_id_prefix ?? "ORD",
            successUrl: config.success_url ?? "/payment/success",
            failUrl: config.fail_url ?? "/payment/fail",
            webhookUrl: config.webhook_url ?? "/v1/pg/webhook",
            workers: config.workers ?? 2,
        });

        // Entity Adapter 주입
        service.setQuerier(new PgEntityAdapter());

        // 서비스 시작
        await service.start();

        app.decorate("pgService", service);

        // graceful shutdown
        app.addHook("onClose", async () => {
            service.stop();
        });
    },
    { name: "pg-plugin" },
);
