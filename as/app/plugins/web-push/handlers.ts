import type { FastifyReply, FastifyRequest } from "fastify";
import { entityServer, fail, ok } from "@system/api";
import { getWebPushVapidPublicKey } from "./service.ts";

const WEB_PUSH_SUBSCRIPTION_ENTITY = "web_push_subscription";

interface WebPushSubscriptionBody {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
        p256dh?: string;
        auth?: string;
    };
    user_agent?: string;
}

/** 문자열 입력값을 trim 한 문자열로 정규화한다. */
function toTrimmedString(value: unknown): string {
    return String(value ?? "").trim();
}

/** 양수 seq 값을 정수로 변환한다. */
function toPositiveSeq(value: unknown): number | null {
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

/** Web Push 구독 만료 시간을 문자열로 정규화한다. */
function normalizeExpirationTime(value: unknown): string {
    const normalized = Number(value ?? 0);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return "";
    }

    return new Date(normalized).toISOString();
}

/** 현재 계정 seq 를 응답 가능한 형태로 확인한다. */
function getAccountSeqOrReply(
    req: FastifyRequest,
    reply: FastifyReply,
): number | null {
    const accountSeq = toPositiveSeq(req.account?.seq);
    if (!accountSeq) {
        reply.code(401).send(fail("Authentication required"));
        return null;
    }

    return accountSeq;
}

/** 조회 응답에서 업데이트용 seq 값을 꺼낸다. */
function resolveSubscriptionSeq(value: unknown): number | null {
    const item = value as { seq?: unknown; data_seq?: unknown } | null;
    return toPositiveSeq(item?.seq ?? item?.data_seq);
}

/** endpoint 로 기존 구독을 조회한다. */
async function findSubscriptionByEndpoint(
    endpoint: string,
): Promise<{ seq: number } | null> {
    const response = await entityServer.list<{
        seq?: number;
        data_seq?: number;
    }>(WEB_PUSH_SUBSCRIPTION_ENTITY, {
        fields: ["account_seq"],
        conditions: { endpoint },
        page: 1,
        limit: 1,
    });

    const item = response.data?.items?.[0] ?? null;
    const seq = resolveSubscriptionSeq(item);
    return seq ? { seq } : null;
}

/** VAPID public key 를 반환한다. */
export async function getVapidPublicKey(
    _req: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const publicKey = getWebPushVapidPublicKey();
    if (!publicKey) {
        reply
            .code(500)
            .send(fail("WEB_PUSH_VAPID_PUBLIC_KEY is not configured"));
        return;
    }

    reply.send(ok({ publicKey }));
}

/** 현재 계정의 Web Push 구독을 저장한다. */
export async function saveSubscription(
    req: FastifyRequest<{ Body: WebPushSubscriptionBody }>,
    reply: FastifyReply,
): Promise<void> {
    const accountSeq = getAccountSeqOrReply(req, reply);
    if (!accountSeq) {
        return;
    }

    const body = req.body ?? {};
    const endpoint = toTrimmedString(body.endpoint);
    const p256dh = toTrimmedString(body.keys?.p256dh);
    const auth = toTrimmedString(body.keys?.auth);
    if (!endpoint || !p256dh || !auth) {
        reply
            .code(400)
            .send(fail("endpoint, keys.p256dh, keys.auth are required"));
        return;
    }

    const existing = await findSubscriptionByEndpoint(endpoint);
    const payload = {
        ...(existing?.seq ? { seq: existing.seq } : {}),
        account_seq: accountSeq,
        endpoint,
        p256dh,
        auth,
        expiration_time: normalizeExpirationTime(body.expirationTime),
        user_agent: toTrimmedString(
            body.user_agent ?? req.headers["user-agent"],
        ),
        active: true,
    };

    const response = await entityServer.submit(
        WEB_PUSH_SUBSCRIPTION_ENTITY,
        payload,
    );
    reply.send(ok({ seq: response.seq ?? existing?.seq ?? null }));
}

/** 현재 계정의 Web Push 구독을 비활성화한다. */
export async function deleteSubscription(
    req: FastifyRequest<{ Body: { endpoint?: string } }>,
    reply: FastifyReply,
): Promise<void> {
    const accountSeq = getAccountSeqOrReply(req, reply);
    if (!accountSeq) {
        return;
    }

    const endpoint = toTrimmedString(req.body?.endpoint);
    if (!endpoint) {
        reply.code(400).send(fail("endpoint is required"));
        return;
    }

    const existing = await findSubscriptionByEndpoint(endpoint);
    if (existing?.seq) {
        await entityServer.submit(WEB_PUSH_SUBSCRIPTION_ENTITY, {
            seq: existing.seq,
            account_seq: accountSeq,
            active: false,
        });
    }

    reply.send(ok({ seq: existing?.seq ?? null }));
}
