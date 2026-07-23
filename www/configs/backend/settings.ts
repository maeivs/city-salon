/**
 * 🔧 개발자 설정 파일
 * 로컬 AS 프록시 대상과 서비스 도메인 매핑은 이 파일에서 관리합니다.
 */

/** 개발 환경 AS 프록시 대상 (as/configs/server.json 의 포트와 일치, .env 의 ENTITY_APP_SERVER_URL 이 우선한다) */
export const ENTITY_APP_SERVER_URL = "http://127.0.0.1:48200";

/** 프로덕션 도메인 매핑 (접속 도메인 → API 도메인) — TODO: 도메인 확정 시 추가 */
export const productionDomains: { hostname: string; apiDomain: string }[] = [];
