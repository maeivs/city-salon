/**
 * 환경 설정 모듈
 *
 * 사용법:
 *   import { BASE_URL, isProduction } from "@configs/backend";
 *
 * 개발자 설정 수정:
 *   configs/backend/settings.ts 파일을 수정하세요.
 */

// 🔧 개발 설정 (수정 가능)
export { productionDomains } from "./settings";
export { ENTITY_APP_SERVER_URL } from "./settings";

// ⚙️ 내부 로직 (자동 처리)
export {
    allowedAccounts,
    getCurrentAccount,
    getAppServerTarget,
    generateSiteUrl,
    BASE_URL,
    API_URL,
    APP_ENV,
    isProduction,
    isDevelopment,
    isTest,
    PROXY_CONFIG,
} from "./runtime";
