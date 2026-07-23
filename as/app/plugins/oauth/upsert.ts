/**
 * account_oauth + account upsert 로직
 *
 * Go auth_handler.go upsertOAuthAccount 포팅.
 *
 * 전략:
 *  1) account_oauth (provider + provider_id) 조회 → account_seq로 account 로드
 *  2) account email 조회 → account_oauth 자동 연결
 *  3) 둘 다 없으면 account + account_oauth 신규 생성
 */

import { entityServer, logger } from "@system/api";
import type { OAuthUserInfo } from "./types/index.ts";

interface AccountRow {
    seq: number;
    email?: string;
    name?: string;
    status?: string;
    rbac_role?: string;
    has_password?: boolean | number;
    totp_enabled?: boolean;
    totp_locked_until?: string;
    license_seq?: number;
    [key: string]: unknown;
}

interface OAuthRow {
    seq: number;
    account_seq: number;
    provider: string;
    provider_id: string;
    status?: string;
    [key: string]: unknown;
}

export type { AccountRow };

async function getAccountBySeq(seq: number): Promise<AccountRow | null> {
    try {
        const res = await entityServer.get<AccountRow>("account", seq);
        return res?.data ?? null;
    } catch {
        return null;
    }
}

function createOAuthData(
    accountSeq: number,
    ui: OAuthUserInfo,
): Record<string, unknown> {
    const data: Record<string, unknown> = {
        account_seq: accountSeq,
        provider: ui.provider,
        provider_id: ui.provider_id,
        email: ui.email,
        name: ui.name,
        profile_image: ui.profile_image,
        status: "active",
        linked_at: "now()",
    };
    if (ui.access_token) data.access_token = ui.access_token;
    if (ui.refresh_token) data.refresh_token = ui.refresh_token;
    if (ui.token_expires_at) data.token_expires_at = ui.token_expires_at;
    return data;
}

async function createAccountOAuth(
    accountSeq: number,
    ui: OAuthUserInfo,
): Promise<void> {
    try {
        await entityServer.submit(
            "account_oauth",
            createOAuthData(accountSeq, ui),
        );
    } catch (err) {
        logger.warn(
            { err, provider: ui.provider },
            "OAuth: failed to create account_oauth",
        );
    }
}

async function syncNewUserProfile(ui: OAuthUserInfo): Promise<void> {
    if (!ui.name && !ui.profile_image) return;
    try {
        const res = await entityServer.find<{ seq?: number }>("user", {
            conditions: { email: ui.email },
        });
        const user = res?.data;
        if (user?.seq) {
            await entityServer.submit("user", {
                seq: user.seq,
                ...(ui.name ? { name: ui.name } : {}),
                ...(ui.profile_image
                    ? { profile_image: ui.profile_image }
                    : {}),
            });
        }
    } catch {
        // user 엔티티가 없는 환경이면 무시
    }
}

export async function upsertOAuthAccount(
    ui: OAuthUserInfo,
): Promise<AccountRow> {
    // 1단계: account_oauth (provider + provider_id) 조회
    try {
        const r1 = await entityServer.list<OAuthRow>("account_oauth", {
            conditions: {
                provider: ui.provider,
                provider_id: ui.provider_id,
                status: "active",
            },
            limit: 1,
        });
        const items1 = (r1?.data?.items ?? []) as OAuthRow[];
        if (items1.length > 0 && items1[0]!.account_seq) {
            const account = await getAccountBySeq(items1[0]!.account_seq);
            if (account) return account;
        }
    } catch {
        // account_oauth 엔티티 없는 환경 무시
    }

    // 2단계: account email 조회
    try {
        const r2 = await entityServer.list<AccountRow>("account", {
            conditions: { email: ui.email },
            limit: 1,
        });
        const items2 = (r2?.data?.items ?? []) as AccountRow[];
        if (items2.length > 0 && items2[0]!.seq) {
            await createAccountOAuth(items2[0]!.seq, ui);
            return items2[0]!;
        }
    } catch (err) {
        logger.error({ err }, "OAuth: failed to find account by email");
    }

    // 3단계: 신규 account + account_oauth 생성
    const newSeq = await entityServer.submit("account", {
        email: ui.email,
        status: "active",
        rbac_role: "user",
        has_password: false,
    });

    const newSeqNum = (newSeq as unknown as { seq?: number })?.seq ?? 0;
    if (!newSeqNum) {
        throw new Error("Failed to create account");
    }

    await createAccountOAuth(newSeqNum, ui);
    void syncNewUserProfile(ui);

    const created = await getAccountBySeq(newSeqNum);
    if (!created) throw new Error("Failed to fetch created account");
    return created;
}
