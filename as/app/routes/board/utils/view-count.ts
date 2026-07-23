/** 게시글 조회수 증가 유틸 */

import type { FastifyRequest } from "fastify";
import { entityServer } from "@system/api";

/** updated_time 갱신을 생략하는 submit 옵션 */
const skipUpdatedTimeSubmitOptions = {
    skipUpdatedTime: true,
} as unknown as Parameters<typeof entityServer.submit>[2];

/** 카테고리 조회수 정책에 따라 게시글 조회수를 증가시킨다. */
async function incrementViewCount(
    req: FastifyRequest,
    item: Record<string, unknown>,
    catItem: Record<string, unknown>,
) {
    const mode = (catItem?.view_count_mode as string) || "daily";
    const seq = item.seq as number;

    if (mode === "always") {
        await entityServer.submit(
            "board_post",
            { seq, view_count: (item.view_count as number) + 1 },
            skipUpdatedTimeSubmitOptions,
        );
        return;
    }

    const userOrIp =
        (req.account?.seq as string | undefined) ??
        (req.headers["x-forwarded-for"] as string) ??
        req.ip;
    const key = `view:${seq}:${userOrIp}`;

    const cacheStore = (req.server as unknown as Record<string, unknown>)
        .cache as
        | undefined
        | {
              get: (k: string) => Promise<string | null>;
              set: (k: string, v: string, ttlMs?: number) => Promise<void>;
          };

    if (!cacheStore) {
        await entityServer.submit(
            "board_post",
            { seq, view_count: (item.view_count as number) + 1 },
            skipUpdatedTimeSubmitOptions,
        );
        return;
    }

    const exists = await cacheStore.get(key);
    if (!exists) {
        await entityServer.submit(
            "board_post",
            { seq, view_count: (item.view_count as number) + 1 },
            skipUpdatedTimeSubmitOptions,
        );
        if (mode === "daily") {
            await cacheStore.set(key, "1", 86400 * 1000);
        } else {
            await cacheStore.set(key, "1", 0);
        }
    }
}

/** 조회수 증가 실패가 상세 응답을 막지 않도록 백그라운드로 실행한다. */
export function queueViewCountIncrement(
    req: FastifyRequest,
    item: Record<string, unknown>,
    catItem: Record<string, unknown>,
) {
    void incrementViewCount(req, item, catItem).catch((error: unknown) => {
        req.log.warn(
            { err: error, postSeq: item.seq },
            "board view count update failed",
        );
    });
}
