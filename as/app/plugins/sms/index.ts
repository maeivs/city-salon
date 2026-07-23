/**
 * SMS Fastify 플러그인
 *
 * 설정 로드 → 프로바이더 클라이언트 생성 → Entity Adapter 주입 →
 * SmsService 시작 → app.smsService 데코레이터 등록
 *
 * Go 엔티티서버 `internal/sms/` + `cmd/setup.go`에서 포팅
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadSmsConfig } from "./config.ts";
import { createSmsClient } from "./providers/index.ts";
import { SmsService } from "./service.ts";
import {
    SmsEntityAdapter,
    SmsVerificationEntityAdapter,
} from "./entity-adapter.ts";
import { VerificationService } from "./verification.ts";
import { initHandlers } from "./handlers.ts";
import type { SmsClient } from "./types/index.ts";

declare module "fastify" {
    interface FastifyInstance {
        smsService: SmsService | null;
    }
}

/** SMS 플러그인을 등록한다 */
export default fp(
    async (app: FastifyInstance) => {
        const config = loadSmsConfig();

        if (!config) {
            app.decorate("smsService", null);
            return;
        }

        // 프로바이더 클라이언트 생성
        const clients = new Map<string, SmsClient>();
        for (const [name, provCfg] of Object.entries(config.providers ?? {})) {
            try {
                const client = createSmsClient(provCfg);
                clients.set(name, client);
                app.log.info(
                    `SMS provider registered: ${name} (${provCfg.driver})`,
                );
            } catch (err) {
                app.log.error(
                    err,
                    `Failed to create SMS provider: ${name} (${provCfg.driver})`,
                );
            }
        }

        if (clients.size === 0) {
            app.log.warn(
                "SMS: no valid providers configured, service disabled",
            );
            app.decorate("smsService", null);
            return;
        }

        const service = new SmsService(config, clients);

        // Entity Adapter 주입
        service.setQuerier(new SmsEntityAdapter(config.max_retries));

        // 인증번호 서비스 초기화
        let verificationSvc: VerificationService | null = null;
        if (config.verification) {
            verificationSvc = new VerificationService(
                service,
                new SmsVerificationEntityAdapter(),
                config.verification,
            );
        }

        // 핸들러에 서비스 주입
        initHandlers(service, verificationSvc);

        // 서비스 시작 (dispatch loop)
        await service.start();

        app.decorate("smsService", service);

        // graceful shutdown
        app.addHook("onClose", async () => {
            await service.stop();
        });
    },
    { name: "sms-plugin" },
);
