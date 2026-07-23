/**
 * OCR 커스텀 에러 타입 + HTTP 상태코드 매핑
 */

export class OcrError extends Error {
    /** OCR 에러를 메시지와 코드로 생성한다 */
    constructor(
        message: string,
        public readonly code: string,
    ) {
        super(message);
        this.name = "OcrError";
    }
}

export const ERR_FILE_TOO_LARGE = "FILE_TOO_LARGE";
export const ERR_UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT";
export const ERR_QUOTA_EXCEEDED = "QUOTA_EXCEEDED";
export const ERR_DRIVER_FAILED = "DRIVER_FAILED";
export const ERR_TEMPLATE_NOT_FOUND = "TEMPLATE_NOT_FOUND";
export const ERR_INVALID_DOC_TYPE = "INVALID_DOC_TYPE";
export const ERR_RESULT_NOT_FOUND = "RESULT_NOT_FOUND";
export const ERR_ASYNC_QUEUE_FULL = "ASYNC_QUEUE_FULL";

/** OCR 에러 코드에 따른 HTTP 상태코드를 반환한다 */
export function httpStatusFromError(err: unknown): number {
    if (!(err instanceof OcrError)) return 500;
    switch (err.code) {
        case ERR_FILE_TOO_LARGE:
        case ERR_UNSUPPORTED_FORMAT:
        case ERR_INVALID_DOC_TYPE:
            return 400;
        case ERR_RESULT_NOT_FOUND:
            return 404;
        case ERR_QUOTA_EXCEEDED:
            return 429;
        case ERR_ASYNC_QUEUE_FULL:
            return 503;
        default:
            return 500;
    }
}
