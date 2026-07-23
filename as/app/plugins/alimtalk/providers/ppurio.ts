/**
 * 뿌리오(Ppurio) 알림톡 프로바이더 어댑터
 *
 * API: https://api.ppurio.com/v1/kakao/send
 *      https://api.ppurio.com/v1/kakao/friend/send
 * Bearer token 인증, JSON POST
 */

import type {
    AlimtalkClient,
    AlimtalkProviderConfig,
    AlimtalkRequest,
    AlimtalkResult,
    FriendTalkRequest,
    FriendTalkResult,
} from "../types/index.ts";

export class PpurioClient implements AlimtalkClient {
    private readonly account: string;
    private readonly apiKey: string;
    private readonly senderKey: string;

    /** PpurioClient 인스턴스를 초기화한다 */
    constructor(cfg: AlimtalkProviderConfig) {
        if (!cfg.account || !cfg.api_key) {
            throw new Error(
                "ppurio alimtalk: account and api_key are required",
            );
        }
        this.account = cfg.account;
        this.apiKey = cfg.api_key;
        this.senderKey = cfg.sender_key;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): string {
        return "ppurio";
    }

    /** 알림톡 발송 API를 호출한다 */
    async send(req: AlimtalkRequest): Promise<AlimtalkResult> {
        const senderKey = req.senderKey || this.senderKey;

        const body = {
            account: this.account,
            senderKey,
            templateCode: req.templateCode,
            receivers: [
                {
                    to: req.receiver,
                    templateParameter: req.variables,
                },
            ],
        };

        const resp = await fetch("https://api.ppurio.com/v1/kakao/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        const respBody = await resp.text();
        if (resp.status >= 400) {
            throw new Error(
                `ppurio alimtalk: send failed (status=${resp.status}): ${respBody}`,
            );
        }

        const result = JSON.parse(respBody) as {
            code?: number;
            requestId?: string;
        };

        return {
            providerMsgId: result.requestId ?? "",
            statusCode: String(result.code ?? resp.status),
            requestId: result.requestId ?? "",
        };
    }

    /** 친구톡 발송 API를 호출한다 */
    async sendFriendTalk(req: FriendTalkRequest): Promise<FriendTalkResult> {
        const senderKey = req.senderKey || this.senderKey;

        const receiver: Record<string, unknown> = {
            to: req.receiver,
            content: req.content,
        };
        if (req.imageUrl) {
            receiver.imageUrl = req.imageUrl;
            if (req.imageLink) receiver.imageLink = req.imageLink;
        }

        const body: Record<string, unknown> = {
            account: this.account,
            senderKey,
            isAd: req.isAd,
            receivers: [receiver],
        };

        if (req.buttons && req.buttons.length > 0) {
            body.buttons = req.buttons.map((b) => ({
                type: b.type,
                name: b.name,
                ...(b.link_mobile ? { linkMo: b.link_mobile } : {}),
                ...(b.link_pc ? { linkPc: b.link_pc } : {}),
            }));
        }

        const resp = await fetch(
            "https://api.ppurio.com/v1/kakao/friend/send",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30_000),
            },
        );

        const respBody = await resp.text();
        if (resp.status >= 400) {
            throw new Error(
                `ppurio friendtalk: send failed (status=${resp.status}): ${respBody}`,
            );
        }

        const result = JSON.parse(respBody) as {
            code?: number;
            requestId?: string;
        };

        return {
            providerMsgId: result.requestId ?? "",
            statusCode: String(result.code ?? resp.status),
            requestId: result.requestId ?? "",
        };
    }
}
