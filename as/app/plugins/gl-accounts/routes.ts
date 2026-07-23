/**
 * 표준 계정과목 라우트 테이블
 * 등록 경로: /v1/gl-accounts/*  (routes loader가 디렉토리명으로 자동 등록)
 */

import type { FastifyInstance } from "fastify";
import * as h from "./handlers.ts";

export default async function glAccountsRoutes(app: FastifyInstance) {
    // 정적 경로(/items*)를 :code 보다 먼저 등록해 파라미터가 가로채지 않게 한다.

    // GET /v1/gl-accounts/items/lookup?q=가계수표
    app.get("/items/lookup", h.handleLookupItem);

    // GET /v1/gl-accounts/items/by-tran?name=검사비(수입시)
    app.get("/items/by-tran", h.handleItemAccounts);

    // GET /v1/gl-accounts/items?account_code=10100&q=...
    app.get("/items", h.handleListItems);

    // GET /v1/gl-accounts?statement=재무상태표&sub_category=자산&level=1&q=현금
    app.get("/", h.handleListAccounts);

    // GET /v1/gl-accounts/10100
    app.get("/:code", h.handleGetAccount);
}
