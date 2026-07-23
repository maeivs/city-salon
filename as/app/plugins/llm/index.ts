/**
 * LLM 플러그인 — Fastify 플러그인 엔트리
 *
 * 플러그인 디렉토리의 config.json 에 따라 Service 초기화 + 의존성 주입
 * app.llmService 로 데코레이트하여 라우트에서 사용 가능
 */

import { fileURLToPath } from "url";
import path from "path";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { logger } from "@system/api";
import { ensurePluginEntities } from "@system/api";
import { loadLlmConfig } from "./config.ts";
import { LlmService } from "./service.ts";
import { ConversationEntityAdapter } from "./conversation-store.ts";
import { DocumentEntityAdapter } from "./document-store.ts";
import { UsageEntityAdapter } from "./usage-store.ts";
import { ChatbotEntityAdapter } from "./chatbot-store.ts";
import { ProfileEntityAdapter } from "./profile-store.ts";

declare module "fastify" {
    interface FastifyInstance {
        llmService: LlmService | null;
    }
}

/** LLM 확장모듈 Fastify 플러그인을 등록한다 */
export default fp(
    async (app: FastifyInstance) => {
        const config = loadLlmConfig();

        if (!config) {
            app.decorate("llmService", null);
            return;
        }

        // 필요한 엔티티가 서버에 없으면 자동 생성
        const pluginDir = path.dirname(fileURLToPath(import.meta.url));
        await ensurePluginEntities(pluginDir).catch((err) =>
            logger.warn({ err }, "LLM: entity setup failed, continuing"),
        );

        const service = new LlmService(config);

        // 대화 저장소
        service.convStore = new ConversationEntityAdapter();

        // 챗봇 저장소
        service.chatbotStore = new ChatbotEntityAdapter();

        // Profile Memory 저장소
        service.profileStore = new ProfileEntityAdapter();

        // 사용량 추적
        if (config.usage_tracking) {
            service.usageQuerier = new UsageEntityAdapter();
        }

        // RAG 문서 저장소
        if (config.rag?.enabled) {
            const docStore = new DocumentEntityAdapter(service);
            service.docStore = docStore;

            // 서버 시작 시 인메모리 인덱스 재구성 (비동기)
            docStore.rebuildIndex().catch((err) => {
                logger.warn(
                    { err },
                    "Failed to rebuild RAG index on startup — OK if no documents yet",
                );
            });
        }

        app.decorate("llmService", service);

        app.addHook("onClose", async () => {
            service.close();
            logger.info("LLM service closed");
        });

        logger.info(
            "LLM plugin loaded (%d providers)",
            service.getProviders().size,
        );
    },
    {
        name: "llm-plugin",
        dependencies: [],
    },
);
