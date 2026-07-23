/**
 * example 서비스
 *
 * TODO: 비즈니스 로직을 여기에 구현합니다.
 */

import { logger } from "@system/api";
import type { ExampleConfig } from "./types/index.ts";
import { ExampleEntityAdapter, type ExampleQuerier } from "./entity-adapter.ts";

export class ExampleService {
    private readonly config: ExampleConfig;
    private readonly querier: ExampleQuerier;

    constructor(config: ExampleConfig) {
        this.config = config;
        this.querier = new ExampleEntityAdapter();
    }

    /** 서비스를 시작한다 */
    async start(): Promise<void> {
        // TODO: 초기화 로직
        logger.info("ExampleService started");
    }

    /** 서비스를 정지한다 */
    stop(): void {
        // TODO: 정리 로직
        logger.info("ExampleService stopped");
    }
}
