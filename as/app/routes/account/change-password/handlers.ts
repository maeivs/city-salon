/**
 * 비밀번호 변경(Change Password) 핸들러
 *
 * 흐름:
 *   1) req.account에서 account_seq 추출
 *   2) account 조회 + 현재 비밀번호 검증
 *   3) 새 비밀번호 정책 검증 (password-policy.ts)
 *   4) 비밀번호 이력 재사용 검사 (password_history 엔티티)
 *   5) account.passwd 갱신 + passwd_changed_time / force_password_change 리셋
 *   6) password_history 저장
 *
 * 기존 entity-server 비밀번호 변경 구현을 대체한다.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail, entityServer, logger } from "@system/api";
import {
    hashPassword,
    verifyPassword,
} from "../../password-reset/password-utils.ts";
import {
    loadPasswordPolicyConfig,
    validatePasswordWithCurrentPolicy,
} from "../../../utils/passwordPolicyConfig.ts";

/* ──────────── 상수 ──────────── */

const MAX_PASSWD_LEN = 128;

/* ──────────── 타입 ──────────── */

export interface ChangePasswordBody {
    current_password?: string;
    new_password?: string;
}

interface AccountRow {
    seq: number;
    passwd?: string;
    has_password?: boolean;
}

interface PasswordHistoryRow {
    seq: number;
    passwd_hash?: string;
}

/* ──────────── 핸들러 ──────────── */

export async function handleChangePassword(
    req: FastifyRequest<{ Body: ChangePasswordBody }>,
    reply: FastifyReply,
): Promise<void> {
    // 1. AS 인증 컨텍스트에서 account_seq 추출
    const accountSeq = Number(req.account?.seq ?? 0) || null;
    if (!accountSeq) {
        reply.code(401).send(fail("인증이 필요합니다."));
        return;
    }

    const body = req.body ?? {};
    const currentPassword = (body.current_password ?? "").trim();
    const newPassword = (body.new_password ?? "").trim();

    if (!currentPassword || !newPassword) {
        reply
            .code(400)
            .send(fail("current_password and new_password are required"));
        return;
    }
    if (newPassword.length > MAX_PASSWD_LEN) {
        reply.code(400).send(fail("Password is too long"));
        return;
    }
    if (currentPassword === newPassword) {
        reply
            .code(400)
            .send(fail("New password must be different from current password"));
        return;
    }

    // 2. account 조회
    let account: AccountRow;
    try {
        const res = await entityServer.get<AccountRow>("account", accountSeq);
        if (!res?.data) {
            reply.code(404).send(fail("Account not found"));
            return;
        }
        account = res.data;
    } catch {
        reply.code(404).send(fail("Account not found"));
        return;
    }

    // 비밀번호가 설정되지 않은 계정 (소셜 전용)
    if (!account.passwd) {
        reply
            .code(400)
            .send(
                fail("This account has no password set (social-only account)"),
            );
        return;
    }

    // 3. 현재 비밀번호 검증
    if (!verifyPassword(currentPassword, account.passwd)) {
        reply.code(400).send(fail("Current password is incorrect"));
        return;
    }

    // 4. 비밀번호 정책 검증 (복잡도)
    const policyError = await validatePasswordWithCurrentPolicy(newPassword);
    if (policyError) {
        reply.code(400).send(fail(policyError));
        return;
    }

    // 5. 이전 비밀번호 재사용 검사
    const passwordPolicy = await loadPasswordPolicyConfig();
    const reused = await checkPasswordHistory(
        accountSeq,
        newPassword,
        passwordPolicy.enabled ? passwordPolicy.history_count : 0,
    );
    if (reused) {
        reply.code(400).send(fail("Cannot reuse a recent password"));
        return;
    }

    // 6. 비밀번호 해싱 및 account 업데이트
    const newHash = hashPassword(newPassword);
    const now = new Date()
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, "");

    try {
        await entityServer.submit("account", {
            seq: accountSeq,
            passwd: newHash,
            passwd_changed_time: now,
            force_password_change: false,
            has_password: true,
            passwd_expiry_warned_days: 0,
        });
    } catch (err) {
        logger.error(
            { err, accountSeq },
            "handleChangePassword: failed to update account",
        );
        reply.code(500).send(fail("Failed to update password"));
        return;
    }

    // 7. 이력 저장 (실패해도 변경 자체는 성공)
    await savePasswordHistory(accountSeq, newHash).catch((err) =>
        logger.warn(
            { err, accountSeq },
            "handleChangePassword: failed to save password history",
        ),
    );

    logger.info({ accountSeq }, "Password changed");
    reply.send(ok({ message: "Password changed successfully" }));
}

/* ──────────── 이력 헬퍼 ──────────── */

/**
 * password_history 엔티티에서 최근 이력을 조회해 새 비밀번호 재사용 여부를 반환한다.
 */
async function checkPasswordHistory(
    accountSeq: number,
    newPassword: string,
    historyCount: number,
): Promise<boolean> {
    if (historyCount <= 0) {
        return false;
    }

    try {
        const res = await entityServer.list<PasswordHistoryRow>(
            "password_history",
            {
                conditions: { account_seq: accountSeq },
                limit: historyCount,
                page: 1,
            },
        );
        const items: PasswordHistoryRow[] = res?.data?.items ?? [];
        for (const item of items) {
            if (
                item.passwd_hash &&
                verifyPassword(newPassword, item.passwd_hash)
            ) {
                return true;
            }
        }
    } catch {
        // password_history 엔티티가 없거나 조회 실패 시 검사 건너뜀
    }
    return false;
}

/**
 * 변경된 비밀번호 해시를 password_history 엔티티에 저장한다.
 */
async function savePasswordHistory(
    accountSeq: number,
    passwdHash: string,
): Promise<void> {
    await entityServer.submit("password_history", {
        account_seq: accountSeq,
        passwd_hash: passwdHash,
    });
}
