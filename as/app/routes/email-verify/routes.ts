/**
 * 이메일 인증 라우트 플러그인
 *
 * 자동 로더가 `app/routes/email-verify/routes.ts`를 탐색하여
 * prefix `/v1/email-verify` 으로 등록한다.
 *
 * 엔드포인트:
 *   POST /send              — 인증 코드/링크 발송 (비보호)
 *   POST /confirm           — 코드 검증 (비보호)
 *   GET  /activate          — 링크 클릭 인증 (비보호)
 *   GET  /status            — 인증 상태 조회 (JWT 필요)
 *   POST /change            — 이메일 변경 + 재인증 (JWT 필요)
 */

import type { FastifyInstance } from "fastify";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import { ensurePluginEntities } from "@system/api";
import { loadEmailVerifyConfig } from "./config-loader.ts";
import {
    createSendHandler,
    createConfirmHandler,
    createActivateHandler,
    createStatusHandler,
    createChangeHandler,
} from "./handlers/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const suppressRouteRegisterLog = true;

export default async function emailVerifyRoutes(
    app: FastifyInstance,
): Promise<void> {
    const cfg = loadEmailVerifyConfig();

    if (!cfg.enabled) {
        return;
    }

    await ensurePluginEntities(__dirname).catch((err) =>
        logger.warn({ err }, "email-verify: ensureEntities failed"),
    );

    // 비보호 엔드포인트
    app.post("/send", createSendHandler(cfg));
    app.post("/confirm", createConfirmHandler(cfg));
    app.get("/activate", createActivateHandler(cfg));

    // JWT 필요 엔드포인트
    app.get("/status", createStatusHandler(cfg));
    app.post("/change", createChangeHandler(cfg));
}
