/**
 * Privilege 라우트 플러그인
 *
 * 자동 로더가 `app/routes/privilege/routes.ts`를 탐색하여
 * prefix `/v1/privilege` 으로 등록한다.
 *
 * 엔티티:
 *   - pv_group       — 권한 그룹
 *   - pv_group_item  — 권한 그룹 항목
 *   - pv_item        — 권한 항목
 *   - account_pv_group  — 계정-권한그룹 매핑
 *   - account_pv_item   — 계정-권한항목 매핑
 *
 * 비고: go 서버는 rbac_roles(RBAC) 만 담당하며, 비즈니스 권한(Privilege)은 앱서버에서 관리합니다.
 */

import type { FastifyInstance } from "fastify";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger, ensurePluginEntities } from "@system/api";
import {
    listPrivilegeItems,
    listPrivilegeGroups,
    getAccountPrivileges,
    submitAccountPrivileges,
} from "./handlers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function privilegeRoutes(
    app: FastifyInstance,
): Promise<void> {
    await ensurePluginEntities(__dirname).catch((err) =>
        logger.warn({ err }, "privilege: ensureEntities failed"),
    );

    /** GET /v1/privilege/items — 권한항목 목록 */
    app.get("/items", listPrivilegeItems);

    /** GET /v1/privilege/groups — 권한그룹 목록 */
    app.get("/groups", listPrivilegeGroups);

    /** GET /v1/privilege/account/:account_seq — 계정 권한 조회 */
    app.get("/account/:account_seq", getAccountPrivileges);

    /** POST /v1/privilege/account/:account_seq — 계정 권한 저장 */
    app.post("/account/:account_seq", submitAccountPrivileges);
}
