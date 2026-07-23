/**
 * 알림톡 클라이언트 팩토리
 *
 * 프로바이더 설정에 따라 적절한 AlimtalkClient를 생성합니다.
 */

import type { AlimtalkProviderConfig, AlimtalkClient } from "../types/index.ts";
import { AligoClient } from "./aligo.ts";
import { SolapiClient } from "./solapi.ts";
import { PpurioClient } from "./ppurio.ts";
import { NHNClient } from "./nhn.ts";

/** 드라이버에 맞는 알림톡 클라이언트를 생성한다 */
export function createAlimtalkClient(
    cfg: AlimtalkProviderConfig,
): AlimtalkClient {
    switch (cfg.driver) {
        case "aligo":
            return new AligoClient(cfg);
        case "solapi":
            return new SolapiClient(cfg);
        case "ppurio":
            return new PpurioClient(cfg);
        case "nhn_cloud":
            return new NHNClient(cfg);
        default:
            throw new Error(`Unsupported alimtalk driver: ${cfg.driver}`);
    }
}
