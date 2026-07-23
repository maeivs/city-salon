/**
 * 표준 계정과목 플러그인
 *
 * 정적 참조 데이터 플러그인입니다. 외부 동기화 없이 entities/ 의 기본값만 적재하고
 * 조회 API(routes.ts)를 제공합니다.
 *
 * 엔티티:
 *  - gl_accounts       : 계정과목 마스터 (재무상태표·손익계산서)
 *  - gl_account_items  : 거래항목별 계정과목 매핑 (가나다순)
 *
 * 엔티티 등록·기본값 병합은 부팅 시 batchEnsureAllPluginEntities 가 entities/ 폴더를
 * 자동 스캔해 처리하므로(reset_defaults 사이드카 포함), 여기서는 명시적 등록만 보강한다.
 * 라우트는 routes loader 가 routes.ts 를 /v1/gl-accounts/* 로 자동 등록한다.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePluginEntities } from "@system/api";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default fp(
    async (app: FastifyInstance) => {
        // entities/*.json 을 엔티티 서버에 등록한다. 이미 batch 로더가 처리했다면
        // already_exists 로 스킵되므로 중복 호출은 안전하다.
        await ensurePluginEntities(__dirname).catch((err) =>
            app.log.warn(
                { err },
                "gl-accounts: entity setup failed, continuing",
            ),
        );
    },
    { name: "gl-accounts-plugin" },
);
