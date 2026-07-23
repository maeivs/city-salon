import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePluginEntities, logger } from "@system/api";
import * as handlers from "./handlers.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h = (fn: any): RouteHandlerMethod => fn;

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Web Push 라우트를 등록한다. */
export default async function webPushRoutes(
    app: FastifyInstance,
): Promise<void> {
    await ensurePluginEntities(__dirname).catch((err) =>
        logger.warn({ err }, "web-push: ensureEntities failed"),
    );

    const auth = { preHandler: app.authRequired.bind(app) };
    app.get("/vapid-public-key", auth, h(handlers.getVapidPublicKey));
    app.post("/subscriptions", auth, h(handlers.saveSubscription));
    app.delete("/subscriptions", auth, h(handlers.deleteSubscription));
}
