/**
 * 전자세금계산서 Fastify 플러그인
 *
 * 설정 로드 → 프로바이더 드라이버 생성 → Entity Adapter 주입 →
 * TaxInvoiceService 시작 → app.taxInvoiceService 데코레이터 등록
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadTaxInvoiceConfig } from "./config.ts";
import { createTaxInvoiceClient } from "./providers/index.ts";
import { TaxInvoiceService } from "./service.ts";
import { TaxInvoiceEntityAdapter } from "./entity-adapter.ts";
import type { TaxInvoiceDriver } from "./types/index.ts";

declare module "fastify" {
    interface FastifyInstance {
        taxInvoiceService: TaxInvoiceService | null;
    }
}

/** 세금계산서 플러그인을 등록한다 */
export default fp(
    async (app: FastifyInstance) => {
        const config = loadTaxInvoiceConfig();

        if (!config) {
            app.log.info("TaxInvoice plugin disabled in config");
            app.decorate("taxInvoiceService", null);
            return;
        }

        // 프로바이더 드라이버 생성
        const drivers = new Map<string, TaxInvoiceDriver>();
        for (const [name, provCfg] of Object.entries(config.providers)) {
            try {
                const driver = createTaxInvoiceClient(provCfg);
                drivers.set(name, driver);
                app.log.info(
                    `TaxInvoice provider registered: ${name} (${provCfg.driver})`,
                );
            } catch (err) {
                app.log.error(
                    err,
                    `Failed to create taxinvoice provider: ${name} (${provCfg.driver})`,
                );
            }
        }

        if (drivers.size === 0) {
            app.log.warn(
                "TaxInvoice: no valid providers configured, service disabled",
            );
            app.decorate("taxInvoiceService", null);
            return;
        }

        const service = new TaxInvoiceService(config, drivers);

        // Entity Adapter 주입
        service.setQuerier(new TaxInvoiceEntityAdapter());

        // 서비스 시작 (dispatch loop + sync loop)
        await service.start();

        app.decorate("taxInvoiceService", service);

        // graceful shutdown
        app.addHook("onClose", async () => {
            service.stop();
        });
    },
    { name: "taxinvoice-plugin" },
);
