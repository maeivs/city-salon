/**
 * PG 결제 클라이언트 팩토리
 *
 * driver 값에 따라 적절한 PgClient 구현체를 반환합니다.
 *
 * 지원 드라이버:
 *   toss_payments, kcp, inicis, danal, hecto, kakaopay, naverpay, payco, wanna, payletter, paypal
 */

import type { PgClient, PgProviderConfig } from "../types/index.ts";
import { TossClient } from "./toss.ts";
import { KcpClient } from "./kcp.ts";
import { InicisClient } from "./inicis.ts";
import { DanalClient } from "./danal.ts";
import { HectoClient } from "./hecto.ts";
import { KakaoPayClient } from "./kakaopay.ts";
import { NaverPayClient } from "./naverpay.ts";
import { PaycoClient } from "./payco.ts";
import { WannaClient } from "./wanna.ts";
import { PayletterClient } from "./payletter.ts";
import { PayPalClient } from "./paypal.ts";

/** PgProviderConfig로부터 PgClient를 생성한다 */
export function createPgClient(cfg: PgProviderConfig): PgClient {
    switch (cfg.driver) {
        case "toss_payments":
            return new TossClient(cfg);
        case "kcp":
            return new KcpClient(cfg);
        case "inicis":
            return new InicisClient(cfg);
        case "danal":
            return new DanalClient(cfg);
        case "hecto":
            return new HectoClient(cfg);
        case "kakaopay":
            return new KakaoPayClient(cfg);
        case "naverpay":
            return new NaverPayClient(cfg);
        case "payco":
            return new PaycoClient(cfg);
        case "wanna":
            return new WannaClient(cfg);
        case "payletter":
            return new PayletterClient(cfg);
        case "paypal":
            return new PayPalClient(cfg);
        default:
            throw new Error(`unknown pg driver: ${cfg.driver}`);
    }
}

export type { PgClient };
