/**
 * app 레이어 Fastify 타입 확장.
 *
 * 배포 프로젝트는 system.js / system-api.js만 포함하므로,
 * app 코드가 req.user를 인식하도록 app 쪽 선언 파일을 별도로 둔다.
 */

import type { Kysely } from "kysely";
import type { AccountInfo, CacheStore, JwtUserInfo } from "@system/api";

declare module "fastify" {
    interface FastifyRequest {
        account: AccountInfo | null;
        user: JwtUserInfo | null;
        rawBody?: Buffer;
        _packetKey?: Buffer;
    }

    interface FastifyInstance {
        db: Kysely<any> | null;
        dbGroups: Record<string, Kysely<any>>;
        authRequired: (
            req: import("fastify").FastifyRequest,
            reply: import("fastify").FastifyReply,
        ) => Promise<void>;
        ocrService: unknown;
        identityService: unknown;
        cache: CacheStore;
        vesselKrService: unknown;
        kobcFreightService: unknown;
        aisService: unknown;
    }
}
