/**
 * @ehfuse/console-log-override 라이브러리가 브라우저에서
 * globalThis.process.env.NODE_ENV를 올바르게 감지할 수 있도록 폴리필
 *
 * 이 파일은 다른 모든 import보다 먼저 import되어야 합니다.
 */

if (typeof globalThis !== "undefined") {
    (globalThis as any).process = (globalThis as any).process || {};
    (globalThis as any).process.env = (globalThis as any).process.env || {};
}

export {};
