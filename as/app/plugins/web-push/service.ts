import type { FastifyRequest } from "fastify";
import { entityServer, logger } from "@system/api";
import { loadWebPushConfig } from "./config.ts";

const WEB_PUSH_SUBSCRIPTION_ENTITY = "web_push_subscription";
const WEB_PUSH_VAPID_PUBLIC_KEY_ENV = "WEB_PUSH_VAPID_PUBLIC_KEY";
const WEB_PUSH_VAPID_PRIVATE_KEY_ENV = "WEB_PUSH_VAPID_PRIVATE_KEY";
const WEB_PUSH_VAPID_SUBJECT_ENV = "WEB_PUSH_VAPID_SUBJECT";

export interface WebPushSubscriptionRow {
    seq: number;
    account_seq: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    active?: boolean;
}

export interface WebPushNotificationPayload {
    title: string;
    body: string;
    icon?: string;
    image?: string;
    tag?: string;
    data?: Record<string, unknown>;
}

interface WebPushModule {
    setVapidDetails: (
        subject: string,
        publicKey: string,
        privateKey: string,
    ) => void;
    sendNotification: (
        subscription: {
            endpoint: string;
            keys: { p256dh: string; auth: string };
        },
        payload: string,
    ) => Promise<unknown>;
}

/** 숫자 seq 값을 양수 정수로 정규화한다. */
function toPositiveSeq(value: unknown): number | null {
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

/** 환경변수 문자열을 trim 해서 읽는다. */
function readEnvString(name: string): string {
    return String(process.env[name] ?? "").trim();
}

/** Web Push 발송 기능이 켜져 있는지 확인한다. */
function isWebPushEnabled(): boolean {
    return loadWebPushConfig().enabled !== false;
}

/** Web Push VAPID public key 를 읽는다. */
export function getWebPushVapidPublicKey(): string {
    const config = loadWebPushConfig();
    return String(
        config.vapidPublicKey || readEnvString(WEB_PUSH_VAPID_PUBLIC_KEY_ENV),
    ).trim();
}

/** Web Push VAPID 설정을 읽고 검증한다. */
function getWebPushVapidConfig(): {
    subject: string;
    publicKey: string;
    privateKey: string;
} | null {
    const publicKey = getWebPushVapidPublicKey();
    const config = loadWebPushConfig();
    const privateKey = String(
        config.vapidPrivateKey || readEnvString(WEB_PUSH_VAPID_PRIVATE_KEY_ENV),
    ).trim();
    const subject =
        String(
            config.vapidSubject || readEnvString(WEB_PUSH_VAPID_SUBJECT_ENV),
        ).trim() || "mailto:admin@example.com";
    if (!publicKey || !privateKey) {
        return null;
    }

    return { subject, publicKey, privateKey };
}

/** web-push 모듈을 동적으로 로드하고 VAPID 설정을 적용한다. */
async function loadConfiguredWebPush(): Promise<WebPushModule | null> {
    const config = getWebPushVapidConfig();
    if (!config) {
        return null;
    }

    try {
        const module =
            (await import("web-push")) as unknown as WebPushModule & {
                default?: WebPushModule;
            };
        const webPush = module.default ?? module;
        webPush.setVapidDetails(
            config.subject,
            config.publicKey,
            config.privateKey,
        );
        return webPush;
    } catch (err) {
        logger.warn({ err }, "web-push module is not available");
        return null;
    }
}

/** 현재 요청 license 의 활성 Web Push 구독 목록을 조회한다. */
async function listActiveWebPushSubscriptions(): Promise<
    WebPushSubscriptionRow[]
> {
    const response = await entityServer.list<WebPushSubscriptionRow>(
        WEB_PUSH_SUBSCRIPTION_ENTITY,
        {
            fields: ["*"],
            conditions: { active: true },
            page: 1,
            limit: 1000,
        },
    );

    return Array.isArray(response.data?.items) ? response.data.items : [];
}

/** 실패한 Web Push 구독을 비활성화한다. */
async function deactivateWebPushSubscription(seq: number): Promise<void> {
    await entityServer.submit(WEB_PUSH_SUBSCRIPTION_ENTITY, {
        seq,
        active: false,
    });
}

/** Web Push 발송 실패가 구독 만료 오류인지 확인한다. */
function isExpiredWebPushSubscriptionError(error: unknown): boolean {
    const statusCode = Number(
        (error as { statusCode?: unknown })?.statusCode ?? 0,
    );
    return statusCode === 404 || statusCode === 410;
}

/** 단일 구독으로 Web Push 를 발송한다. */
async function sendWebPushToSubscription(
    webPush: WebPushModule,
    subscription: WebPushSubscriptionRow,
    payload: WebPushNotificationPayload,
): Promise<void> {
    await webPush.sendNotification(
        {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
            },
        },
        JSON.stringify(payload),
    );
}

/** 현재 license 의 구독자에게 Web Push 를 발송한다. */
export async function sendWebPushToCurrentLicense(
    req: FastifyRequest,
    payload: WebPushNotificationPayload,
    options: { excludeAccountSeq?: number | null } = {},
): Promise<void> {
    if (!isWebPushEnabled()) {
        return;
    }

    const licenseSeq = toPositiveSeq(req.account?.license_seq);
    if (!licenseSeq) {
        logger.info(
            { tag: payload.tag },
            "web push skipped: license_seq missing",
        );
        return;
    }

    const webPush = await loadConfiguredWebPush();
    if (!webPush) {
        logger.info(
            { licenseSeq, tag: payload.tag },
            "web push skipped: VAPID or module unavailable",
        );
        return;
    }

    const excludeAccountSeq = toPositiveSeq(options.excludeAccountSeq);
    const subscriptions = (await listActiveWebPushSubscriptions()).filter(
        (subscription) =>
            !excludeAccountSeq ||
            subscription.account_seq !== excludeAccountSeq,
    );

    if (subscriptions.length === 0) {
        logger.info(
            { licenseSeq, excludeAccountSeq, tag: payload.tag },
            "web push skipped: no active subscriptions",
        );
        return;
    }

    await Promise.all(
        subscriptions.map(async (subscription) => {
            try {
                await sendWebPushToSubscription(webPush, subscription, payload);
            } catch (err) {
                if (isExpiredWebPushSubscriptionError(err)) {
                    await deactivateWebPushSubscription(subscription.seq);
                }
                logger.warn(
                    { err, subscriptionSeq: subscription.seq },
                    "web push send failed",
                );
            }
        }),
    );
}
