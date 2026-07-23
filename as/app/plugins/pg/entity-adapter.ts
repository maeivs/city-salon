/**
 * PG 결제 Entity Adapter
 *
 * entity-server-client를 통해 DB entity CRUD를 PgQuerier 인터페이스로 어댑팅
 *
 * 엔티티:
 *   - pg_order       : 결제 주문
 *   - pg_cancel      : 결제 취소 이력
 *   - pg_webhook_log : 웹훅 수신 이력
 */

import { EntityServerApi } from "entity-client";
import type { PgQuerier } from "./types/index.ts";

const entityServer = new EntityServerApi();

function toNumber(v: unknown): number {
    if (v == null) return 0;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
}

export class PgEntityAdapter implements PgQuerier {
    async createOrder(data: Record<string, unknown>): Promise<number> {
        const resp = await entityServer.submit("pg_order", data);
        return ((resp as Record<string, unknown>).seq as number) ?? 0;
    }

    async getOrderById(
        orderId: string,
    ): Promise<Record<string, unknown> | null> {
        try {
            const resp = await entityServer.list("pg_order", {
                order_id: orderId,
                limit: 1,
            } as never);
            const items =
                ((
                    (resp as Record<string, unknown>).data as Record<
                        string,
                        unknown
                    >
                )?.items as Record<string, unknown>[]) ?? [];
            return items[0] ?? null;
        } catch {
            return null;
        }
    }

    async getOrderBySeq(seq: number): Promise<Record<string, unknown> | null> {
        try {
            const resp = await entityServer.get("pg_order", seq);
            return (
                ((resp as Record<string, unknown>).data as Record<
                    string,
                    unknown
                >) ?? null
            );
        } catch {
            return null;
        }
    }

    async updateOrder(
        seq: number,
        expectedStatus: string,
        patch: Record<string, unknown>,
    ): Promise<boolean> {
        let txId: string | undefined;
        try {
            // 트랜잭션으로 read-check-write 원자성 보장
            txId = await entityServer.transStart();
            const current = await this.getOrderBySeq(seq);
            if (!current || current.status !== expectedStatus) {
                await entityServer.transRollback(txId);
                return false;
            }
            await entityServer.submit(
                "pg_order",
                { seq, ...patch },
                { transactionId: txId },
            );
            await entityServer.transCommit(txId);
            return true;
        } catch {
            if (txId) {
                try {
                    await entityServer.transRollback(txId);
                } catch {
                    /* ignore */
                }
            }
            return false;
        }
    }

    async updateOrderDirect(
        seq: number,
        patch: Record<string, unknown>,
    ): Promise<void> {
        await entityServer.submit("pg_order", { seq, ...patch });
    }

    async createCancel(data: Record<string, unknown>): Promise<number> {
        const resp = await entityServer.submit("pg_cancel", data);
        return toNumber((resp as Record<string, unknown>).seq);
    }

    async createWebhookLog(data: Record<string, unknown>): Promise<number> {
        const resp = await entityServer.submit("pg_webhook_log", data);
        return toNumber((resp as Record<string, unknown>).seq);
    }

    async updateWebhookLog(
        seq: number,
        patch: Record<string, unknown>,
    ): Promise<void> {
        await entityServer.submit("pg_webhook_log", { seq, ...patch });
    }

    async findWebhookLog(
        paymentKey: string,
        eventType: string,
    ): Promise<Record<string, unknown> | null> {
        try {
            const resp = await entityServer.list("pg_webhook_log", {
                payment_key: paymentKey,
                event_type: eventType,
                status: "processed",
                limit: 1,
            } as never);
            const items =
                ((
                    (resp as Record<string, unknown>).data as Record<
                        string,
                        unknown
                    >
                )?.items as Record<string, unknown>[]) ?? [];
            return items[0] ?? null;
        } catch {
            return null;
        }
    }
}
