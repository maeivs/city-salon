/**
 * TaxInvoiceDriver 팩토리
 *
 * driver 값에 따라 적절한 TaxInvoiceDriver 구현체를 반환합니다.
 *
 * 지원 드라이버:
 *   barobill, popbill, bolta, smartbill, esero, sendbill
 */

import type {
    TaxInvoiceProviderConfig,
    TaxInvoiceDriver,
} from "../types/index.ts";
import { BarobillDriver } from "./barobill.ts";
import { PopbillDriver } from "./popbill.ts";
import { BoltaDriver } from "./bolta.ts";
import { SmartbillDriver } from "./smartbill.ts";
import { EseroDriver } from "./esero.ts";
import { SendbillDriver } from "./sendbill.ts";

/** TaxInvoiceProviderConfig로부터 TaxInvoiceDriver를 생성한다 */
export function createTaxInvoiceClient(
    cfg: TaxInvoiceProviderConfig,
): TaxInvoiceDriver {
    switch (cfg.driver) {
        case "barobill":
            return new BarobillDriver(cfg);
        case "popbill":
            return new PopbillDriver(cfg);
        case "bolta":
            return new BoltaDriver(cfg);
        case "smartbill":
            return new SmartbillDriver(cfg);
        case "esero":
            return new EseroDriver(cfg);
        case "sendbill":
            return new SendbillDriver(cfg);
        default:
            throw new Error(`Unsupported taxinvoice driver: ${cfg.driver}`);
    }
}
