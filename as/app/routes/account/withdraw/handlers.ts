/**
 * 회원 탈퇴(Withdraw) 핸들러
 *
 * 흐름:
 *   1) 탈퇴 전 이메일 미리 조회 (익명화되면 이메일을 알 수 없음)
 *   2) 플러그인/라우트 withdraw hook 실행 (account_oauth, totp 필드 등 고아 데이터 정리)
 *   3) Go /v1/auth/withdraw 프록시 (account 익명화 + JWT revoke)
 *   4) 성공 시 탈퇴 확인 이메일 발송
 *
 * 플러그인 cleanup 등록:
 *   plugins/oauth/index.ts  → registerWithdrawHook("oauth", ...)
 *   plugins/2fa/index.ts    → registerWithdrawHook("2fa", ...)
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { fail, entityServer, sendEmail, logger } from "@system/api";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");
import { env } from "@system/api";
import { runWithdrawHooks } from "@system/api";
import { getAccountSeqFromJwt } from "../../email-verify/handlers/utils.ts";

/* ──────────── 타입 ──────────── */

interface AccountRow {
    seq: number;
    email?: string;
}

interface WithdrawBody {
    passwd?: string;
}

/* ──────────── 핸들러 ──────────── */

export async function handleWithdraw(
    req: FastifyRequest<{ Body: WithdrawBody }>,
    reply: FastifyReply,
): Promise<void> {
    // 1. JWT에서 account_seq 추출
    const accountSeq = getAccountSeqFromJwt(req);
    if (!accountSeq) {
        reply.code(401).send(fail("인증이 필요합니다."));
        return;
    }

    // 2. 탈퇴 전 이메일 미리 조회 (익명화되면 이메일을 알 수 없음)
    let accountEmail = "";
    try {
        const res = await entityServer.get<AccountRow>("account", accountSeq);
        accountEmail = res?.data?.email ?? "";
    } catch {
        // 조회 실패 시 이메일 없이 진행
    }

    // 3. 플러그인 cleanup (account_oauth, totp 필드 초기화 등)
    await runWithdrawHooks(accountSeq, (msg, extra) =>
        logger.warn({ ...extra }, `Withdraw: ${msg}`),
    );

    // 4. Go /v1/auth/withdraw 프록시 (account 익명화 + JWT revoke)
    const goUrl = `${env.ENTITY_SERVER_URL}/v1/auth/withdraw`;
    const authorization = req.headers.authorization ?? "";
    let goResponse: Response;
    let goBody: string;
    try {
        goResponse = await fetch(goUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authorization,
            },
            body: JSON.stringify(req.body ?? {}),
            signal: AbortSignal.timeout(10_000),
        });
        goBody = await goResponse.text();
    } catch (err) {
        logger.error({ err, seq: accountSeq }, "Withdraw: Go proxy failed");
        reply.code(502).send(fail("탈퇴 처리에 실패했습니다."));
        return;
    }

    // 5. Go 응답 반환 (실패 시 그대로 전달)
    reply.code(goResponse.status);
    try {
        reply.type("application/json").send(goBody);
    } catch {
        reply.send(goBody);
    }

    // 6. 성공 시 탈퇴 확인 이메일 발송 (fire-and-forget)
    if (goResponse.ok && accountEmail) {
        sendEmail({
            to: [accountEmail],
            subject: "회원 탈퇴 완료 안내",
            templateDir: TEMPLATES_DIR,
            templateName: "withdraw_complete",
            templateData: { email: accountEmail },
        }).catch((err) =>
            logger.warn(
                { err, seq: accountSeq },
                "Withdraw: email send failed",
            ),
        );
    }

    logger.info({ seq: accountSeq, ok: goResponse.ok }, "Withdraw: processed");
}
