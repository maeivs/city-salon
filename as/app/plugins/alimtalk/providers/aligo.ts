/**
 * Aligo(알리고) 알림톡 프로바이더 어댑터
 *
 * API: https://kakaoapi.aligo.in/akv10/alimtalk/send/
 *      https://kakaoapi.aligo.in/akv10/friend/send/
 * form-encoded POST, ~6원/건
 */

import type {
    AlimtalkClient,
    AlimtalkProviderConfig,
    AlimtalkRequest,
    AlimtalkResult,
    FriendTalkRequest,
    FriendTalkResult,
} from "../types/index.ts";

export class AligoClient implements AlimtalkClient {
    private readonly apiKey: string;
    private readonly userId: string;
    private readonly senderKey: string;

    /** AligoClient 인스턴스를 초기화한다 */
    constructor(cfg: AlimtalkProviderConfig) {
        if (!cfg.api_key || !cfg.user_id) {
            throw new Error("aligo alimtalk: api_key and user_id are required");
        }
        this.apiKey = cfg.api_key;
        this.userId = cfg.user_id;
        this.senderKey = cfg.sender_key;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): string {
        return "aligo";
    }

    /** 알림톡 발송 API를 호출한다 */
    async send(req: AlimtalkRequest): Promise<AlimtalkResult> {
        const senderKey = req.senderKey || this.senderKey;

        const params = new URLSearchParams();
        params.set("apikey", this.apiKey);
        params.set("userid", this.userId);
        params.set("senderkey", senderKey);
        params.set("tpl_code", req.templateCode);
        params.set("receiver_1", req.receiver);

        // 변수 바인딩 — 알리고는 message_1에 전체 본문 전달
        if (req.variables && Object.keys(req.variables).length > 0) {
            const first = Object.entries(req.variables)[0];
            if (first) params.set("subject_1", `${first[0]}=${first[1]}`);
        }

        // 버튼
        if (req.buttons && req.buttons.length > 0) {
            const btns = req.buttons.map((b) => ({
                name: b.name,
                linkType: b.type,
                linkM: b.url_web,
                linkP: b.url_web,
                ...(b.url_app ? { linkA: b.url_app } : {}),
            }));
            params.set("button_1", JSON.stringify({ button: btns }));
        }

        const resp = await fetch(
            "https://kakaoapi.aligo.in/akv10/alimtalk/send/",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
                signal: AbortSignal.timeout(30_000),
            },
        );

        const body = (await resp.json()) as {
            code: number;
            message: string;
            info?: { mid?: string };
        };
        if (body.code !== 0) {
            throw new Error(
                `aligo alimtalk: send failed (code=${body.code}): ${body.message}`,
            );
        }

        return {
            providerMsgId: body.info?.mid ?? "",
            statusCode: String(body.code),
            requestId: "",
        };
    }

    /** 친구톡 발송 API를 호출한다 */
    async sendFriendTalk(req: FriendTalkRequest): Promise<FriendTalkResult> {
        const senderKey = req.senderKey || this.senderKey;

        const params = new URLSearchParams();
        params.set("apikey", this.apiKey);
        params.set("userid", this.userId);
        params.set("senderkey", senderKey);
        params.set("receiver_1", req.receiver);
        params.set("message_1", req.content);

        if (req.imageUrl) params.set("image", req.imageUrl);
        if (req.isAd) params.set("adFlag", "Y");

        if (req.buttons && req.buttons.length > 0) {
            const btns = req.buttons.map((b) => ({
                name: b.name,
                linkType: b.type,
                linkM: b.url_web,
                linkP: b.url_web,
                ...(b.url_app ? { linkA: b.url_app } : {}),
            }));
            params.set("button_1", JSON.stringify({ button: btns }));
        }

        const resp = await fetch(
            "https://kakaoapi.aligo.in/akv10/friend/send/",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
                signal: AbortSignal.timeout(30_000),
            },
        );

        const body = (await resp.json()) as {
            code: number;
            message: string;
            info?: { mid?: string };
        };
        if (body.code !== 0) {
            throw new Error(
                `aligo friendtalk: send failed (code=${body.code}): ${body.message}`,
            );
        }

        return {
            providerMsgId: body.info?.mid ?? "",
            statusCode: String(body.code),
            requestId: "",
        };
    }
}
