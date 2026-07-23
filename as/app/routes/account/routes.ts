/**
 * Account 라우트 플러그인
 *
 * 자동 로더가 `app/routes/account/routes.ts`를 탐색하여
 * prefix `/v1/account` 으로 등록한다.
 *
 * 하위 라우트:
 *   POST /register         → POST /v1/account/register
 *   POST /withdraw         → POST /v1/account/withdraw
 *   POST /change-password  → POST /v1/account/change-password
 *   POST /reactivate       → POST /v1/account/reactivate
 *   *    /biometric/*      → /v1/account/biometric/* (생체인증 등록/조회/삭제)
 *   *    /2fa/*            → /v1/account/2fa/* (2FA TOTP)
 *   *    /oauth/*          → /v1/account/oauth/* (OAuth 연동 관리)
 */

import type { FastifyInstance } from "fastify";
import registerRoutes from "./register/routes.ts";
import withdrawPlugin from "./withdraw/routes.ts";
import changePasswordPlugin from "./change-password/routes.ts";
import reactivatePlugin from "./reactivate/routes.ts";
import biometricPlugin from "./biometric/routes.ts";

export default async function accountRoutes(
    app: FastifyInstance,
): Promise<void> {
    await app.register(registerRoutes, { prefix: "/register" });
    await app.register(withdrawPlugin, { prefix: "/withdraw" });
    await app.register(changePasswordPlugin, { prefix: "/change-password" });
    await app.register(reactivatePlugin, { prefix: "/reactivate" });
    await app.register(biometricPlugin, { prefix: "/biometric" });
    // 2FA → plugins/2fa/index.ts 에서 /v1/account/2fa/* 로 등록
    // OAuth 연동 → plugins/oauth/index.ts 에서 /v1/account/oauth/* 로 등록
}
