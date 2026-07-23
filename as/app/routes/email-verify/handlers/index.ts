/**
 * email-verify handlers 진입점
 *
 * 기능별로 분리된 핸들러를 한 곳에서 re-export.
 *
 *   handlers/
 *     utils.ts      — rate limit, JWT 파싱, account 조회 헬퍼
 *     send.ts       — POST /send  +  sendVerification (외부 재사용 가능)
 *     confirm.ts    — POST /confirm
 *     activate.ts   — GET  /activate
 *     status.ts     — GET  /status
 *     change.ts     — POST /change
 *     index.ts      — (이 파일) 일괄 re-export
 */

export { createSendHandler, sendVerification } from "./send.ts";
export { createConfirmHandler } from "./confirm.ts";
export { createActivateHandler } from "./activate.ts";
export { createStatusHandler } from "./status.ts";
export { createChangeHandler } from "./change.ts";
