/**
 * 회원 탈퇴(Withdraw) 라우트 서브 플러그인
 *
 * `routes/account/routes.ts`에서 prefix `/withdraw`로 등록된다.
 * 최종 엔드포인트: POST /v1/account/withdraw
 *
 * JWT 인증이 필요한 보호 라우트.
 */

import type { FastifyInstance } from "fastify";
import { handleWithdraw } from "./handlers.ts";

export default async function withdrawPlugin(
    app: FastifyInstance,
): Promise<void> {
    // POST /v1/account/withdraw  (JWT 필요)
    app.post("/", handleWithdraw);
}
