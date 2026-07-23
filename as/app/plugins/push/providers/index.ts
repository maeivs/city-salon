/**
 * Push 프로바이더 팩토리
 *
 * driver 값에 따라 FCMProvider 또는 ApnsProvider를 생성합니다.
 */

import { FcmProvider } from "./fcm.ts";
import { ApnsProvider } from "./apns.ts";
import { isFcmTokenExpiredError } from "./utils.ts";
import { isApnsTokenExpiredError } from "./utils.ts";
import type { PushProvider, PushProviderConfig } from "../types/index.ts";

export { isFcmTokenExpiredError, isApnsTokenExpiredError };
export type { PushProvider };

/** 지원 드라이버 목록 */
export const PUSH_DRIVERS = ["fcm", "apns"] as const;
export type PushDriver = (typeof PUSH_DRIVERS)[number];

/**
 * 프로바이더 설정에서 PushProvider 인스턴스를 생성한다
 */
export function createPushProvider(cfg: PushProviderConfig): PushProvider {
    switch (cfg.driver) {
        case "fcm":
            return new FcmProvider(cfg.project_id, cfg.key_file);

        case "apns":
            return new ApnsProvider(
                cfg.key_file,
                cfg.key_id,
                cfg.team_id,
                cfg.bundle_id,
                cfg.production ?? false,
            );

        default: {
            const d = (cfg as { driver: string }).driver;
            throw new Error(`Push: unsupported driver '${d}'`);
        }
    }
}
