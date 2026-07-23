import type { FastifyReply, FastifyRequest } from "fastify";
import { fail, ok } from "@system/api";
import {
    loadPasswordPolicyConfig,
    updatePasswordPolicyConfig,
    type PasswordPolicy,
} from "../../../utils/passwordPolicyConfig.ts";

export interface PasswordPolicyBody {
    password_policy?: Partial<PasswordPolicy>;
    [key: string]: unknown;
}

/** 관리자 권한이 있는지 확인한다. */
function ensureAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
    if (req.account?.is_admin || req.account?.rbac_role === "admin") {
        return true;
    }

    reply.code(403).send(fail("관리자 권한이 필요합니다."));
    return false;
}

/** 비밀번호 정책 요청 본문을 추출한다. */
function extractPasswordPolicyInput(
    body: PasswordPolicyBody | undefined,
): unknown {
    if (!body || typeof body !== "object") {
        return {};
    }
    return body.password_policy && typeof body.password_policy === "object"
        ? body.password_policy
        : body;
}

/** 현재 비밀번호 정책 설정을 반환한다. */
export async function getPasswordPolicy(
    req: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    if (!ensureAdmin(req, reply)) {
        return;
    }

    const passwordPolicy = await loadPasswordPolicyConfig();
    reply.send(ok({ password_policy: passwordPolicy }));
}

/** 현재 비밀번호 정책 설정을 저장한다. */
export async function updatePasswordPolicy(
    req: FastifyRequest<{ Body: PasswordPolicyBody }>,
    reply: FastifyReply,
): Promise<void> {
    if (!ensureAdmin(req, reply)) {
        return;
    }

    try {
        const passwordPolicy = await updatePasswordPolicyConfig(
            extractPasswordPolicyInput(req.body),
        );
        reply.send(ok({ password_policy: passwordPolicy }));
    } catch {
        reply.code(500).send(fail("비밀번호 정책 설정 저장에 실패했습니다."));
    }
}
