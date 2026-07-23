import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePluginEntities } from "@system/api";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Web Push 플러그인 기동 시 엔티티 설정을 ES에 보장 등록한다. */
export default fp(
    async (app: FastifyInstance): Promise<void> => {
        await ensurePluginEntities(__dirname).catch((err) =>
            app.log.warn({ err }, "web-push: entity setup failed, continuing"),
        );
    },
    { name: "web-push-plugin" },
);
