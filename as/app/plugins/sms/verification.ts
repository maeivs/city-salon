/**
 * SMS 인증번호 발송/검증 서비스
 *
 * Go 엔티티서버 `internal/sms/verification.go`에서 포팅
 *
 * 흐름:
 *  1. SendVerificationCode: 이전 pending 만료 → 코드 생성 → SHA-256 해시 저장 → SMS 발송
 *  2. VerifyCode: pending 조회 → 만료 확인 → 시도 횟수 확인 → constant-time 비교 → verified
 */

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { logger } from "@system/api";
import type { SmsVerificationConfig, VerificationQuerier } from "./types/index.ts";
import type { SmsService } from "./service.ts";

export class VerificationService {
    private readonly smsService: SmsService;
    private readonly querier: VerificationQuerier;
    private readonly codeLength: number;
    private readonly ttlSec: number;
    private readonly maxAttempts: number;
    private readonly cooldownSec: number;

    constructor(
        smsService: SmsService,
        querier: VerificationQuerier,
        cfg?: SmsVerificationConfig,
    ) {
        this.smsService = smsService;
        this.querier = querier;
        this.codeLength = cfg?.code_length ?? 6;
        this.ttlSec = cfg?.ttl_sec ?? 180;
        this.maxAttempts = cfg?.max_attempts ?? 5;
        this.cooldownSec = cfg?.cooldown_sec ?? 60;
    }

    /**
     * 인증번호를 발송한다.
     * @returns 만료까지 남은 초 (ttl_sec)
     */
    async sendVerificationCode(
        phone: string,
        purpose: string,
    ): Promise<number> {
        // 1. 이전 pending 건 만료
        await this.querier.expireOldVerifications(phone, purpose);

        // 2. 인증번호 생성
        const code = generateVerificationCode(this.codeLength);
        const codeHash = hashCode(code);

        // 3. 만료 시각 계산
        const expiresAt = new Date(
            Date.now() + this.ttlSec * 1000,
        ).toISOString();

        // 4. DB 저장
        await this.querier.submitVerification({
            phone,
            purpose,
            status: "pending",
            code_hash: codeHash,
            expires_at: expiresAt,
            attempts: 0,
        });

        // 5. SMS 발송
        const minutes = Math.floor(this.ttlSec / 60);
        const content = `[인증번호] ${code} (${minutes}분 유효)`;
        await this.smsService.enqueueJob({
            provider: "",
            receiver: phone,
            sender: "",
            content,
            subject: "",
            msg_type: "sms",
            image_url: "",
            ref_entity: "sms_verification",
            ref_seq: 0,
            sms_msg_seq: 0,
        });

        logger.info({ phone, purpose }, "SMS verification code sent");
        return this.ttlSec;
    }

    /**
     * 인증번호를 검증한다.
     * @returns 검증 결과 { verified, error? }
     */
    async verifyCode(
        phone: string,
        purpose: string,
        code: string,
    ): Promise<{ verified: boolean; error?: string }> {
        // 1. pending 레코드 조회
        const record = await this.querier.findPendingVerification(
            phone,
            purpose,
        );
        if (!record) return { verified: false, error: "no pending verification found" };

        const seq = Number(record.seq ?? 0);
        if (seq <= 0) return { verified: false, error: "no pending verification found" };

        // 2. 만료 확인
        const expiresAt = new Date(String(record.expires_at ?? ""));
        if (expiresAt.getTime() < Date.now()) {
            await this.querier.updateVerification(seq, {
                status: "expired",
            });
            return { verified: false, error: "code expired" };
        }

        // 3. 시도 횟수 확인
        const attempts = Number(record.attempts ?? 0);
        if (attempts >= this.maxAttempts) {
            await this.querier.updateVerification(seq, {
                status: "expired",
            });
            return { verified: false, error: "max attempts exceeded" };
        }

        // 4. constant-time 비교
        const inputHash = hashCode(code);
        const storedHash = String(record.code_hash ?? "");

        const inputBuf = Buffer.from(inputHash, "utf-8");
        const storedBuf = Buffer.from(storedHash, "utf-8");

        if (
            inputBuf.length !== storedBuf.length ||
            !timingSafeEqual(inputBuf, storedBuf)
        ) {
            // 불일치 시에만 시도 횟수 증가 (Go 동일 패턴)
            await this.querier.updateVerification(seq, {
                attempts: attempts + 1,
            });
            return { verified: false };
        }

        // 5. 성공 → verified
        await this.querier.updateVerification(seq, {
            status: "verified",
        });

        logger.info({ phone, purpose }, "SMS verification code verified");
        return { verified: true };
    }
}

/** crypto.randomInt 기반 N자리 숫자 인증번호 생성 */
function generateVerificationCode(length: number): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length);
    return String(randomInt(min, max));
}

/** SHA-256 해시 (hex) */
function hashCode(code: string): string {
    return createHash("sha256").update(code, "utf-8").digest("hex");
}
