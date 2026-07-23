import type {
    ConfirmRequest,
    CancelRequest,
    PaymentResult,
    CancelResult,
} from "./payment.ts";

export interface PgClient {
    name(): string;
    confirmPayment(
        ctx: AbortSignal | null,
        req: ConfirmRequest,
    ): Promise<PaymentResult>;
    cancelPayment(
        ctx: AbortSignal | null,
        req: CancelRequest,
    ): Promise<CancelResult>;
    getPayment(
        ctx: AbortSignal | null,
        paymentKey: string,
    ): Promise<PaymentResult>;
    verifyWebhook(
        ctx: AbortSignal | null,
        payload: Buffer,
        signature: string,
    ): Promise<boolean>;
}

export interface PgQuerier {
    createOrder(data: Record<string, unknown>): Promise<number>;
    getOrderById(orderId: string): Promise<Record<string, unknown> | null>;
    getOrderBySeq(seq: number): Promise<Record<string, unknown> | null>;
    updateOrder(
        seq: number,
        expectedStatus: string,
        patch: Record<string, unknown>,
    ): Promise<boolean>;
    updateOrderDirect(
        seq: number,
        patch: Record<string, unknown>,
    ): Promise<void>;
    createCancel(data: Record<string, unknown>): Promise<number>;
    createWebhookLog(data: Record<string, unknown>): Promise<number>;
    updateWebhookLog(
        seq: number,
        patch: Record<string, unknown>,
    ): Promise<void>;
    findWebhookLog(
        paymentKey: string,
        eventType: string,
    ): Promise<Record<string, unknown> | null>;
}
