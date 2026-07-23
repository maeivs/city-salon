import type { FastifyReply, FastifyRequest } from "fastify";
import { ok } from "@system/api";
import { getBaseBootstrapData } from "./baseBootstrap.ts";

/** 인증 후 공통 초기 부트스트랩 데이터를 반환한다. */
export async function getBootstrap(_req: FastifyRequest, reply: FastifyReply) {
    const bootstrap = await getBaseBootstrapData();
    return reply.send(ok({ bootstrap }));
}
