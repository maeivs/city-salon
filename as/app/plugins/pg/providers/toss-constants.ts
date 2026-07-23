export const TOSS_PAYMENTS_API_BASE_URL = "https://api.tosspayments.com";

export const TOSS_PAYMENTS_SDK_V2_STANDARD_URL =
    "https://js.tosspayments.com/v2/standard";

export const TOSS_PAYMENTS_API_PATHS = {
    confirm: "/v1/payments/confirm",
    payment: "/v1/payments",
    paymentByOrderId: "/v1/payments/orders",
} as const;

export const TOSS_PAYMENTS_METHODS = {
    CARD: "CARD",
    VIRTUAL_ACCOUNT: "VIRTUAL_ACCOUNT",
    TRANSFER: "TRANSFER",
    MOBILE_PHONE: "MOBILE_PHONE",
    EASY_PAY: "EASY_PAY",
    CULTURE_GIFT_CERTIFICATE: "CULTURE_GIFT_CERTIFICATE",
} as const;

export const TOSS_PAYMENTS_STATUSES = {
    READY: "READY",
    IN_PROGRESS: "IN_PROGRESS",
    WAITING_FOR_DEPOSIT: "WAITING_FOR_DEPOSIT",
    DONE: "DONE",
    CANCELED: "CANCELED",
    PARTIAL_CANCELED: "PARTIAL_CANCELED",
    ABORTED: "ABORTED",
    EXPIRED: "EXPIRED",
} as const;

export const TOSS_PAYMENTS_WEBHOOK_EVENTS = {
    PAYMENT_STATUS_CHANGED: "PAYMENT_STATUS_CHANGED",
    DEPOSIT_CALLBACK: "DEPOSIT_CALLBACK",
    CANCEL_STATUS_CHANGED: "CANCEL_STATUS_CHANGED",
} as const;

export type TossPaymentsMethod =
    (typeof TOSS_PAYMENTS_METHODS)[keyof typeof TOSS_PAYMENTS_METHODS];

export type TossPaymentsStatus =
    (typeof TOSS_PAYMENTS_STATUSES)[keyof typeof TOSS_PAYMENTS_STATUSES];

export type TossPaymentsWebhookEvent =
    (typeof TOSS_PAYMENTS_WEBHOOK_EVENTS)[keyof typeof TOSS_PAYMENTS_WEBHOOK_EVENTS];
