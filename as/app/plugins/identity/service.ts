/**
 * 본인인증 서비스
 *
 * 인증 요청 생성, 콜백 처리, CI 중복검사, 결과 조회 등 비즈니스 로직을 담당한다.
 */

import { randomBytes } from "node:crypto";
import type {
    IdentityConfig,
    VerificationResult,
    MaskedResult,
    PrepareInput,
    VerificationRequest,
    VerificationStatus,
    VerificationPurpose,
    VALID_PURPOSES,
} from "./types/index.ts";
import { VALID_PURPOSES as validPurposes } from "./types/index.ts";
import type { IdentityClient } from "./providers/index.ts";
import type { IdentityQuerier } from "./entity-adapter.ts";
import { NiceClient } from "./providers/nice.ts";
import { hashCI } from "./crypto.ts";

/** NICE 전용: 요청별 token_val 캐시 엔트리 */
interface TokenCacheEntry {
    tokenVal: string;
    expiresAt: number;
}

/** 본인인증 서비스 */
export class IdentityService {
    private readonly cfg: IdentityConfig;
    private readonly clients: Map<string, IdentityClient>;
    private readonly defaultClient: IdentityClient;
    private querier: IdentityQuerier | null = null;

    /** NICE 전용: 요청별 token_val 캐시 (콜백 복호화에 필요) */
    private tokenCache = new Map<string, TokenCacheEntry>();

    /** IdentityService를 생성한다 */
    constructor(
        cfg: IdentityConfig,
        clients: Map<string, IdentityClient>,
        defaultClient: IdentityClient,
    ) {
        this.cfg = cfg;
        this.clients = clients;
        this.defaultClient = defaultClient;
    }

    /** DB 연동 인터페이스를 설정한다 */
    setQuerier(q: IdentityQuerier): void {
        this.querier = q;
    }

    /** 설정을 반환한다 */
    config(): IdentityConfig {
        return this.cfg;
    }

    // ── 인증 요청 생성 ──

    /** 본인인증 요청을 생성한다 */
    async createRequest(
        purpose: string,
        method: string,
        provider: string,
        ip: string,
        userAgent: string,
        accountSeq: number,
    ): Promise<Record<string, unknown>> {
        // 1. 유효성 검증
        if (!validPurposes.has(purpose)) {
            throw new Error(`identity: invalid purpose: ${purpose}`);
        }
        if (!method) method = "popup";

        // 2. 프로바이더 결정
        let client = this.defaultClient;
        if (provider) {
            const c = this.clients.get(provider);
            if (!c) throw new Error(`identity: unknown provider: ${provider}`);
            client = c;
        }

        // 3. 고유 요청 ID 생성 (64자 hex)
        const requestId = randomBytes(32).toString("hex");

        // 4. 만료 시각 계산
        const ttl = this.cfg.requestTtlSec > 0 ? this.cfg.requestTtlSec : 300;
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

        // 5. return_url 결정
        const returnUrl = this.cfg.returnUrl;
        if (!returnUrl) {
            throw new Error("identity: return_url is required in config");
        }

        // 6. 프로바이더 요청 준비
        const input: PrepareInput = {
            requestId,
            returnUrl,
            method,
            purpose,
            ip,
            userAgent,
        };

        const output = await client.prepareRequest(input);

        // NICE 전용: tokenVal 캐시 (콜백 복호화용)
        if (output.tokenVal && output.tokenVersionId) {
            this.cacheTokenVal(output.tokenVersionId, output.tokenVal, ttl);
        }

        // 7. DB에 pending 상태 레코드 생성
        if (this.querier) {
            const req: VerificationRequest = {
                seq: 0,
                requestId,
                status: "pending",
                purpose,
                provider: client.name(),
                ciHash: "",
                di: "",
                name: "",
                birthDate: "",
                gender: "",
                carrier: "",
                phone: "",
                nationality: "",
                accountSeq,
                ipAddress: ip,
                userAgent,
                verifiedAt: "",
                expiresAt,
                errorMessage: "",
            };
            await this.querier.createRequest(req);
        }

        // 8. 응답 구성
        const result: Record<string, unknown> = {
            request_id: requestId,
            popup_url: output.popupUrl,
            enc_data: output.encData,
        };
        if (output.tokenVersionId) {
            result.token_version_id = output.tokenVersionId;
        }
        if (output.integrityValue) {
            result.integrity_value = output.integrityValue;
        }
        if (output.schemeUrl) {
            result.scheme_url = output.schemeUrl;
        }

        return result;
    }

    // ── 콜백 처리 ──

    /** 중계사 콜백을 처리한다 */
    async handleCallback(
        provider: string,
        encData: string,
        tokenVersionId?: string,
    ): Promise<VerificationResult> {
        const client = this.clients.get(provider);
        if (!client) {
            throw new Error(
                `identity: unknown provider for callback: ${provider}`,
            );
        }

        let result: VerificationResult;

        // NICE는 token_val이 필요하므로 별도 처리
        if (client instanceof NiceClient && tokenVersionId) {
            const entry = this.tokenCache.get(tokenVersionId);
            if (!entry || Date.now() >= entry.expiresAt) {
                throw new Error(
                    `identity: nice token_val not found or expired for version: ${tokenVersionId}`,
                );
            }
            result = await client.parseCallbackWithKey(encData, entry.tokenVal);
            // 사용 후 캐시 삭제 (일회용)
            this.tokenCache.delete(tokenVersionId);
        } else {
            result = await client.parseCallback(encData);
        }

        if (!result.ci) {
            throw new Error("identity: callback result missing CI");
        }

        // CI 해시 계산
        const ciHash = hashCI(result.ci);

        // DB 업데이트
        if (this.querier) {
            const { requestId } = result;
            if (!requestId) {
                throw new Error("identity: callback result missing request_id");
            }

            // 요청 유효성 검증
            const req = await this.querier.getRequest(requestId);
            if (!req) {
                throw new Error(`identity: request not found: ${requestId}`);
            }
            if (req.status !== "pending") {
                throw new Error(
                    `identity: request already processed: ${requestId} (status=${req.status})`,
                );
            }

            // 만료 확인
            if (req.expiresAt) {
                const expires = new Date(req.expiresAt).getTime();
                if (Date.now() > expires) {
                    await this.querier
                        .updateStatus(requestId, "expired", "request expired")
                        .catch(() => {});
                    throw new Error(`identity: request expired: ${requestId}`);
                }
            }

            // 결과 저장
            try {
                await this.querier.updateResult(requestId, result, ciHash);
            } catch (err) {
                console.warn("identity: failed to save result:", err);
            }

            // CI 기반 계정 연결
            if (req.accountSeq > 0) {
                try {
                    await this.querier.linkAccountCI(
                        req.accountSeq,
                        ciHash,
                        result,
                    );
                } catch (err) {
                    console.warn("identity: failed to link account CI:", err);
                }
            }
        }

        return result;
    }

    // ── 결과 조회 ──

    /** 인증 결과를 마스킹하여 반환한다 */
    async getResult(requestId: string): Promise<MaskedResult> {
        if (!this.querier) {
            throw new Error("identity: querier not configured");
        }

        const req = await this.querier.getRequest(requestId);
        if (!req) {
            throw new Error(`identity: request not found: ${requestId}`);
        }

        const result: MaskedResult = { status: req.status };

        if (req.status === "verified") {
            result.name = maskName(req.name);
            result.birthDate = maskBirthDate(req.birthDate);
            result.gender = req.gender;
            result.phone = maskPhone(req.phone);
            result.verifiedAt = req.verifiedAt;

            // CI 중복 확인
            if (req.ciHash && this.cfg.duplicateCiCheck) {
                const existing = await this.querier.findAccountByCIHash(
                    req.ciHash,
                );
                if (existing) {
                    const existingSeq = toNumber(existing.seq);
                    if (existingSeq > 0 && existingSeq !== req.accountSeq) {
                        result.isDuplicate = true;
                    }
                }
            }

            result.accountLinked = req.accountSeq > 0;
        }

        return result;
    }

    // ── CI 중복 확인 ──

    /** CI 해시로 기존 계정 존재 여부를 확인한다 */
    async checkCIDuplicate(
        ciHash: string,
    ): Promise<{ exists: boolean; accountSeq: number }> {
        if (!this.querier) {
            throw new Error("identity: querier not configured");
        }

        const account = await this.querier.findAccountByCIHash(ciHash);
        if (!account) return { exists: false, accountSeq: 0 };

        return { exists: true, accountSeq: toNumber(account.seq) };
    }

    // ── NICE token_val 캐시 ──

    /** NICE 요청 시 token_val을 캐시한다 */
    cacheTokenVal(
        tokenVersionId: string,
        tokenVal: string,
        ttlSec: number,
    ): void {
        this.tokenCache.set(tokenVersionId, {
            tokenVal,
            expiresAt: Date.now() + ttlSec * 1000,
        });
    }

    /** 만료된 토큰 캐시를 정리한다 */
    cleanExpiredTokens(): void {
        const now = Date.now();
        for (const [k, v] of this.tokenCache) {
            if (now >= v.expiresAt) {
                this.tokenCache.delete(k);
            }
        }
    }
}

// ── 헬퍼 함수 ──

/** 이름을 마스킹한다. "홍길동" → "홍*동" */
function maskName(name: string): string {
    const runes = [...name];
    if (runes.length <= 1) return name;
    return runes[0] + "*".repeat(runes.length - 2) + runes[runes.length - 1];
}

/** 전화번호를 마스킹한다. "01012345678" → "010****5678" */
function maskPhone(phone: string): string {
    if (phone.length < 7) return phone;
    return phone.slice(0, 3) + "****" + phone.slice(-4);
}

/** 생년월일을 마스킹한다. "19900115" → "1990****" */
function maskBirthDate(birth: string): string {
    if (birth.length < 4) return birth;
    return birth.slice(0, 4) + "****";
}

/** 값을 number로 변환한다 */
function toNumber(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseInt(v, 10) || 0;
    return 0;
}
