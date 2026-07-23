/**
 * 휴일 데이터 동기화 Fastify 플러그인
 *
 * 설정 로드 → DATAGOKR_API_KEY 확인 → onReady 시 즉시 동기화 → cron 스케줄 등록
 *
 * cron 표현식: 5-필드 표준 형식 (분 시 일 월 요일)
 * 기본값: "0 3 1 * *" = 매월 1일 새벽 3시
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { Cron } from "croner";
import { loadHolidaysConfig } from "./config.ts";
import { HolidayService } from "./service.ts";

declare module "fastify" {
    interface FastifyInstance {
        holidayService: HolidayService | null;
    }
}

export default fp(
    async (app: FastifyInstance) => {
        const config = loadHolidaysConfig();
        if (!config) {
            app.decorate("holidayService", null);
            return;
        }

        const apiKey = config.apiKey ?? process.env.DATAGOKR_API_KEY ?? "";
        if (!apiKey) {
            app.log.warn(
                "Holidays plugin: apiKey not set in config.json (or DATAGOKR_API_KEY env not set), skipping schedule",
            );
            app.decorate("holidayService", null);
            return;
        }

        const service = new HolidayService(config, apiKey);
        app.decorate("holidayService", service);

        // 서버 준비 직후 백그라운드로 1회 동기화한다.
        // 부팅 훅에서 await 하면 시작 배너 출력 전 timeout으로 서버가 죽을 수 있다.
        app.addHook("onReady", async () => {
            setTimeout(() => {
                const currentYear = new Date().getFullYear();
                void service.sync({
                    startYear: currentYear - 2,
                    endYear: currentYear + 1,
                }).catch((err) => {
                    app.log.error({ err }, "Holiday initial sync failed");
                });
            }, 0);
        });

        // cron 스케줄 등록
        const job = new Cron(
            config.cron,
            { timezone: "Asia/Seoul", protect: true },
            async () => {
                try {
                    await service.sync();
                } catch (err) {
                    app.log.error({ err }, "Holiday scheduled sync failed");
                }
            },
        );

        app.log.info(
            {
                cron: config.cron,
                next: job.nextRun()?.toISOString(),
            },
            "Holiday sync scheduled",
        );

        // 서버 종료 시 cron 정리
        app.addHook("onClose", async () => {
            job.stop();
        });
    },
    { name: "holidays-plugin" },
);
