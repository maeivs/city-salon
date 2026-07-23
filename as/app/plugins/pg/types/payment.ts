export interface ConfirmRequest {
    paymentKey: string;
    orderId: string;
    amount: number;
    method?: string;
    providerPayload?: Record<string, unknown>;
    idempotencyKey?: string;
}

export interface CancelRequest {
    paymentKey: string;
    cancelReason: string;
    cancelAmount?: number;
    originalAmount?: number;
    method?: string;
    currency?: string;
    taxFreeAmount?: number;
    refundReceiveAccount?: RefundAccount;
    idempotencyKey?: string;
}

export interface RefundAccount {
    bank: string;
    accountNumber: string;
    holderName: string;
}

export interface PaymentResult {
    paymentKey: string;
    orderId: string;
    orderName: string;
    status: string;
    method: string;
    totalAmount: number;
    balanceAmount: number;
    currency: string;
    requestedAt?: string;
    approvedAt?: string;
    type: string;
    country: string;
    isPartialCancelable: boolean;
    card?: CardInfo;
    virtualAccount?: VirtualAccountInfo;
    easyPay?: EasyPayInfo;
    receipt?: ReceiptInfo;
    failure?: FailureInfo;
    cancels?: CancelInfo[];
    _raw?: Record<string, unknown>;
}

export interface CardInfo {
    issuerCode: string;
    acquirerCode: string;
    number: string;
    installmentPlanMonths: number;
    cardType: string;
    ownerType: string;
    approveNo: string;
    amount: number;
    isInterestFree: boolean;
}

export interface VirtualAccountInfo {
    accountNumber: string;
    accountType: string;
    bankCode: string;
    customerName: string;
    dueDate: string;
    expired: boolean;
    settlementStatus: string;
    refundStatus: string;
}

export interface EasyPayInfo {
    provider: string;
    amount: number;
    discountAmount: number;
}

export interface ReceiptInfo {
    url: string;
}

export interface FailureInfo {
    code: string;
    message: string;
}

export interface CancelInfo {
    transactionKey: string;
    cancelReason: string;
    cancelAmount: number;
    canceledAt: string;
    cancelStatus: string;
    refundableAmount: number;
}

export interface CancelResult extends PaymentResult {
    latestCancel?: CancelInfo;
}

export interface OrderRequest {
    amount: number;
    orderName: string;
    currency?: string;
    customerName?: string;
    customerEmail?: string;
    provider?: string;
    accountSeq?: number;
    metadata?: Record<string, unknown>;
}

export interface OrderResponse {
    seq: number;
    orderId: string;
    amount: number;
    orderName: string;
    currency: string;
    status: string;
    clientKey?: string;
    successUrl: string;
    failUrl: string;
}

export interface ClientConfig {
    driver: string;
    clientKey: string;
    apiVersion?: string;
}

export const ORDER_STATUS = {
    CREATED: "created",
    READY: "ready",
    IN_PROGRESS: "in_progress",
    WAITING: "waiting",
    DONE: "done",
    CANCELED: "canceled",
    PARTIAL_CANCELED: "partial_canceled",
    ABORTED: "aborted",
    EXPIRED: "expired",
} as const;

export const WEBHOOK_STATUS = {
    RECEIVED: "received",
    PROCESSED: "processed",
    FAILED: "failed",
} as const;
