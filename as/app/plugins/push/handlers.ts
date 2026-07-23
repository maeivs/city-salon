/**
 * Push 알림 라우트 핸들러
 *
 * Go 엔티티서버 `internal/handler/push_handler.go` 에서 포팅
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import {
    ok,
    fail,
    BadRequestError,
    entityServer,
    parseUserAgent,
} from "@system/api";
import type { PushService } from "./service.ts";

let pushService: PushService | null = null;

export function initHandlers(svc: PushService): void {
    pushService = svc;
}

/** POST /v1/push/send — 푸시 알림 발송 큐 등록 */
export async function handleSend(
    req: FastifyRequest<{
        Body: {
            account_seq: number;
            title: string;
            body: string;
            data?: Record<string, string>;
            ref_entity?: string;
            ref_seq?: number;
            provider?: string;
        };
    }>,
    reply: FastifyReply,
): Promise<void> {
    if (!pushService) {
        reply.code(503).send(fail("Push service not available"));
        return;
    }

    const b = req.body;
    if (!b.account_seq || b.account_seq <= 0) {
        throw new BadRequestError("account_seq is required");
    }
    if (!b.title) {
        throw new BadRequestError("title is required");
    }
    if (!b.body) {
        throw new BadRequestError("body is required");
    }

    await pushService.enqueueJob({
        account_seq: b.account_seq,
        title: b.title,
        body: b.body,
        data: b.data,
        ref_entity: b.ref_entity,
        ref_seq: b.ref_seq,
        provider: b.provider,
    });

    reply.send(ok({ message: "Push notification queued for delivery" }));
}

/**
 * POST /v1/push/broadcast — 여러 계정에 동시 발송
 * account_seqs 배열을 받아 각 계정에 푸시를 큐에 등록한다
 */
export async function handleBroadcast(
    req: FastifyRequest<{
        Body: {
            account_seqs: number[];
            title: string;
            body: string;
            data?: Record<string, string>;
            ref_entity?: string;
            provider?: string;
        };
    }>,
    reply: FastifyReply,
): Promise<void> {
    if (!pushService) {
        reply.code(503).send(fail("Push service not available"));
        return;
    }

    const b = req.body;
    if (!Array.isArray(b.account_seqs) || b.account_seqs.length === 0) {
        throw new BadRequestError("account_seqs must be a non-empty array");
    }
    if (!b.title) {
        throw new BadRequestError("title is required");
    }
    if (!b.body) {
        throw new BadRequestError("body is required");
    }

    let queued = 0;
    for (const accountSeq of b.account_seqs) {
        if (!accountSeq || accountSeq <= 0) continue;
        try {
            await pushService.enqueueJob({
                account_seq: accountSeq,
                title: b.title,
                body: b.body,
                data: b.data,
                ref_entity: b.ref_entity,
                provider: b.provider,
            });
            queued++;
        } catch {
            // 개별 실패는 무시하고 계속
        }
    }

    reply.send(
        ok({
            message: `Push notifications queued for ${queued} accounts`,
            queued,
        }),
    );
}

/** GET /v1/push/status/:seq — 발송 상태 조회 */
export async function handleStatus(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
): Promise<void> {
    reply.send(
        ok({
            message:
                "Use entity API: GET /v1/entity/push_log/{seq} to check push delivery status",
        }),
    );
}

/**
 * POST /v1/push/device — 디바이스 토큰 등록/갱신
 *
 * device_id 기준으로 account_device 를 upsert한다.
 */
export async function handleDeviceRegister(
    req: FastifyRequest<{
        Body: {
            device_id: string;
            push_token: string;
            platform?: string;
            device_type?: string;
            browser?: string;
            browser_version?: string;
        };
    }>,
    reply: FastifyReply,
): Promise<void> {
    const accountSeq = (req as any).user?.account_seq as number | undefined;
    if (!accountSeq || accountSeq <= 0) {
        reply.code(401).send(fail("Authentication required"));
        return;
    }

    const b = req.body;
    if (!b.device_id) throw new BadRequestError("device_id is required");
    if (!b.push_token) throw new BadRequestError("push_token is required");

    const userAgent = parseUserAgent(req.headers["user-agent"]);

    const result = await entityServer.registerPushDevice(
        accountSeq,
        b.device_id,
        b.push_token,
        {
            platform: b.platform ?? userAgent.platform,
            deviceType: b.device_type ?? userAgent.deviceType,
            browser: b.browser ?? userAgent.browser,
            browserVersion: b.browser_version ?? userAgent.browserVersion,
            pushEnabled: true,
        },
    );

    reply.send(ok({ seq: result.seq }));
}

/**
 * DELETE /v1/push/device/:seq — 디바이스 푸시 수신 비활성화
 */
export async function handleDeviceUnregister(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
): Promise<void> {
    const seq = parseInt(req.params.seq, 10);
    if (!seq || seq <= 0) throw new BadRequestError("Invalid device seq");

    await entityServer.disablePushDevice(seq);

    reply.send(ok({ message: "Device push disabled" }));
}
