/**
 * 본인인증 API 핸들러
 *
 * POST   /request            → 인증 요청 생성
 * POST   /callback           → 중계사 콜백 수신
 * GET    /result/:request_id → 인증 결과 조회
 * POST   /verify-ci          → CI 기반 중복 확인
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { ok, fail } from "@system/api";

/** identityService가 활성화되어 있는지 확인한다 */
const ensureSvc = (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.server.identityService) {
        reply.status(503).send(fail("Identity plugin not enabled"));
        return null;
    }
    return req.server.identityService;
};

// ── 인증 요청 생성 ──

/** 본인인증 요청을 생성한다 */
export async function handleRequest(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const body = (request.body ?? {}) as Record<string, string>;
    const { purpose, method, provider } = body;

    if (!purpose) {
        return reply.status(400).send(fail("purpose is required"));
    }

    // JWT가 있으면 account_seq 추출 (선택적)
    let accountSeq = 0;
    if (request.user) {
        accountSeq = (request.user as any).seq ?? 0;
    }

    try {
        const result = await svc.createRequest(
            purpose,
            method ?? "",
            provider ?? "",
            request.ip,
            request.headers["user-agent"] ?? "",
            accountSeq,
        );
        return ok(result);
    } catch (err) {
        console.warn("identity: create request failed:", err);
        return reply
            .status(500)
            .send(fail("failed to create identity verification request"));
    }
}

// ── 콜백 처리 ──

/** 중계사 콜백을 수신한다 */
export async function handleCallback(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const cfg = svc.config();
    const contentType = request.headers["content-type"] ?? "";
    let encData = "";
    let tokenVersionId = "";
    let provider = "";

    if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
    ) {
        // form-urlencoded 방식 (NICE, KMC)
        const body = request.body as Record<string, string>;
        encData = body.enc_data ?? "";
        tokenVersionId = body.token_version_id ?? "";
        // KMC는 rec_cert 파라미터 사용
        if (!encData) encData = body.rec_cert ?? "";
    } else {
        // JSON 방식
        const body = (request.body ?? {}) as Record<string, string>;
        encData = body.enc_data ?? "";
        tokenVersionId = body.token_version_id ?? "";
        provider = body.provider ?? "";
    }

    if (!encData) {
        return reply.status(400).send(fail("enc_data is required"));
    }

    // 프로바이더 추론
    if (!provider) {
        provider =
            (request.query as Record<string, string>).provider ?? cfg.default;
    }

    try {
        const result = await svc.handleCallback(
            provider,
            encData,
            tokenVersionId || undefined,
        );

        // 성공: 팝업 닫기 + postMessage 전송
        const requestId = result.requestId;
        const redirectUrl = cfg.successRedirectUrl
            ? `${cfg.successRedirectUrl}?request_id=${requestId}`
            : "";

        reply.type("text/html");
        return callbackHTML("verified", requestId, redirectUrl);
    } catch (err) {
        console.warn("identity: callback failed:", err);

        // 실패 시 리다이렉트 또는 에러 페이지
        const errMsg = err instanceof Error ? err.message : String(err);
        const redirectUrl = cfg.failureRedirectUrl
            ? `${cfg.failureRedirectUrl}?error=${encodeURIComponent(errMsg)}`
            : "";

        reply.type("text/html");
        return callbackHTML("failed", "", redirectUrl);
    }
}

// ── 결과 조회 ──

/** 인증 결과를 조회한다 */
export async function handleResult(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const { request_id } = request.params as { request_id: string };
    if (!request_id) {
        return reply.status(400).send(fail("request_id is required"));
    }

    // 길이 검증 (64자 hex)
    if (request_id.length !== 64) {
        return reply.status(400).send(fail("invalid request_id format"));
    }

    try {
        const result = await svc.getResult(request_id);
        if (!result) {
            return reply.status(404).send(fail("request not found"));
        }
        return ok(result);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) {
            return reply.status(404).send(fail("request not found"));
        }
        return reply.status(500).send(fail("failed to get result"));
    }
}

// ── CI 중복 확인 ──

/** CI 해시로 중복 가입 여부를 확인한다 */
export async function handleVerifyCI(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    const svc = ensureSvc(request, reply);
    if (!svc) return;

    const body = (request.body ?? {}) as Record<string, string>;
    const ciHash = body.ci_hash ?? "";

    if (!ciHash) {
        return reply.status(400).send(fail("ci_hash is required"));
    }

    try {
        const { exists, accountSeq } = await svc.checkCIDuplicate(ciHash);
        const data: Record<string, unknown> = { exists };
        if (exists) data.account_seq = accountSeq;
        return ok(data);
    } catch {
        return reply.status(500).send(fail("CI check failed"));
    }
}

// ── 콜백 HTML 헬퍼 ──

/** 콜백 결과를 프론트엔드에 전달하는 HTML을 생성한다 */
function callbackHTML(
    status: string,
    requestId: string,
    redirectUrl: string,
): string {
    const redirectScript = redirectUrl
        ? `
                setTimeout(function() {
                    if (window.opener) {
                        window.opener.location.href = ${JSON.stringify(redirectUrl)};
                    }
                }, 100);`
        : "";

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>본인인증 결과</title></head>
<body>
<script>
(function() {
    try {
        if (window.opener && window.opener.postMessage) {
            window.opener.postMessage({
                type: "identity_verification",
                request_id: ${JSON.stringify(requestId)},
                status: ${JSON.stringify(status)}
            }, "*");
        }
        ${redirectScript}
    } catch(e) {
        console.error("identity callback error:", e);
    }
    setTimeout(function() { window.close(); }, 300);
})();
</script>
<p>인증이 완료되었습니다. 이 창은 자동으로 닫힙니다.</p>
</body>
</html>`;
}
