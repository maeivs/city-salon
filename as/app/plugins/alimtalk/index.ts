/**
 * 알림톡 / 친구톡 Fastify 플러그인
 *
 * 설정 로드 → 프로바이더 클라이언트 생성 → Entity Adapter 주입 →
 * AlimtalkService 시작 → app.alimtalkService 데코레이터 등록
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadAlimtalkConfig } from "./config.ts";
import { createAlimtalkClient } from "./providers/index.ts";
import { AlimtalkService } from "./service.ts";
import { AlimtalkEntityAdapter } from "./entity-adapter.ts";
import { FriendTalkEntityAdapter } from "../friendtalk/entity-adapter.ts";
import type { AlimtalkClient } from "./types/index.ts";

declare module "fastify" {
    interface FastifyInstance {
        alimtalkService: AlimtalkService | null;
    }
}

/** 알림톡 플러그인을 등록한다 */
export default fp(
    async (app: FastifyInstance) => {
        const config = loadAlimtalkConfig();

        if (!config) {
            app.decorate("alimtalkService", null);
            return;
        }

        // 프로바이더 클라이언트 생성
        const clients = new Map<string, AlimtalkClient>();
        for (const [name, provCfg] of Object.entries(config.providers ?? {})) {
            try {
                const client = createAlimtalkClient(provCfg);
                clients.set(name, client);
                app.log.info(
                    `Alimtalk provider registered: ${name} (${provCfg.driver})`,
                );
            } catch (err) {
                app.log.error(
                    err,
                    `Failed to create alimtalk provider: ${name} (${provCfg.driver})`,
                );
            }
        }

        if (clients.size === 0) {
            app.log.warn(
                "Alimtalk: no valid providers configured, service disabled",
            );
            app.decorate("alimtalkService", null);
            return;
        }

        const service = new AlimtalkService(config, clients);

        // Entity Adapter 주입
        service.setQuerier(new AlimtalkEntityAdapter(config.max_retries));

        if (config.friendtalk?.enabled) {
            service.setFriendTalkQuerier(
                new FriendTalkEntityAdapter(config.max_retries),
            );
        }

        // 서비스 시작 (dispatch loop)
        await service.start();

        app.decorate("alimtalkService", service);

        // graceful shutdown
        app.addHook("onClose", async () => {
            service.stop();
        });
    },
    { name: "alimtalk-plugin" },
);
