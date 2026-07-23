/**
 * 본인인증 클라이언트 인터페이스 + 팩토리
 */

import type {
    IdentityProviderConfig,
    PrepareInput,
    PrepareOutput,
    VerificationResult,
    ProviderName,
} from "../types/index.ts";
import { NiceClient } from "./nice.ts";
import { KmcClient } from "./kmc.ts";
import { DanalClient } from "./danal.ts";

/** 인증 중계사 클라이언트 인터페이스 */
export interface IdentityClient {
    /** 인증 요청을 준비한다 */
    prepareRequest(input: PrepareInput): Promise<PrepareOutput>;
    /** 콜백 데이터를 파싱한다 */
    parseCallback(encData: string): Promise<VerificationResult>;
    /** 프로바이더 이름을 반환한다 */
    name(): ProviderName;
}

/** 설정으로부터 프로바이더 클라이언트를 생성한다 */
export function createClient(cfg: IdentityProviderConfig): IdentityClient {
    switch (cfg.driver) {
        case "nice":
            return new NiceClient(cfg);
        case "kmc":
            return new KmcClient(cfg);
        case "danal":
            return new DanalClient(cfg);
        default:
            throw new Error(`identity: unsupported driver: ${cfg.driver}`);
    }
}
