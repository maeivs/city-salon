/**
 * DispatchWorker — 비동기 OCR 큐 + 워커 (Node.js setInterval 패턴)
 * Go goroutine+channel 패턴을 Node.js 싱글 스레드용으로 변환
 */

import type {
    DispatchJob,
    RecognizeOptions,
    OcrEntityStore,
    OcrResult,
} from "./types/index.ts";
import { OcrError, ERR_ASYNC_QUEUE_FULL } from "./errors.ts";

export class DispatchWorker {
    private readonly queue: DispatchJob[] = [];
    private readonly queueSize: number;
    private readonly concurrency: number;
    private running = 0;
    private timer: ReturnType<typeof setInterval> | null = null;
    private stopped = false;

    // OcrService의 recognize 함수를 받아 사용
    private recognizeFn:
        | ((data: Buffer, opts: RecognizeOptions) => Promise<OcrResult>)
        | null = null;
    private entityStore: OcrEntityStore | null = null;

    /** 비동기 OCR 큐를 지정된 큐 크기와 동시성으로 초기화한다 */
    constructor(queueSize: number, concurrency: number) {
        this.queueSize = queueSize > 0 ? queueSize : 50;
        this.concurrency = concurrency > 0 ? concurrency : 2;
    }

    /** recognize 함수 및 entityStore 주입 */
    init(
        recognizeFn: (
            data: Buffer,
            opts: RecognizeOptions,
        ) => Promise<OcrResult>,
        entityStore: OcrEntityStore | null,
    ): void {
        this.recognizeFn = recognizeFn;
        this.entityStore = entityStore;
    }

    /** 워커 시작 (200ms 간격 폴링) */
    start(): void {
        this.stopped = false;
        this.timer = setInterval(() => this.tick(), 200);
        console.log(
            `[INFO] OCR dispatch workers started (concurrency=${this.concurrency})`,
        );
    }

    /** 워커 종료 */
    stop(): void {
        this.stopped = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** 작업 큐에 추가 → 작업 ID 반환 */
    submit(data: Buffer, opts: RecognizeOptions): string {
        if (this.queue.length >= this.queueSize) {
            throw new OcrError(
                `async processing queue is full: queue size ${this.queueSize}`,
                ERR_ASYNC_QUEUE_FULL,
            );
        }
        const id = crypto.randomUUID();
        this.queue.push({
            id,
            data,
            opts,
            createdAt: new Date().toISOString(),
        });
        return id;
    }

    /** 큐에서 작업을 가져와 처리한다 */
    private tick(): void {
        while (
            this.running < this.concurrency &&
            this.queue.length > 0 &&
            !this.stopped
        ) {
            const job = this.queue.shift()!;
            this.running++;
            this.processJob(job).finally(() => {
                this.running--;
            });
        }
    }

    /** 단일 OCR 작업을 실행하고 결과를 저장한다 */
    private async processJob(job: DispatchJob): Promise<void> {
        if (!this.recognizeFn) return;

        try {
            // 상태: processing
            if (this.entityStore) {
                await this.entityStore
                    .updateResultState(job.id, "processing", null, "")
                    .catch(() => {});
            }

            const result = await this.recognizeFn(job.data, job.opts);

            // 상태: completed
            if (this.entityStore) {
                await this.entityStore
                    .updateResultState(job.id, "completed", result, "")
                    .catch(() => {});
            }
            console.log(
                `[INFO] OCR async job ${job.id} completed (parse=${result.parseMethod} conf=${result.parseConfidence.toFixed(2)})`,
            );
        } catch (err) {
            console.log(`[ERROR] OCR async job ${job.id} failed: ${err}`);
            if (this.entityStore) {
                const msg = err instanceof Error ? err.message : String(err);
                await this.entityStore
                    .updateResultState(job.id, "failed", null, msg)
                    .catch(() => {});
            }
        }
    }
}
