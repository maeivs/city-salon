/**
 * ⚙️ 내부 로직 파일
 * 설정값 기반으로 자동 처리됩니다. 수정하지 마세요.
 */

import { SITE_URL } from "../site-info";
import { ENTITY_APP_SERVER_URL, productionDomains } from "./settings";

// --- 파생 설정 ---

/** 허용된 개발자 계정 목록 */
export const allowedAccounts: string[] = [];

// --- 도메인 감지 함수 ---

/** 브라우저 환경에서 현재 hostname 가져오기 */
const getBrowserHostname = (): string | null => {
    try {
        if (typeof globalThis !== "undefined" && (globalThis as any).location) {
            return (globalThis as any).location.hostname;
        }
    } catch (error) {
        console.log("hostname 감지 실패:", error);
    }
    return null;
};

/** 현재 사용자 계정명 감지 (개발 환경 AS 프록시용) */
export const getCurrentAccount = (): string => {
    // 1. 브라우저 환경: URL hostname으로 API 도메인 결정 (우선)
    const hostname = getBrowserHostname();
    if (hostname) {
        const prodDomain = productionDomains.find((d) => d.hostname === hostname);
        if (prodDomain) {
            return "server";
        }
    }

    return "server";
};

/** 프로덕션 도메인 매핑에서 현재 호스트에 맞는 API 도메인 찾기 */
const getProductionApiDomain = (): string => {
    const hostname = getBrowserHostname();
    if (hostname) {
        const matched = productionDomains.find((d) => d.hostname === hostname);
        if (matched) {
            console.log("프로덕션 도메인 매칭:", hostname, "→", matched.apiDomain);
            return matched.apiDomain;
        }
    }
    return SITE_URL; // 기본값
};

/** 현재 호스트 기준 사이트 URL 생성 */
export const generateSiteUrl = (): string => {
    // 먼저 프로덕션 도메인 매핑 확인
    const productionDomain = getProductionApiDomain();
    if (productionDomain !== SITE_URL) {
        return productionDomain;
    }

    return SITE_URL;
};

/** 개발 환경에서 사용할 AS 프록시 대상 주소 */
export const getAppServerTarget = (): string => ENTITY_APP_SERVER_URL;

// --- BASE_URL 및 환경 설정 ---

/** API 요청 기본 URL (런타임에 결정) */
const getBaseUrl = (): string => {
    // 브라우저 환경에서는 항상 런타임에 결정
    const hostname = getBrowserHostname();
    if (hostname) {
        // 프로덕션 도메인 체크
        const prodDomain = productionDomains.find((d) => d.hostname === hostname);
        if (prodDomain) {
            return prodDomain.apiDomain;
        }

        // 기본값: 현재 origin 사용
        if (typeof globalThis !== "undefined" && (globalThis as any).location) {
            return (globalThis as any).location.origin;
        }
    }

    // Node.js/빌드 환경 (개발 모드)
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
        return SITE_URL;
    }

    return SITE_URL; // 기본값
};

export const BASE_URL = getBaseUrl();

/** API 서버 URL (엔티티 서버 전용, BASE_URL과 다를 수 있음) */
const getApiUrl = (): string => {
    return "/api";
};

export const API_URL = getApiUrl();

/** 앱 환경 문자열 */
export const APP_ENV = process.env.NODE_ENV || "development";

// 디버깅용 로그
console.log("🏗️ BASE_URL Configuration:", {
    BASE_URL,
    APP_SERVER_TARGET: getAppServerTarget(),
    APP_ENV,
    "process.env.NODE_ENV": process.env.NODE_ENV,
    "process.env.HOME": process.env.HOME,
});

// --- 환경 체크 함수 ---

export const isProduction = () => APP_ENV === "production";
export const isDevelopment = () => APP_ENV !== "production";
export const isTest = () => APP_ENV === "test";

// --- Vite 프록시 설정 ---

/** Vite 개발 서버 프록시 설정 */
export const PROXY_CONFIG: Record<string, any> = {};
