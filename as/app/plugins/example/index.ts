/**
 * example 플러그인 Fastify 플러그인
 *
 * 설정 로드 → 엔티티 자동 등록 → 서비스 초기화 → app 데코레이터 등록 → graceful shutdown
 *
 * 새 플러그인을 만들 때 이 파일을 복사해서 시작하세요:
 *  1. example → 모듈명으로 전체 교체
 *  2. types/config.ts에 Config 인터페이스 정의
 *  3. 플러그인 디렉토리에 config.json 작성 (enabled, minify 포함)
 *  4. entities/*.json 에 플러그인이 사용하는 엔티티 설정 파일 추가
 *  5. service.ts에 비즈니스 로직 구현
 *  6. entity-adapter.ts에 Entity Server 연동 구현
 *  7. handlers.ts에 HTTP 핸들러 작성
 *  8. routes.ts에 라우트 테이블 선언
 *  9. 필요하면 declare module 블록으로 app 데코레이터 타입 추가
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadExampleConfig } from "./config.ts";
import { ExampleService } from "./service.ts";
import { ensurePluginEntities } from "@system/api";

const __dirname = dirname(fileURLToPath(import.meta.url));

// app.exampleService 타입을 Fastify 인스턴스에 추가한다.
// 라우트 핸들러에서 app.exampleService로 접근 가능해진다.
declare module "fastify" {
    interface FastifyInstance {
        exampleService: ExampleService | null;
    }
}

export default fp(
    async (app: FastifyInstance) => {
        const config = loadExampleConfig();

        if (!config) {
            app.decorate("exampleService", null);
            return;
        }

        // entities/ 폴더의 엔티티 JSON을 Go 엔티티 서버에 자동 등록
        // 이미 존재하는 엔티티는 스킵됨 (already_exists)
        await ensurePluginEntities(__dirname).catch((err) =>
            app.log.warn({ err }, "Example: entity setup failed, continuing"),
        );

        const service = new ExampleService(config);

        await service.start();

        app.decorate("exampleService", service);

        // graceful shutdown
        app.addHook("onClose", async () => {
            service.stop();
        });
    },
    { name: "example-plugin" },
);
