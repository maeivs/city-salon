/**
 * IdentityQuerier — Entity Server 어댑터
 *
 * entity-server-client를 통해 identity_verification, account 엔티티에 접근.
 * Go의 EntityAdapter를 TypeScript로 포팅.
 */

import { entityServer, parseUserAgent } from "@system/api";
import type { VerificationRequest, VerificationResult } from "./types/index.ts";

/** DB 연동 인터페이스 */
export interface IdentityQuerier {
    /** pending 상태 인증 요청 레코드를 생성한다 */
    createRequest(req: VerificationRequest): Promise<number>;
    /** request_id로 요청을 조회한다 */
    getRequest(requestId: string): Promise<VerificationRequest | null>;
    /** 인증 결과를 업데이트한다 */
    updateResult(
        requestId: string,
        result: VerificationResult,
        ciHash: string,
    ): Promise<void>;
    /** 상태만 업데이트한다 */
    updateStatus(
        requestId: string,
        status: string,
        errorMsg?: string,
    ): Promise<void>;
    /** CI 해시로 기존 인증을 조회한다 */
    findByCIHash(ciHash: string): Promise<Record<string, unknown>[]>;
    /** CI 해시로 account를 조회한다 */
    findAccountByCIHash(
        ciHash: string,
    ): Promise<Record<string, unknown> | null>;
    /** account에 CI 해시 및 본인인증 정보를 설정한다 */
    linkAccountCI(
        accountSeq: number,
        ciHash: string,
        result: VerificationResult,
    ): Promise<void>;
}

/** Entity Server 기반 IdentityQuerier 구현 */
export class IdentityEntityAdapter implements IdentityQuerier {
    /** IdentityEntityAdapter를 초기화한다 */
    constructor() {}

    /** pending 상태 인증 요청 레코드를 생성한다 */
    async createRequest(req: VerificationRequest): Promise<number> {
        const parsedUserAgent = parseUserAgent(req.userAgent);
        const data: Record<string, unknown> = {
            request_id: req.requestId,
            status: req.status,
            purpose: req.purpose,
            provider: req.provider,
            ip_address: req.ipAddress,
            user_agent: parsedUserAgent.raw,
            expires_at: req.expiresAt,
        };
        if (parsedUserAgent.platform) {
            data.user_agent_platform = parsedUserAgent.platform;
        }
        if (parsedUserAgent.deviceType) {
            data.user_agent_device_type = parsedUserAgent.deviceType;
        }
        if (parsedUserAgent.browser) {
            data.user_agent_browser = parsedUserAgent.browser;
        }
        if (parsedUserAgent.browserVersion) {
            data.user_agent_browser_version = parsedUserAgent.browserVersion;
        }
        if (req.accountSeq > 0) {
            data.account_seq = req.accountSeq;
        }

        const resp = await entityServer.submit("identity_verification", data);
        return (resp as any).seq ?? 0;
    }

    /** request_id로 요청을 조회한다 */
    async getRequest(requestId: string): Promise<VerificationRequest | null> {
        const resp = await entityServer.list("identity_verification", {
            conditions: { request_id: requestId },
            limit: 1,
        });

        const items = ((resp as any).data?.items ??
            (resp as any).items ??
            []) as Record<string, unknown>[];
        if (items.length === 0) return null;

        return mapToVerificationRequest(items[0]);
    }

    /** 인증 결과를 업데이트한다 */
    async updateResult(
        requestId: string,
        result: VerificationResult,
        ciHash: string,
    ): Promise<void> {
        const req = await this.getRequest(requestId);
        if (!req) throw new Error(`identity: request not found: ${requestId}`);

        await entityServer.submit("identity_verification", {
            seq: req.seq,
            status: "verified",
            ci_hash: ciHash,
            di: result.di,
            name: result.name,
            birth_date: result.birthDate,
            gender: result.gender,
            carrier: result.carrier,
            phone: result.phone,
            nationality: result.nationality,
            verified_at: new Date().toISOString(),
        });
    }

    /** 상태만 업데이트한다 */
    async updateStatus(
        requestId: string,
        status: string,
        errorMsg?: string,
    ): Promise<void> {
        const req = await this.getRequest(requestId);
        if (!req) throw new Error(`identity: request not found: ${requestId}`);

        const data: Record<string, unknown> = {
            seq: req.seq,
            status,
        };
        if (errorMsg) data.error_message = errorMsg;

        await entityServer.submit("identity_verification", data);
    }

    /** CI 해시로 기존 인증을 조회한다 */
    async findByCIHash(ciHash: string): Promise<Record<string, unknown>[]> {
        const resp = await entityServer.list("identity_verification", {
            conditions: { ci_hash: ciHash, status: "verified" },
            limit: 10,
            orderBy: "seq",
            orderDir: "DESC",
        });

        return ((resp as any).data?.items ??
            (resp as any).items ??
            []) as Record<string, unknown>[];
    }

    /** CI 해시로 account를 조회한다 */
    async findAccountByCIHash(
        ciHash: string,
    ): Promise<Record<string, unknown> | null> {
        const resp = await entityServer.list("account", {
            conditions: { ci_hash: ciHash },
            limit: 1,
        });

        const items = ((resp as any).data?.items ??
            (resp as any).items ??
            []) as Record<string, unknown>[];
        return items.length > 0 ? items[0] : null;
    }

    /** account에 CI 해시 및 본인인증 정보를 설정한다 */
    async linkAccountCI(
        accountSeq: number,
        ciHash: string,
        result: VerificationResult,
    ): Promise<void> {
        await entityServer.submit("account", {
            seq: accountSeq,
            ci_hash: ciHash,
            identity_verified: true,
            identity_name: result.name,
            identity_birth_date: result.birthDate,
            identity_gender: result.gender,
        });
    }
}

// ── 헬퍼 함수 ──

/** Entity Server 응답을 VerificationRequest로 변환한다 */
function mapToVerificationRequest(
    m: Record<string, unknown>,
): VerificationRequest {
    const rawUserAgent = (m.user_agent as string) ?? "";
    const parsedUserAgent = parseUserAgent(rawUserAgent);
    return {
        seq: toNumber(m.seq),
        requestId: (m.request_id as string) ?? "",
        status: (m.status as string as any) ?? "pending",
        purpose: (m.purpose as string) ?? "",
        provider: (m.provider as string) ?? "",
        ciHash: (m.ci_hash as string) ?? "",
        di: (m.di as string) ?? "",
        name: (m.name as string) ?? "",
        birthDate: (m.birth_date as string) ?? "",
        gender: (m.gender as string) ?? "",
        carrier: (m.carrier as string) ?? "",
        phone: (m.phone as string) ?? "",
        nationality: (m.nationality as string) ?? "",
        accountSeq: toNumber(m.account_seq),
        ipAddress: (m.ip_address as string) ?? "",
        userAgent: rawUserAgent,
        userAgentPlatform:
            (m.user_agent_platform as string) ?? parsedUserAgent.platform,
        userAgentDeviceType:
            (m.user_agent_device_type as string) ?? parsedUserAgent.deviceType,
        userAgentBrowser:
            (m.user_agent_browser as string) ?? parsedUserAgent.browser,
        userAgentBrowserVersion:
            (m.user_agent_browser_version as string) ??
            parsedUserAgent.browserVersion,
        userAgentParsed: {
            raw: parsedUserAgent.raw,
            platform:
                (m.user_agent_platform as string) ?? parsedUserAgent.platform,
            deviceType:
                (m.user_agent_device_type as string) ??
                parsedUserAgent.deviceType,
            browser:
                (m.user_agent_browser as string) ?? parsedUserAgent.browser,
            browserVersion:
                (m.user_agent_browser_version as string) ??
                parsedUserAgent.browserVersion,
        },
        verifiedAt: (m.verified_at as string) ?? "",
        expiresAt: (m.expires_at as string) ?? "",
        errorMessage: (m.error_message as string) ?? "",
    };
}

/** 값을 number로 변환한다 */
function toNumber(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseInt(v, 10) || 0;
    return 0;
}
