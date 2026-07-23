/**
 * NHN Cloud 알림톡 프로바이더 어댑터
 *
 * API: https://api-alimtalk.cloud.toast.com/alimtalk/v2.3/appkeys/{appKey}/messages
 *      https://api-alimtalk.cloud.toast.com/friendtalk/v2.3/appkeys/{appKey}/messages
 * X-Secret-Key 헤더 인증, JSON POST
 * 친구톡 시 이미지, 와이드 아이템 리스트, 캐러셀 전체 지원
 */

import type {
    AlimtalkClient,
    AlimtalkProviderConfig,
    AlimtalkRequest,
    AlimtalkResult,
    FriendTalkRequest,
    FriendTalkResult,
    FRIENDTALK_TYPE_WIDE_ITEM_LIST as _,
    FRIENDTALK_TYPE_CAROUSEL as __,
} from "../types/index.ts";
import {
    FRIENDTALK_TYPE_WIDE_ITEM_LIST,
    FRIENDTALK_TYPE_CAROUSEL,
} from "../types/index.ts";

export class NHNClient implements AlimtalkClient {
    private readonly appKey: string;
    private readonly secretKey: string;
    private readonly senderKey: string;

    /** NHNClient 인스턴스를 초기화한다 */
    constructor(cfg: AlimtalkProviderConfig) {
        if (!cfg.app_key || !cfg.secret_key) {
            throw new Error(
                "nhn alimtalk: app_key and secret_key are required",
            );
        }
        this.appKey = cfg.app_key;
        this.secretKey = cfg.secret_key;
        this.senderKey = cfg.sender_key;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): string {
        return "nhn_cloud";
    }

    /** 알림톡 발송 API를 호출한다 */
    async send(req: AlimtalkRequest): Promise<AlimtalkResult> {
        const senderKey = req.senderKey || this.senderKey;

        const recipient: Record<string, unknown> = {
            recipientNo: req.receiver,
            templateParameter: req.variables,
        };

        // 버튼
        if (req.buttons && req.buttons.length > 0) {
            recipient.buttons = req.buttons.map((b) => {
                const bm: Record<string, unknown> = {
                    ordering: b.ordering,
                    type: b.type,
                    name: b.name,
                };
                if (b.link_mobile) bm.linkMo = b.link_mobile;
                if (b.link_pc) bm.linkPc = b.link_pc;
                if (b.scheme_ios) bm.schemeIos = b.scheme_ios;
                if (b.scheme_android) bm.schemeAndroid = b.scheme_android;
                return bm;
            });
        }

        const body = {
            senderKey,
            templateCode: req.templateCode,
            recipientList: [recipient],
        };

        const url = `https://api-alimtalk.cloud.toast.com/alimtalk/v2.3/appkeys/${this.appKey}/messages`;

        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "X-Secret-Key": this.secretKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        const respBody = await resp.text();
        if (resp.status >= 400) {
            throw new Error(
                `nhn alimtalk: send failed (status=${resp.status}): ${respBody}`,
            );
        }

        const result = JSON.parse(respBody) as {
            header?: {
                resultCode?: number;
                resultMessage?: string;
                isSuccessful?: boolean;
            };
            message?: { requestId?: string };
        };

        if (!result.header?.isSuccessful) {
            throw new Error(
                `nhn alimtalk: send failed: ${result.header?.resultMessage ?? "unknown"}`,
            );
        }

        return {
            providerMsgId: result.message?.requestId ?? "",
            statusCode: String(result.header?.resultCode ?? 0),
            requestId: result.message?.requestId ?? "",
        };
    }

    /** 친구톡 발송 API를 호출한다 */
    async sendFriendTalk(req: FriendTalkRequest): Promise<FriendTalkResult> {
        const senderKey = req.senderKey || this.senderKey;

        const recipient: Record<string, unknown> = {
            recipientNo: req.receiver,
            content: req.content,
            isAd: req.isAd,
        };

        // 이미지
        if (req.imageUrl) {
            recipient.imageUrl = req.imageUrl;
            if (req.imageLink) recipient.imageLink = req.imageLink;
        }

        // 버튼
        if (req.buttons && req.buttons.length > 0) {
            recipient.buttons = req.buttons.map((b) => {
                const bm: Record<string, unknown> = {
                    ordering: b.ordering,
                    type: b.type,
                    name: b.name,
                };
                if (b.link_mobile) bm.linkMo = b.link_mobile;
                if (b.link_pc) bm.linkPc = b.link_pc;
                if (b.scheme_ios) bm.schemeIos = b.scheme_ios;
                if (b.scheme_android) bm.schemeAndroid = b.scheme_android;
                return bm;
            });
        }

        // 와이드 아이템 리스트
        if (
            req.msgType === FRIENDTALK_TYPE_WIDE_ITEM_LIST &&
            req.header &&
            req.items?.length
        ) {
            recipient.header = req.header;
            recipient.item = {
                list: req.items.map((item) => {
                    const im: Record<string, unknown> = {
                        title: item.title,
                        imageUrl: item.image_url,
                        linkMo: item.link_mobile,
                    };
                    if (item.link_pc) im.linkPc = item.link_pc;
                    if (item.scheme_ios) im.schemeIos = item.scheme_ios;
                    if (item.scheme_android)
                        im.schemeAndroid = item.scheme_android;
                    return im;
                }),
            };
        }

        // 캐러셀
        if (req.msgType === FRIENDTALK_TYPE_CAROUSEL && req.carousel) {
            const carouselList = req.carousel.items.map((ci) => {
                const card: Record<string, unknown> = {
                    header: ci.header,
                    message: ci.message,
                    attachment: {
                        image: {
                            imageUrl: ci.image_url,
                            imageLink: ci.image_link ?? "",
                        },
                    },
                };
                if (ci.buttons?.length) {
                    (card.attachment as Record<string, unknown>).buttons =
                        ci.buttons.map((b) => ({
                            name: b.name,
                            type: b.type,
                            linkMo: b.link_mobile,
                            linkPc: b.link_pc ?? "",
                        }));
                }
                return card;
            });

            const carousel: Record<string, unknown> = { list: carouselList };
            if (req.carousel.tail) {
                carousel.tail = {
                    linkMo: req.carousel.tail.link_mobile,
                    linkPc: req.carousel.tail.link_pc ?? "",
                };
            }
            recipient.carousel = carousel;
        }

        const body = {
            senderKey,
            recipientList: [recipient],
        };

        const url = `https://api-alimtalk.cloud.toast.com/friendtalk/v2.3/appkeys/${this.appKey}/messages`;

        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "X-Secret-Key": this.secretKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        const respBody = await resp.text();
        if (resp.status >= 400) {
            throw new Error(
                `nhn friendtalk: send failed (status=${resp.status}): ${respBody}`,
            );
        }

        const result = JSON.parse(respBody) as {
            header?: {
                resultCode?: number;
                resultMessage?: string;
                isSuccessful?: boolean;
            };
            message?: { requestId?: string };
        };

        if (!result.header?.isSuccessful) {
            throw new Error(
                `nhn friendtalk: send failed: ${result.header?.resultMessage ?? "unknown"}`,
            );
        }

        return {
            providerMsgId: result.message?.requestId ?? "",
            statusCode: String(result.header?.resultCode ?? 0),
            requestId: result.message?.requestId ?? "",
        };
    }
}
