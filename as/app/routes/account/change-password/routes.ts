/**
 * 비밀번호 변경(Change Password) 라우트 서브 플러그인
 *
 * `routes/account/routes.ts`에서 prefix `/change-password`로 등록된다.
 * 최종 엔드포인트: POST /v1/account/change-password
 *
 * JWT 인증이 필요한 보호 라우트.
 */

import type { FastifyInstance } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import { ensurePluginEntities } from "@system/api";
import { handleChangePassword, type ChangePasswordBody } from "./handlers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function changePasswordPlugin(
    app: FastifyInstance,
): Promise<void> {
    await ensurePluginEntities(__dirname).catch((err) =>
        logger.warn({ err }, "change-password: ensureEntities failed"),
    );

    const auth = { preHandler: [app.authRequired] };

    // POST /v1/account/change-password  (JWT 필요)
    app.post<{ Body: ChangePasswordBody }>("/", auth, handleChangePassword);
}
