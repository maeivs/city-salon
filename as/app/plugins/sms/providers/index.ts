/**
 * SMS 프로바이더 팩토리
 *
 * Go 엔티티서버 `internal/sms/client.go` NewClient에서 포팅
 */

import type { SmsClient, SmsProviderConfig } from "../types/index.ts";
import { AligoClient } from "./aligo.ts";
import { SolapiClient } from "./solapi.ts";
import { PpurioClient } from "./ppurio.ts";
import { NHNClient } from "./nhn.ts";
import { AWSSNSClient } from "./aws-sns.ts";

/**
 * driver 이름에 따라 SmsClient 구현체를 생성한다.
 */
export function createSmsClient(cfg: SmsProviderConfig): SmsClient {
    switch (cfg.driver) {
        case "aligo":
            return new AligoClient(cfg);
        case "solapi":
            return new SolapiClient(cfg);
        case "ppurio":
            return new PpurioClient(cfg);
        case "nhn_cloud":
            return new NHNClient(cfg);
        case "aws_sns":
            return new AWSSNSClient(cfg);
        default:
            throw new Error(`Unknown SMS provider driver: ${cfg.driver}`);
    }
}

/**
 * 메시지 내용과 이미지 유무로 메시지 타입을 자동 판정한다.
 *
 * Go 원본: DetermineMsgType(content string, threshold int, imageURL string) string
 */
export function determineMsgType(
    content: string,
    thresholdBytes: number,
    imageUrl: string,
): string {
    if (imageUrl) return "mms";
    if (Buffer.byteLength(content, "utf-8") > thresholdBytes) return "lms";
    return "sms";
}
