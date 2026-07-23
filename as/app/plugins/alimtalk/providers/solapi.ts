/**
 * Solapi(CoolSMS 차세대) 알림톡 프로바이더 어댑터
 *
 * API: https://api.solapi.com/kakao/v2/messages
 * HMAC-SHA256 인증, JSON POST
 */

import { buildSolapiAuthorization } from "../../shared/solapi-auth.ts";
import type {
    AlimtalkClient,
    AlimtalkProviderConfig,
    AlimtalkRequest,
    AlimtalkResult,
    FriendTalkRequest,
    FriendTalkResult,
} from "../types/index.ts";

export class SolapiClient implements AlimtalkClient {
    private readonly apiKey: string;
    private readonly apiSecret: string;
    private readonly senderKey: string;

    /** SolapiClient 인스턴스를 초기화한다 */
    constructor(cfg: AlimtalkProviderConfig) {
        if (!cfg.api_key || !cfg.api_secret) {
            throw new Error(
                "solapi alimtalk: api_key and api_secret are required",
            );
        }
        this.apiKey = cfg.api_key;
        this.apiSecret = cfg.api_secret;
        this.senderKey = cfg.sender_key;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): string {
        return "solapi";
    }

    /** HMAC-SHA256 인증 헤더를 생성한다 */
    private buildAuth(): string {
        return buildSolapiAuthorization(this.apiKey, this.apiSecret)
            .authorization;
    }

    /** 알림톡 발송 API를 호출한다 */
    async send(req: AlimtalkRequest): Promise<AlimtalkResult> {
        const senderKey = req.senderKey || this.senderKey;

        // #{var} 형식으로 변환
        const variables: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.variables ?? {})) {
            variables[`#{${k}}`] = v;
        }

        const body = {
            messages: [
                {
                    to: req.receiver,
                    kakaoOptions: {
                        pfId: senderKey,
                        templateId: req.templateCode,
                        variables,
                    },
                },
            ],
        };

        const resp = await fetch("https://api.solapi.com/kakao/v2/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: this.buildAuth(),
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        const respBody = await resp.text();
        if (resp.status >= 400) {
            throw new Error(
                `solapi alimtalk: send failed (status=${resp.status}): ${respBody}`,
            );
        }

        const result = JSON.parse(respBody) as { groupId?: string };

        return {
            providerMsgId: result.groupId ?? "",
            statusCode: String(resp.status),
            requestId: "",
        };
    }

    /** 친구톡 발송 API를 호출한다 */
    async sendFriendTalk(req: FriendTalkRequest): Promise<FriendTalkResult> {
        const senderKey = req.senderKey || this.senderKey;

        const kakaoOptions: Record<string, unknown> = { pfId: senderKey };
        if (req.imageUrl) kakaoOptions.imageUrl = req.imageUrl;
        if (req.isAd) kakaoOptions.adFlag = true;

        if (req.buttons && req.buttons.length > 0) {
            kakaoOptions.buttons = req.buttons.map((b) => ({
                buttonType: b.type,
                buttonName: b.name,
                ...(b.link_mobile ? { linkMo: b.link_mobile } : {}),
                ...(b.link_pc ? { linkPc: b.link_pc } : {}),
            }));
        }

        const msg: Record<string, unknown> = {
            to: req.receiver,
            kakaoOptions,
        };
        if (req.content) msg.text = req.content;

        const body = { messages: [msg] };

        const resp = await fetch("https://api.solapi.com/kakao/v2/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: this.buildAuth(),
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        const respBody = await resp.text();
        if (resp.status >= 400) {
            throw new Error(
                `solapi friendtalk: send failed (status=${resp.status}): ${respBody}`,
            );
        }

        const result = JSON.parse(respBody) as { groupId?: string };

        return {
            providerMsgId: result.groupId ?? "",
            statusCode: String(resp.status),
            requestId: "",
        };
    }
}
