/**
 * 계정 생체인증(Biometric) 라우트 서브 플러그인
 *
 * `routes/account/routes.ts`에서 prefix `/biometric`으로 등록된다.
 * 최종 엔드포인트:
 *   GET    /v1/account/biometric
 *   POST   /v1/account/biometric
 *   DELETE /v1/account/biometric/:seq
 *
 * JWT 인증이 필요한 보호 라우트.
 */

import type { FastifyInstance } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePluginEntities, logger } from "@system/api";
import {
    handleListBiometrics,
    handleRegisterBiometric,
    handleDeleteBiometric,
} from "./handlers.ts";

interface RegisterBiometricBody {
    bio_id?: string;
    device_id?: string;
    public_key?: string;
    label?: string;
}

interface DeleteBiometricParams {
    seq: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function biometricPlugin(
    app: FastifyInstance,
): Promise<void> {
    await ensurePluginEntities(__dirname).catch((err) =>
        logger.warn({ err }, "account/biometric: ensureEntities failed"),
    );

    const auth = { preHandler: [app.authRequired] };

    app.get("/", auth, handleListBiometrics);
    app.post<{ Body: RegisterBiometricBody }>(
        "/",
        auth,
        handleRegisterBiometric,
    );
    app.delete<{ Params: DeleteBiometricParams }>(
        "/:seq",
        auth,
        handleDeleteBiometric,
    );
}
