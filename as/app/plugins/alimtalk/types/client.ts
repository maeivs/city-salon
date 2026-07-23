import type {
    AlimtalkRequest,
    AlimtalkResult,
    PendingAlimtalkLog,
} from "./job.ts";
import type {
    FriendTalkRequest,
    FriendTalkResult,
    PendingFriendTalkLog,
} from "./friendtalk.ts";

export interface AlimtalkClient {
    name(): string;
    send(req: AlimtalkRequest): Promise<AlimtalkResult>;
    sendFriendTalk(req: FriendTalkRequest): Promise<FriendTalkResult>;
}

export interface AlimtalkQuerier {
    submitAlimtalkLog(data: Record<string, unknown>): Promise<void>;
    claimPendingAlimtalkLogs(limit: number): Promise<PendingAlimtalkLog[]>;
    updateAlimtalkLogStatus(
        logSeq: number,
        status: string,
        providerMsgId: string,
        errMsg: string,
    ): Promise<void>;
    resetStaleAlimtalkLogs(): Promise<void>;
    updateAlimtalkMsgStatus(msgSeq: number, status: string): Promise<void>;
    updateAlimtalkLogDelivery(
        providerMsgId: string,
        status: string,
        deliveredAt: string,
        errMsg: string,
    ): Promise<void>;
}

export interface FriendTalkQuerier {
    submitFriendTalkLog(data: Record<string, unknown>): Promise<void>;
    claimPendingFriendTalkLogs(limit: number): Promise<PendingFriendTalkLog[]>;
    updateFriendTalkLogStatus(
        logSeq: number,
        status: string,
        providerMsgId: string,
        errMsg: string,
    ): Promise<void>;
    resetStaleFriendTalkLogs(): Promise<void>;
    updateFriendTalkMsgStatus(msgSeq: number, status: string): Promise<void>;
}
