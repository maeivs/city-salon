/**
 * OCR 플러그인 Fastify 플러그인
 */

import { fileURLToPath } from "url";
import path from "path";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { ensurePluginEntities } from "@system/api";
import { loadOcrConfig } from "./config.ts";
import { OcrService } from "./service.ts";
import { OcrEntityAdapter } from "./entity-adapter.ts";

declare module "fastify" {
    interface FastifyInstance {
        ocrService: OcrService | null;
    }
}

/** OCR 플러그인을 등록한다 */
export default fp(async (app: FastifyInstance) => {
    const cfg = loadOcrConfig();
    if (!cfg) {
        app.decorate("ocrService", null);
        return;
    }

    // 필요한 엔티티가 서버에 없으면 자동 생성
    const pluginDir = path.dirname(fileURLToPath(import.meta.url));
    await ensurePluginEntities(pluginDir).catch((err) =>
        app.log.warn(err, "OCR: entity setup failed, continuing"),
    );

    // Entity Server 클라이언트 가져오기 (auth 플러그인에서 데코레이션됨)
    const entityServer = (app as any).entityServer ?? null;
    const entityStore = entityServer
        ? new OcrEntityAdapter(entityServer)
        : null;

    // LLM 서비스 연동 (llmService가 있으면 simpleChat 어댑터 생성)
    const llmService = (app as any).llmService ?? null;
    let llmAdapter = null;
    if (llmService && cfg.llmFallback.enabled && cfg.llmFallback.provider) {
        llmAdapter = {
            async simpleChat(
                providerName: string,
                system: string,
                user: string,
            ): Promise<string> {
                return llmService.chat(providerName, system, user);
            },
        };
    }

    const service = new OcrService(cfg, entityStore, llmAdapter, entityServer);
    service.start();

    app.decorate("ocrService", service);

    app.addHook("onClose", async () => {
        service.stop();
        console.log("OCR plugin stopped");
    });

    console.log(
        `OCR plugin enabled — default: ${cfg.default}, providers: ${cfg.providers.map((p) => p.driver).join(", ")}`,
    );
});
