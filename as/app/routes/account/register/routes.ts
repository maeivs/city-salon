/**
 * 회원가입(Register) 라우트 서브 플러그인
 *
 * `routes/account/routes.ts`에서 prefix `/register`로 등록된다.
 * 최종 엔드포인트: POST /v1/account/register
 *
 * 가입 후 이메일 인증 발송 또는 환영 메일 발송을 config.json으로 제어한다.
 */

import type { FastifyInstance } from "fastify";
import { loadRegisterConfig } from "./config-loader.ts";
import { createRegisterHandler } from "./handlers.ts";

export default async function registerPlugin(
    app: FastifyInstance,
): Promise<void> {
    const cfg = loadRegisterConfig();

    if (!cfg.enabled) {
        return;
    }

    // POST /v1/account/register
    app.post("/", createRegisterHandler(cfg));
}
