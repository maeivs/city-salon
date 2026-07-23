/**
 * 2FA (TOTP) 라우트 서브 플러그인
 *
 * index.ts 에서 prefix `/v1/account/2fa` 로 등록된다.
 * 최종 엔드포인트:
 *
 *   POST   /v1/account/2fa/setup                — 2FA 설정 시작 (JWT 필요)
 *   POST   /v1/account/2fa/setup/verify         — 2FA 활성화 확인 (JWT 또는 setup_token)
 *   DELETE /v1/account/2fa                      — 2FA 비활성화 (JWT 필요)
 *   GET    /v1/account/2fa/status               — 2FA 상태 조회 (JWT 필요)
 *   POST   /v1/account/2fa/recovery/regenerate  — 복구 코드 재생성 (JWT 필요)
 *   POST   /v1/account/2fa/verify               — 2단계 TOTP 검증 (two_factor_token)
 *   POST   /v1/account/2fa/recovery             — 복구 코드로 로그인 (two_factor_token)
 *
 * Go `internal/router/auth_routes.go` /v1/auth/2fa/* 포팅
 */

import type { FastifyInstance } from "fastify";
import { loadTwoFactorConfig } from "./config.ts";
import {
    createSetupHandler,
    createSetupVerifyHandler,
    createVerifyHandler,
    createRecoveryHandler,
    createDisableHandler,
    createStatusHandler,
    createRegenerateHandler,
} from "./handlers/index.ts";

export default async function twoFactorRoutes(
    app: FastifyInstance,
): Promise<void> {
    const cfg = loadTwoFactorConfig();

    if (!cfg) {
        return;
    }

    // ── JWT 필요 엔드포인트 ─────────────────────────────────────────────────
    app.post("/setup", createSetupHandler(cfg));
    app.post("/setup/verify", createSetupVerifyHandler(cfg));
    app.delete("/", createDisableHandler(cfg));
    app.get("/status", createStatusHandler(cfg));
    app.post("/recovery/regenerate", createRegenerateHandler(cfg));

    // ── two_factor_token 사용 (JWT 불필요) ─────────────────────────────────
    app.post("/verify", createVerifyHandler(cfg));
    app.post("/recovery", createRecoveryHandler(cfg));
}
