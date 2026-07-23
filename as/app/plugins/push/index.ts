/**
 * Push 알림 Fastify 플러그인
 *
 * 설정 로드 → 프로바이더 클라이언트 생성 → Entity Adapter 주입 →
 * PushService 시작 → app.pushService 데코레이터 등록
 *
 * Go 엔티티서버 `internal/push/` + `cmd/setup.go` 에서 포팅
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadPushConfig } from "./config.ts";
import { createPushProvider } from "./providers/index.ts";
import { PushService } from "./service.ts";
import { PushEntityAdapter } from "./entity-adapter.ts";
import { initHandlers } from "./handlers.ts";
import type { PushProvider } from "./types/index.ts";
import { registerPushService } from "@system/api";

declare module "fastify" {
    interface FastifyInstance {
        pushService: PushService | null;
    }
}

/** Push 알림 플러그인을 등록한다 */
export default fp(
    async (app: FastifyInstance) => {
        const config = loadPushConfig();

        if (!config) {
            app.decorate("pushService", null);
            return;
        }

        // 프로바이더 클라이언트 생성
        const providers = new Map<string, PushProvider>();
        for (const [name, provCfg] of Object.entries(config.providers ?? {})) {
            try {
                const provider = createPushProvider(provCfg);
                providers.set(name, provider);
                app.log.info(
                    `Push provider registered: ${name} (${provCfg.driver})`,
                );
            } catch (err) {
                app.log.error(
                    err,
                    `Failed to create Push provider: ${name} (${provCfg.driver})`,
                );
            }
        }

        if (providers.size === 0) {
            app.log.warn(
                "Push: no valid providers configured, service disabled",
            );
            app.decorate("pushService", null);
            registerPushService(null);
            return;
        }

        const service = new PushService(config, providers);

        // Entity Adapter 주입
        service.setQuerier(new PushEntityAdapter(config.max_retries));

        // 핸들러에 서비스 주입
        initHandlers(service);

        // 서비스 시작 (dispatch loop)
        await service.start();

        // system/push/sender.ts 에서 사용할 전역 참조 등록
        registerPushService(service);

        app.decorate("pushService", service);

        // graceful shutdown
        app.addHook("onClose", async () => {
            registerPushService(null);
            await service.stop();
        });
    },
    { name: "push-plugin" },
);
