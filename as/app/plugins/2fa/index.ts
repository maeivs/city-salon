/**
 * 2FA (TOTP) 플러그인
 *
 * config.json enabled: true 이면 account 엔티티에 totp_* 필드를 additive-sync 한 뒤
 * /v1/account/2fa/* 라우트를 등록한다.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    ensurePluginEntities,
    registerWithdrawHook,
    entityServer,
} from "@system/api";
import { loadTwoFactorConfig } from "./config.ts";
import twoFactorRoutes from "./routes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default fp(
    async (app: FastifyInstance) => {
        if (!loadTwoFactorConfig()) {
            app.log.info("2FA plugin: disabled (config.json enabled=false)");
            return;
        }

        // entities/account.json 의 totp 필드를 account 엔티티에 additive-sync
        await ensurePluginEntities(__dirname).catch((err) =>
            app.log.warn({ err }, "2FA: entity setup failed, continuing"),
        );

        // 탈퇴 시 totp 필드 초기화 (account 컬럼 방식이므로 별도 테이블 없음)
        registerWithdrawHook("2fa", async (accountSeq) => {
            await entityServer.submit("account", {
                seq: accountSeq,
                totp_secret: null,
                totp_enabled: false,
                totp_enabled_time: null,
                totp_recovery_codes: null,
                totp_failed_attempts: 0,
                totp_locked_until: null,
            });
        });

        await app.register(twoFactorRoutes, { prefix: "/v1/account/2fa" });
    },
    { name: "2fa-plugin" },
);
