import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadNtsBusinessmanConfig } from "./config.ts";
import { NtsBusinessmanService } from "./service.ts";

declare module "fastify" {
    interface FastifyInstance {
        ntsBusinessmanService: NtsBusinessmanService | null;
    }
}

/** 국세청 사업자등록정보 플러그인을 등록한다. */
export default fp(async (app: FastifyInstance) => {
    const config = loadNtsBusinessmanConfig();
    if (!config) {
        app.decorate("ntsBusinessmanService", null);
        return;
    }

    if (!config.apiKey) {
        app.log.warn("NTS businessman plugin: DATAGOKR_API_KEY is not set");
        app.decorate("ntsBusinessmanService", null);
        return;
    }

    app.decorate("ntsBusinessmanService", new NtsBusinessmanService(config));
});
