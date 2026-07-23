import { createSign } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { fail, ok } from "@system/api";
import { loadPgConfig } from "../../config.ts";

type KcpSignatureBody = {
    provider?: string;
    target_data?: string;
    site_cd?: string;
    tno?: string;
    mod_type?: string;
};

/** PEM 문자열 환경변수의 이스케이프 개행을 실제 개행으로 복원한다. */
function normalizePem(value: string): string {
    return value.replace(/\\n/g, "\n").trim();
}

/** KCP 서명 대상 문자열을 요청값과 설정값으로 만든다. */
function buildKcpSignTarget(body: KcpSignatureBody, siteCode: string): string {
    if (body.target_data) {
        return body.target_data;
    }

    const targetSiteCode = body.site_cd || siteCode;
    if (!targetSiteCode || !body.tno || !body.mod_type) {
        throw new Error(
            "target_data or site_cd, tno, and mod_type are required",
        );
    }
    return `${targetSiteCode}^${body.tno}^${body.mod_type}`;
}

/** KCP 개인키로 SHA256withRSA 서명데이터를 생성한다. */
function signKcpTargetData(targetData: string, privateKeyPem: string): string {
    const signer = createSign("RSA-SHA256");
    signer.update(targetData, "utf8");
    signer.end();
    return signer.sign(privateKeyPem, "base64");
}

/** KCP kcp_sign_data를 생성한다. */
export async function createKcpSignature(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    try {
        const config = loadPgConfig();
        const body = (request.body ?? {}) as KcpSignatureBody;
        const provider = body.provider || config?.default || "kcp";
        const providerConfig = config?.providers?.[provider];
        if (!providerConfig || providerConfig.driver !== "kcp") {
            return reply
                .status(400)
                .send(fail(`pg: provider "${provider}" is not kcp`));
        }

        const privateKey = normalizePem(providerConfig.private_key || "");
        if (!privateKey) {
            return reply
                .status(400)
                .send(fail("kcp: private_key is not configured"));
        }

        const targetData = buildKcpSignTarget(
            body,
            providerConfig.site_cd || "",
        );
        const signData = signKcpTargetData(targetData, privateKey);
        return ok({ target_data: targetData, kcp_sign_data: signData });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send(fail(message));
    }
}
