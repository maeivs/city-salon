/**
 * 계정 생체인증(Biometric) 핸들러
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { entityServer, fail, ok } from "@system/api";
import { getAccountSeqFromJwt } from "../../email-verify/handlers/utils.ts";

interface AccountBiometricRow {
    seq: number;
    account_seq: number;
    bio_id?: string;
    device_id?: string;
    public_key?: string;
    label?: string;
}

interface RegisterBiometricBody {
    bio_id?: string;
    device_id?: string;
    public_key?: string;
    label?: string;
}

function getAccountSeqOrReply(
    req: FastifyRequest,
    reply: FastifyReply,
): number | null {
    const accountSeq = getAccountSeqFromJwt(req);
    if (!accountSeq) {
        reply.code(401).send(fail("인증이 필요합니다."));
        return null;
    }
    return accountSeq;
}

export async function handleListBiometrics(
    req: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const accountSeq = getAccountSeqOrReply(req, reply);
    if (!accountSeq) return;

    const res = await entityServer.list<AccountBiometricRow>(
        "account_biometric",
        {
            account_seq: accountSeq,
        } as any,
    );

    reply.send(ok(res?.data?.items ?? []));
}

export async function handleRegisterBiometric(
    req: FastifyRequest<{ Body: RegisterBiometricBody }>,
    reply: FastifyReply,
): Promise<void> {
    const accountSeq = getAccountSeqOrReply(req, reply);
    if (!accountSeq) return;

    const body = req.body ?? {};
    const bioId = (body.bio_id ?? "").trim();
    const deviceId = (body.device_id ?? "").trim();
    const publicKey = (body.public_key ?? "").trim();
    const label = (body.label ?? "").trim();

    if (!bioId || !deviceId || !publicKey) {
        reply
            .code(400)
            .send(fail("bio_id, device_id, public_key are required"));
        return;
    }

    const created = await entityServer.submit("account_biometric", {
        account_seq: accountSeq,
        bio_id: bioId,
        device_id: deviceId,
        public_key: publicKey,
        label,
    });

    reply.send(ok(created));
}

export async function handleDeleteBiometric(
    req: FastifyRequest<{ Params: { seq: string } }>,
    reply: FastifyReply,
): Promise<void> {
    const accountSeq = getAccountSeqOrReply(req, reply);
    if (!accountSeq) return;

    const seq = Number(req.params?.seq ?? 0);
    if (!Number.isFinite(seq) || seq <= 0) {
        reply.code(400).send(fail("유효한 seq가 필요합니다."));
        return;
    }

    const current = await entityServer.get<AccountBiometricRow>(
        "account_biometric",
        seq,
    );
    const row = current?.data;
    if (!row) {
        reply.code(404).send(fail("생체인증 정보를 찾을 수 없습니다."));
        return;
    }
    if (Number(row.account_seq) !== accountSeq) {
        reply.code(403).send(fail("다른 계정의 생체인증 정보입니다."));
        return;
    }

    await entityServer.delete("account_biometric", seq);
    reply.send(ok({ seq }));
}
