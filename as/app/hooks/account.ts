/**
 * Account 엔티티 훅 — 계정 조회 시 연관 데이터 자동 포함
 *
 * - afterGet: devices(account_device 엔티티 list) 추가
 * - afterGet: biometrics(account_biometric 엔티티 list) 추가
 */

import type { EntityHook, JwtUserInfo } from "@system/api";
import { entityServer } from "@system/api";

export const accountHook: EntityHook = {
    /**
     * 계정 단건 조회 후 — 연관 데이터 추가
     *
     * - devices: account_device 엔티티에서 account_seq로 목록 조회
     */
    async afterGet(entity: string, data: any, _user: JwtUserInfo) {
        if (data.seq) {
            const devicesResp = await entityServer.list<any>("account_device", {
                account_seq: data.seq,
            } as any);
            data.devices = devicesResp?.data?.items ?? [];

            const biometricsResp = await entityServer.list<any>(
                "account_biometric",
                {
                    account_seq: data.seq,
                } as any,
            );
            data.biometrics = biometricsResp?.data?.items ?? [];
        }

        return data;
    },
};
