/**
 * OAuth 라우트 서브 플러그인
 *
 * index.ts 에서 두 개의 prefix 로 등록된다:
 *   oauthLoginRoutes    → prefix: /v1/oauth
 *   accountOAuthRoutes  → prefix: /v1/account/oauth
 *
 * 소셜 로그인 엔드포인트:
 *   GET  /v1/oauth/:provider            → OAuth 프로바이더 리다이렉트
 *   GET  /v1/oauth/:provider/callback   → 콜백 처리 + JWT 발급
 *   POST /v1/oauth/:provider/callback   → Apple Sign-In 콜백 (POST)
 *
 * Account OAuth 연동 관리 엔드포인트 (JWT 필요):
 *   POST   /v1/account/oauth/link              → 프로바이더 연동
 *   DELETE /v1/account/oauth/link/:provider    → 연동 해제
 *   GET    /v1/account/oauth/providers         → 연동 목록
 *   POST   /v1/account/oauth/refresh/:provider → 토큰 갱신
 */

import type { FastifyInstance } from "fastify";
import { handleOAuthRedirect, handleOAuthCallback } from "./handlers/index.ts";
import {
    handleOAuthLink,
    handleOAuthUnlink,
    handleOAuthProviders,
    handleOAuthTokenRefresh,
} from "./account/handlers/index.ts";

/** 소셜 로그인 라우트 — prefix: /v1/oauth */
export async function oauthLoginRoutes(app: FastifyInstance): Promise<void> {
    app.get("/:provider", handleOAuthRedirect);
    app.get("/:provider/callback", handleOAuthCallback);
    // Apple Sign-In 은 POST 콜백 사용 — Authorization 헤더 없으므로 CSRF skip_paths 에 /v1/oauth 추가 필요
    app.post("/:provider/callback", handleOAuthCallback);
}

/** Account OAuth 연동 관리 라우트 — prefix: /v1/account/oauth */
export async function accountOAuthRoutes(app: FastifyInstance): Promise<void> {
    const auth = app.authRequired.bind(app);

    app.post("/link", { preHandler: auth }, handleOAuthLink);
    app.delete("/link/:provider", { preHandler: auth }, handleOAuthUnlink);
    app.get("/providers", { preHandler: auth }, handleOAuthProviders);
    app.post(
        "/refresh/:provider",
        { preHandler: auth },
        handleOAuthTokenRefresh,
    );
}
