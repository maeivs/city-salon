/**
 * SMTP 플러그인
 *
 * 앱 서버 내 모든 이메일 발송에 사용할 공유 레이아웃을 등록한다.
 * 알파벳 순 플러그인 로드 중 초기화되며, 이후의 모든 renderTemplate 호출에서
 * plugins/smtp/templates/layout.html 을 공통 래퍼로 사용한다.
 *
 * HTTP 라우트는 routes.ts 에서 등록하며, proxy/register.ts 의 패스스루보다
 * 먼저 처리된다 (system/routes/loader.ts → system/proxy/register.ts 순서).
 *
 *  - POST /v1/smtp/send    → 로컬 템플릿 렌더링 후 Go 서버로 발송
 *  - GET  /v1/smtp/status/:seq → Go 서버에 발송 상태 조회
 *
 * routes.ts에 없는 /v1/smtp/* 경로는 Go 서버로 패스스루된다.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setSharedLayout } from "@system/api";
import { logger } from "@system/api";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default fp(
    async (_app: FastifyInstance) => {
        const layoutPath = join(__dirname, "templates", "layout.html");
        setSharedLayout(layoutPath);
        logger.debug({ layout: layoutPath }, "Email shared layout registered");
    },
    { name: "smtp" },
);
