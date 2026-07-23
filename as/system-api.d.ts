import * as kysely from 'kysely';
export { sql } from 'kysely';
import pino from 'pino';
import { EntityServerApi } from 'entity-client';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Cron } from 'croner';
import { z } from 'zod';

interface ApiResponse<T = unknown> {
    ok: boolean;
    data?: T;
    error?: string;
    requestId?: string;
}
/** 성공 응답 객체를 생성한다. */
declare function ok<T>(data: T, requestId?: string): ApiResponse<T>;
/** 실패 응답 객체를 생성한다. */
declare function fail(error: string, requestId?: string): ApiResponse;

declare const serverConfig: {
    baseUrl: string;
    port: number;
    host: string;
    namespace: string;
    logging: {
        error: {
            enabled: boolean;
            filename: string;
            frequency: "daily" | "hourly";
            maxFiles: number;
            maxSize: string;
        };
        level: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
        logDir: string;
        access: {
            enabled: boolean;
            filename: string;
            frequency: "daily" | "hourly";
            maxFiles: number;
            maxSize: string;
        };
        app: {
            enabled: boolean;
            filename: string;
            frequency: "daily" | "hourly";
            maxFiles: number;
            maxSize: string;
        };
    };
};

declare const logger: pino.Logger<never, boolean>;

/**
 * 로그 포맷 유틸리티 — ANSI 색상 포맷팅
 *
 * 로거 메시지에 카테고리·색상·메타 텍스트를 적용합니다.
 * dev 모드에서만 색상이 활성화됩니다.
 */
declare const logFmt: {
    cache(driver: string, meta?: string): string;
    db(name: string, meta?: string): string;
    hooks(text: string, meta?: string): string;
    plugin(pathText: string, meta?: string): string;
    route(pathText: string, meta?: string): string;
    schedule(pathText: string, meta?: string): string;
    server(url: string, mode: string): string;
    error(message: string, meta?: string): string;
};

/**
 * 환경변수 검증 — Zod 스키마
 *
 * dotenv 는 server.ts 에서 이미 로드됨 (이 모듈이 serverConfig 를 import 하므로 순서 보장)
 */

declare const env: {
    NODE_ENV: "development" | "production" | "test";
    ENTITY_SERVER_URL: string;
    ENTITY_API_KEY: string;
    ENTITY_HMAC_SECRET: string;
    JWT_SECRET: string;
};

type EnsurePluginEntitiesOptions = {
    force?: boolean;
};
/**
 * 플러그인 디렉토리의 entities/*.json 을 읽어 엔티티 서버에 등록한다.
 * import.meta.url, __dirname, 절대경로 모두 허용한다.
 * 이미 batchEnsureAllPluginEntities 로 처리된 디렉토리는 즉시 반환한다.
 *
 * @param pluginDirOrUrl 플러그인 디렉토리 또는 파일 URL (import.meta.url 등)
 */
declare function ensurePluginEntities(pluginDirOrUrl: string, options?: EnsurePluginEntitiesOptions | boolean): Promise<void>;

/**
 * 범용 암호화 유틸리티 — AES-CBC, 3DES-CBC, HMAC-SHA256
 *
 * 본인인증(identity) 등 여러 확장모듈에서 재사용한다.
 */
/** AES-CBC 모드로 데이터를 암호화한다 (Base64 반환) */
declare function encryptAesCbc(plaintext: Buffer, key: Buffer, iv: Buffer): string;
/** AES-CBC 모드로 데이터를 복호화한다 */
declare function decryptAesCbc(ciphertext: string, key: Buffer, iv: Buffer): Buffer;
/** 3DES-CBC 모드로 데이터를 암호화한다 (Base64 반환) */
declare function encrypt3DesCbc(plaintext: Buffer, key: Buffer, iv: Buffer): string;
/** 3DES-CBC 모드로 데이터를 복호화한다 */
declare function decrypt3DesCbc(ciphertext: string, key: Buffer, iv: Buffer): Buffer;
/** HMAC-SHA256 값을 Base64로 반환한다 */
declare function hmacSha256(data: string | Buffer, key: string | Buffer): string;
/** HMAC-SHA256 값을 hex 문자열로 반환한다 */
declare function hmacSha256Hex(data: string | Buffer, key: string | Buffer): string;
/** SHA-256 해시를 hex 문자열로 반환한다 */
declare function sha256Hex(data: string): string;
/** SHA-256 해시를 Buffer로 반환한다 */
declare function sha256(data: string): Buffer;

/**
 * Push Service 전역 참조 — 순환 참조 방지용 내부 모듈
 *
 * plugins/push/index.ts 에서 서비스 시작 시 _setPushServiceRef() 를 호출한다.
 * system/push/sender.ts 에서 _getPushService() 로 서비스를 사용한다.
 */
interface PushServiceRef {
    enqueueJob(job: {
        account_seq: number;
        title: string;
        body: string;
        data?: Record<string, string>;
        ref_entity?: string;
        ref_seq?: number;
        provider?: string;
    }): Promise<void>;
}
declare function _setPushServiceRef(svc: PushServiceRef | null): void;

/**
 * EntityHook 인터페이스 — 엔티티 CRUD 전/후 훅
 *
 * before* — 예외 발생 시 프록시 요청을 차단 (클라이언트에 에러 반환)
 * after*  — 예외 발생 시 로그만 남기고 무시 (이미 Entity Server에 반영됨)
 *
 * Submit 훅은 old/new 컨텍스트를 지원한다:
 *   beforeSubmit — { old: 수정 전 데이터 | null(신규), new: 요청 데이터 }
 *   afterSubmit  — { old: 수정 전 데이터 | null(신규), new: 저장된 결과 데이터 }
 */
interface JwtUserInfo {
    sub: number;
    email: string;
    role: string;
    license_seq?: number;
    [key: string]: unknown;
}
/** JWT 페이로드에서 정규화된 로그인 계정 정보 */
interface AccountInfo {
    seq: number;
    account_seq: number;
    license_seq: number;
    name: string;
    email: string;
    role: string;
    rbac_role: string;
    is_admin: boolean;
    [key: string]: unknown;
}
/** submit 훅에 전달되는 old/new 컨텍스트 */
interface SubmitContext<T = any> {
    /** 수정 전 데이터 (신규 INSERT 시 null) */
    old: T | null;
    /** 요청 데이터 (beforeSubmit) 또는 저장된 결과 (afterSubmit) */
    new: T;
}
/** delete 훅에 전달되는 컨텍스트 */
interface DeleteContext<T = any> {
    /** 삭제 대상 시퀀스 */
    seq: number;
    /** 삭제 대상 데이터 (조회 실패 시 null) */
    data: T | null;
}
interface EntityHook {
    /** get 전: 접근 제어. false 반환 또는 throw 시 조회 차단 */
    beforeGet?(entity: string, seq: number, user: JwtUserInfo): Promise<boolean>;
    /** get 후: 데이터 마스킹/가공. 반환값이 클라이언트 응답이 됨 */
    afterGet?(entity: string, data: any, user: JwtUserInfo): Promise<any>;
    /** submit 전: 데이터 변환/검증. ctx.new를 변경하여 반환하면 해당 데이터로 submit */
    beforeSubmit?(entity: string, ctx: SubmitContext, user: JwtUserInfo): Promise<any>;
    /** submit 후: 알림, 로깅 등 사이드이펙트. ctx.old/ctx.new로 변경 전후 비교 가능 */
    afterSubmit?(entity: string, ctx: SubmitContext, user: JwtUserInfo): Promise<any>;
    /** delete 전: ctx.data로 삭제 대상 확인, false 반환 시 삭제 차단 */
    beforeDelete?(entity: string, ctx: DeleteContext, user: JwtUserInfo): Promise<boolean>;
    /** delete 후: ctx.data로 삭제된 데이터 확인, 정리/알림 등 */
    afterDelete?(entity: string, ctx: DeleteContext, user: JwtUserInfo): Promise<void>;
    /** list 전: 필터 파라미터 변환/추가 */
    beforeList?(entity: string, params: any, user: JwtUserInfo): Promise<any>;
    /** list 후: 응답 데이터 가공 */
    afterList?(entity: string, result: any, user: JwtUserInfo): Promise<any>;
}

/** 요청별 AsyncLocalStorage 컨텍스트 */
interface RequestContext {
    account: AccountInfo | null;
    requestClient: EntityServerApi | undefined;
}
/** 요청 컨텍스트를 현재 비동기 흐름에 설정한다 */
declare function enterRequestContext(account: AccountInfo | null): void;
/** 현재 비동기 흐름의 요청 컨텍스트를 반환한다 */
declare function getRequestContext(): RequestContext | undefined;
/**
 * 엔티티 변경(submit/delete) 리스너 — 모든 AS submit/delete 경로(라우트 직접 호출 + entity-interceptor)는
 * 이 Proxy 를 거치므로, 도메인(app/)이 등록한 리스너가 누락 없이 호출된다. 도메인 캐시(빈소현황 등)
 * 무효화를 system 코어가 도메인을 모른 채 단일 chokepoint 로 위임하기 위한 후크다.
 */
type EntityMutationOp = "submit" | "delete";
interface EntityMutationEvent {
    entity: string;
    seq: number;
    op: EntityMutationOp;
    licenseSeq: number | null;
    data: Record<string, unknown> | null;
}
type EntityMutationListener = (event: EntityMutationEvent) => void;
/** 엔티티 변경 리스너를 등록한다(app 부트스트랩에서 1회). */
declare function registerEntityMutationListener(listener: EntityMutationListener): void;
/**
 * Proxy — 로그인 요청이면 per-request 클라이언트, 아니면 기본 클라이언트 사용.
 *
 * submit/delete 는 엔티티 훅(before/after)도 여기서 실행한다. entity-interceptor(범용
 * /v1/entity 라우트)만 훅을 태우면 커스텀 라우트 핸들러가 entityServer.submit 으로 저장하는
 * 경로가 전부 훅을 우회하게 되므로(uuid 발급·접수번호·도메인 캐시 무효화 누락 사고),
 * 모든 AS 쓰기 경로가 지나는 이 Proxy 를 유일한 훅 chokepoint 로 삼는다.
 * - interceptor 는 자체 실행 후 {skipHooks:true} 로 호출하므로 이중 실행되지 않는다.
 * - 훅 내부의 재저장(entityServer.submit)도 훅을 다시 타므로, 도메인 훅은 멱등 가드
 *   (예: ctx.old 판별, in-flight 가드)를 갖춰야 한다.
 * - 한계: transactionSubmit(다건 1트랜잭션) 의 op 들은 훅을 타지 않는다.
 */
declare const entityServer: EntityServerApi;

interface AuthTokenConfig {
    jwt_access_ttl_sec: number;
    jwt_refresh_ttl_sec: number;
    jwt_issuer: string;
}
interface AuthTokenPair {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    session_id: string;
}
interface AuthSessionClaims {
    sub?: number | string;
    email?: string;
    name?: string;
    role?: string;
    rbac_role?: string;
    license_seq?: number;
    session_id?: string;
    jti?: string;
    exp?: number;
    iat?: number;
    [key: string]: unknown;
}
/** JWT 토큰 페이로드를 검증 없이 디코드한다. */
declare function decodeAuthTokenClaims(token?: string | null): AuthSessionClaims | null;
/** 요청 Authorization 헤더에서 세션 ID를 추출한다. */
declare function extractSessionIdFromRequest(req: FastifyRequest): string | null;
/** 인증 토큰 쌍을 같은 session_id로 발급한다. */
declare function issueAuthTokenPair(account: {
    seq?: unknown;
    email?: unknown;
    name?: unknown;
    role?: unknown;
    rbac_role?: unknown;
    license_seq?: unknown;
}, cfg: AuthTokenConfig, sessionId?: string): Promise<AuthTokenPair>;
/** 로그인 토큰 기준 활성 세션을 등록하고 초과 세션을 종료한다. */
declare function registerAuthenticatedSession(req: FastifyRequest, accessToken?: string | null): Promise<void>;
/** 현재 요청의 세션을 비활성화한다. */
declare function revokeAuthenticatedSession(req: FastifyRequest, reason?: string): Promise<void>;

/**
 * 이메일 템플릿 엔진
 *
 * Go 엔티티서버 `internal/smtp/template.go`에서 포팅.
 *
 * 기능:
 *  - `${variable}` 패턴 치환 (Go 동일 정규식)
 *  - `${variable|기본값}` 폴백 지원
 *  - 공유 레이아웃 래핑 — plugins/smtp/templates/layout.html 단일 파일로 관리
 *    (setSharedLayout 으로 초기화, smtp 플러그인이 앱 시작 시 자동 호출)
 *  - 파일 일회 로드 + 인메모리 캐시
 */
/**
 * 공유 레이아웃 파일 경로를 설정한다.
 * smtp 플러그인(plugins/smtp/index.ts)이 앱 시작 시 호출한다.
 */
declare function setSharedLayout(layoutFilePath: string): void;
/**
 * 템플릿 디렉토리를 설정한다.
 * @deprecated 각 플러그인/라우트에서 renderTemplate 의 dir 인자를 직접 전달하세요.
 */
declare function setTemplateDir(dir: string): void;
/**
 * 변수 맵으로 문자열 내 `${key}` / `${key|default}` 를 치환한다.
 */
declare function replaceVars(template: string, data: Record<string, unknown>): string;
/**
 * 템플릿을 렌더링한다.
 *
 * 콘텐츠 HTML을 렌더링한 뒤 공유 레이아웃(plugins/smtp/templates/layout.html)으로 감싼다.
 *
 * @param name - 템플릿 상대경로 (확장자 제외, 예: "password_reset")
 * @param data - 치환용 변수 맵
 * @param dir  - 템플릿 디렉토리 절대경로 (미지정 시 setTemplateDir 값 사용)
 * @returns 렌더링된 HTML 또는 null (템플릿 미존재)
 */
declare function renderTemplate(name: string, data: Record<string, unknown>, dir?: string): string | null;
/**
 * 인라인 문자열에 변수를 치환한다 (파일 로딩 없이).
 */
declare function renderString(template: string, data: Record<string, unknown>): string;
/** 캐시를 초기화한다 (테스트/리로드용) */
declare function clearTemplateCache(): void;

/**
 * SMTP 발송 유틸리티
 *
 * 게이트웨이에서 엔티티서버 SMTP API (/v1/smtp/send)를 경유하여 이메일을 발송한다.
 * 로컬 템플릿 렌더링 후 body_html을 전달하거나,
 * 엔티티서버 측 템플릿을 사용할 수도 있다.
 */
interface SendEmailParams {
    /** 수신자 이메일 (1개 이상 필수) */
    to: string[];
    /** 제목 */
    subject: string;
    /** 게이트웨이 로컬 템플릿명 (확장자 제외) */
    templateName?: string;
    /** 템플릿 파일이 위치한 절대경로 디렉토리 (미지정 시 전역 setTemplateDir 사용) */
    templateDir?: string;
    /** 템플릿 변수 */
    templateData?: Record<string, unknown>;
    /** 직접 HTML 본문 (templateName 대신 사용) */
    bodyHtml?: string;
    /** 텍스트 본문 */
    bodyText?: string;
    /** CC */
    cc?: string[];
    /** BCC */
    bcc?: string[];
    /** 발신자 */
    from?: string;
    /** Reply-To */
    replyTo?: string;
    /** 참조 엔티티 */
    refEntity?: string;
    /** 참조 seq */
    refSeq?: number;
}
/**
 * 이메일을 발송한다.
 *
 * templateName이 지정되면 게이트웨이 로컬 템플릿을 렌더링하여 body_html로 전달.
 * bodyHtml이 직접 지정되면 그대로 전달.
 *
 * @returns 발송 큐 등록 seq
 */
declare function sendEmail(params: SendEmailParams): Promise<number>;

/**
 * 푸시 발송 유틸리티
 *
 * 앱서버 PushService 를 직접 사용하여 push_log 큐에 등록한다.
 * Go 엔티티서버 Push API 를 더 이상 경유하지 않는다.
 */
interface SendPushParams {
    /** 수신 계정 seq 배열 (1개 이상 필수) */
    accountSeqs: number[];
    /** 푸시 제목 */
    title: string;
    /** 푸시 본문 */
    body: string;
    /** 커스텀 페이로드 */
    data?: Record<string, string>;
    /** 참조 엔티티 */
    refEntity?: string;
    /** 참조 seq */
    refSeq?: number;
    /** 특정 provider 지정 */
    provider?: string;
}
interface SendPushAllParams {
    /** 푸시 제목 */
    title: string;
    /** 푸시 본문 */
    body: string;
    /** 커스텀 페이로드 */
    data?: Record<string, string>;
    /** 참조 엔티티 */
    refEntity?: string;
    /** 참조 seq */
    refSeq?: number;
    /** 특정 provider 지정 */
    provider?: string;
}
/**
 * 특정 계정(들)에 푸시를 발송한다.
 * @returns 큐에 등록된 계정 수
 */
declare function sendPush(params: SendPushParams): Promise<number>;
/**
 * 전체 push 활성 유저에 푸시를 발송한다.
 * account_device 엔티티에서 push_enabled=true 계정을 조회하여 일괄 발송한다.
 */
declare function sendPushAll(params: SendPushAllParams): Promise<{
    sent: number;
    failed: number;
}>;

/**
 * 훅 실행기 — 등록된 엔티티별 훅을 실행합니다.
 *
 * 에러 처리 정책:
 *   before* — 예외 시 throw → error-handler.ts 가 400/500 반환 (차단)
 *   after*  — 예외 시 로그만 남기고 원본 result 반환 (무시)
 */

/** 엔티티에 특정 이름의 훅이 등록되어 있는지 확인한다 */
declare function hasSpecificHook(entity: string, hookName: keyof EntityHook): boolean;
/**
 * submit 전 훅을 실행한다.
 * ctx.new를 변경한 반환값이 실제 submit 데이터가 된다.
 */
declare function runBeforeSubmit(entity: string, ctx: SubmitContext, user: JwtUserInfo): Promise<any>;
/**
 * submit 후 훅을 실행한다.
 * ctx.old/ctx.new로 변경 전후 비교가 가능하다.
 */
declare function runAfterSubmit(entity: string, ctx: SubmitContext, user: JwtUserInfo): Promise<any>;

/**
 * 회원 탈퇴 훅 레지스트리
 *
 * 플러그인/라우트가 활성화될 때 자신의 탈퇴 cleanup 을 등록한다.
 * withdraw/handlers.ts 에서 Go 프록시 전에 runWithdrawHooks() 를 호출한다.
 *
 * 사용 예:
 *   // plugins/oauth/index.ts (enabled 체크 후)
 *   registerWithdrawHook("oauth", async (accountSeq) => {
 *       await entityServer.deleteWhere("account_oauth", { account_seq: accountSeq });
 *   });
 */
type WithdrawHookFn = (accountSeq: number) => Promise<void>;
/**
 * 탈퇴 cleanup 훅을 등록한다.
 * @param name  - 플러그인/라우트 식별자 (중복 등록 방지용)
 * @param fn    - account_seq를 받아 관련 데이터를 삭제하는 비동기 함수
 */
declare function registerWithdrawHook(name: string, fn: WithdrawHookFn): void;
/**
 * 등록된 모든 탈퇴 훅을 순서대로 실행한다.
 * 개별 훅 실패는 로그 후 계속 진행한다 (탈퇴 자체를 막지 않음).
 */
declare function runWithdrawHooks(accountSeq: number, log: (msg: string, extra?: Record<string, unknown>) => void): Promise<void>;

/**
 * 커스텀 에러 클래스
 */
/** 애플리케이션 공통 베이스 에러입니다. */
declare class AppError extends Error {
    readonly statusCode: number;
    readonly code?: string | undefined;
    constructor(message: string, statusCode?: number, code?: string | undefined);
}
/** 잘못된 요청 입력을 나타내는 400 에러입니다. */
declare class BadRequestError extends AppError {
    constructor(message?: string);
}
/** 인증 실패를 나타내는 401 에러입니다. */
declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
/** 권한 부족을 나타내는 403 에러입니다. */
declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
/** 리소스를 찾지 못했음을 나타내는 404 에러입니다. */
declare class NotFoundError extends AppError {
    constructor(message?: string);
}
/** 리소스 충돌을 나타내는 409 에러입니다. */
declare class ConflictError extends AppError {
    constructor(message?: string);
}
/** 유효성 검증 실패 상세를 담는 422 에러입니다. */
declare class ValidationError extends AppError {
    readonly details?: unknown | undefined;
    constructor(message?: string, details?: unknown | undefined);
}

declare const REALTIME_PROTOCOL_VERSION = 1;
type RealtimeMessageType = "hello" | "event" | "notification" | "message" | "chat" | "ack" | "error" | "ping" | "pong" | "subscribe" | "unsubscribe";
interface RealtimeEnvelope<T = unknown> {
    v: typeof REALTIME_PROTOCOL_VERSION;
    id: string;
    ts: string;
    type: RealtimeMessageType;
    channel: string;
    event: string;
    data?: T;
    meta?: Record<string, unknown>;
    reply_to?: string;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}
interface RealtimePublishInput<T = unknown> {
    id?: string;
    ts?: string;
    type?: Exclude<RealtimeMessageType, "subscribe" | "unsubscribe">;
    channel?: string;
    event: string;
    data?: T;
    meta?: Record<string, unknown>;
    reply_to?: string;
    license_seq?: number;
    exclude_connection_id?: string;
}
interface RealtimeStats {
    totalConnections: number;
    accountCount: number;
}

/** 특정 계정의 모든 연결에 realtime 이벤트를 전파한다. */
declare function sendRealtimeToAccount(accountSeq: number, input: RealtimePublishInput): number;
/** 특정 라이선스의 모든 연결에 realtime 이벤트를 전파한다. */
declare function sendRealtimeToLicense(licenseSeq: number, input: RealtimePublishInput): number;
/** 특정 연결 하나에만 realtime 이벤트를 전파한다. */
declare function sendRealtimeToConnection(connectionId: string, input: RealtimePublishInput): boolean;
/** 전체 연결 또는 입력 범위에 맞는 realtime 이벤트를 전파한다. */
declare function broadcastRealtime(input: RealtimePublishInput): number;
/** 현재 realtime 연결 통계 정보를 반환한다. */
declare function getRealtimeStats(): RealtimeStats;

/** PC 가 로컬 VCAT 결제를 마친 뒤 result 라우트로 돌려주는 결과 페이로드. */
interface TerminalPaymentResult {
    ok: boolean;
    payload?: Record<string, unknown>;
    message?: string;
}
/** 단말연동 PC(VCAT 설치) 연결을 라이선스 레지스트리에 등록한다. */
declare function registerTerminalConnection(licenseSeq: number, connectionId: string): void;
/**
 * 단말연동 PC 연결을 모든 라이선스 레지스트리에서 제거한다.
 * connectionId 만으로 호출 가능해야(연결 끊김 hook 에서 licenseSeq 없이도 정리) 전체 맵을 훑는다.
 */
declare function unregisterTerminalConnection(connectionId: string): void;
/** 특정 라이선스의 단말연동 PC connectionId 목록을 연결 순서대로 반환한다(폴백 순회용). */
declare function getTerminalConnections(licenseSeq: number): string[];
/**
 * 태블릿 결제 요청을 보류하는 대기 결제를 생성하고 결과 Promise 를 반환한다.
 * timeoutMs 안에 result 가 도착하지 않으면 reject 된다.
 */
declare function createPendingPayment(requestId: string, licenseSeq: number, timeoutMs: number): Promise<TerminalPaymentResult>;
/**
 * PC 가 보낸 결제 결과로 대기 중인 태블릿 요청을 깨운다.
 * 해당 requestId 의 대기 결제가 없으면(이미 타임아웃 등) false 를 반환한다.
 * licenseSeq 가 대기 결제와 다르면 다른 라이선스의 결과 주입을 막기 위해 무시한다.
 */
declare function resolvePendingPayment(requestId: string, licenseSeq: number, result: TerminalPaymentResult): boolean;
/** 대기 중인 태블릿 요청을 에러로 종료한다(폴백 순회 전부 실패 등). */
declare function rejectPendingPayment(requestId: string, error: Error): boolean;

/**
 * Cache 시스템 타입 정의
 */
type CacheDriver = "memory" | "redis" | "memcached";
/**
 * 캐시 저장소 인터페이스.
 * driver 가 바뀌어도 동일한 API 로 사용합니다.
 *
 * 예시:
 * ```ts
 * const store = cache();
 * const data = await store.get<MyType>("my-key");
 * await store.set("my-key", data, 60_000);
 * ```
 */
interface CacheStore {
    /** 키로 캐시를 조회합니다. 없거나 만료되면 null 반환 */
    get<T = unknown>(key: string): Promise<T | null>;
    /** 캐시를 저장합니다. ttlMs 미지정 시 기본 TTL 사용 */
    set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
    /** 키를 삭제합니다 */
    del(key: string): Promise<void>;
    /** 키 존재 여부를 확인합니다 */
    has(key: string): Promise<boolean>;
    /** 전체 캐시를 비웁니다 */
    flush(): Promise<void>;
    /** 현재 항목 수 */
    readonly size: number;
    /** 드라이버 이름 */
    readonly driver: CacheDriver;
}

/**
 * Cache 시스템 공개 API
 *
 * 사용 예시:
 * ```ts
 * import { cache } from "@system/api";
 *
 * async function handler(req, reply) {
 *     const cached = await cache().get<User[]>("users:all");
 *     if (cached) return ok(cached);
 *
 *     const users = await fetchUsers();
 *     await cache().set("users:all", users, 60_000); // TTL: 60초
 *     return ok(users);
 * }
 * ```
 */

/**
 * 전역 캐시 스토어를 반환합니다.
 *
 * @example
 * const store = cache();
 * const data = await store.get<MyType>("key");
 * await store.set("key", data, 30_000); // 30초 TTL
 * await store.del("key");
 * await store.flush();
 */
declare function cache(): CacheStore;

/**
 * 분산 락 — 멀티인스턴스 중복 실행 방지
 *
 * Go `internal/privacy/service.go` acquireLock/releaseLock 포팅.
 *
 * `privacy_cron_lock` 엔티티의 unique constraint를 활용한 슬롯 기반 락.
 * 엔티티가 없으면 단일 인스턴스로 간주하고 항상 true 반환.
 *
 * 슬롯 계산:
 *   slot = `${jobName}:${Math.floor(now / ttlSec)}`
 *   → 동일 interval 내 모든 인스턴스가 같은 slot 값을 사용
 *   → Insert 시 unique constraint 위반 = 다른 인스턴스가 이미 처리 중
 */
/**
 * 분산 락을 획득한다.
 *
 * @param jobName  작업 식별자 (예: "privacy:password_expiry")
 * @param ttlSec   락 유효 시간(초) — 같은 값으로 release 호출해야 함
 * @returns 락 획득 성공 여부
 */
declare function acquireLock(jobName: string, ttlSec: number): Promise<boolean>;
/**
 * 분산 락을 해제한다.
 *
 * @param jobName  acquireLock과 동일한 작업 식별자
 * @param ttlSec   acquireLock과 동일한 TTL
 */
declare function releaseLock(jobName: string, ttlSec: number): Promise<void>;

/**
 * Cron 표현식 파싱·검증·스케줄 생성 공통 유틸리티
 *
 * 각 스케줄러에서 반복되는 Cron 생성 로직을 통합합니다.
 *
 *   import { createCron, validateCron, describeCron } from "@system/api";
 */

/** createCron 옵션 */
interface CreateCronOptions {
    /** cron 표현식 (5-field 또는 6-field). 예: "0 3 * * *" */
    expression: string;
    /** IANA 타임존. 기본값: "Asia/Seoul" */
    timezone?: string;
    /** 이전 실행이 끝나기 전 다음 실행 스킵 여부. 기본값: true */
    protect?: boolean;
    /** 실행할 콜백 (async 가능) */
    onTick: () => void | Promise<void>;
}
/** createCron 반환값 */
interface CronHandle {
    /** croner Cron 인스턴스 */
    job: InstanceType<typeof Cron>;
    /** 다음 실행 예정 시각 (ISO 문자열). 없으면 null */
    nextRun: string | null;
    /** 스케줄 중지 */
    stop: () => void;
}
/**
 * cron 표현식이 유효한지 검증합니다.
 * 유효하면 true, 아니면 false를 반환합니다.
 */
declare function validateCron(expression: string): boolean;
/**
 * cron 표현식의 다음 N회 실행 예정 시각을 반환합니다.
 * @param expression  cron 표현식
 * @param count       반환할 횟수 (기본 5)
 * @param timezone    IANA 타임존 (기본 "Asia/Seoul")
 * @returns Date 배열. 표현식이 잘못되면 빈 배열.
 */
declare function nextRuns(expression: string, count?: number, timezone?: string): Date[];
/**
 * cron 표현식을 사람이 읽기 쉬운 한국어 설명으로 변환합니다.
 * 5-field 표준(분 시 일 월 요일)만 지원합니다.
 *
 * 예: "0 3 * * *"  → "매일 03:00"
 *     "30 2 * * *" → "매일 02:30"
 *     "0 0 1 * *"  → "매월 1일 00:00"
 *     "0 9 * * 1"  → "매주 월요일 09:00"
 */
declare function describeCron(expression: string): string;
/**
 * Cron 스케줄을 생성합니다.
 * 표현식 검증 → Cron 인스턴스 생성 → CronHandle 반환.
 *
 * @throws Error  표현식이 유효하지 않으면 에러
 */
declare function createCron(opts: CreateCronOptions): CronHandle;

/**
 * 안전한 타입 변환 헬퍼
 *
 * unknown 값을 number, string 등으로 안전하게 변환한다.
 * pg, taxinvoice 등 여러 플러그인의 entity-adapter 에서 공통으로 사용.
 */
/** unknown → number (null/NaN → 0) */
declare function toNumber(v: unknown): number;
/** unknown → string (null → "") */
declare function toString(v: unknown): string;
/** unknown → boolean (truthy 변환) */
declare function toBool(v: unknown): boolean;

/**
 * HTTP 클라이언트 헬퍼 — fetch + 타임아웃 + 에러 처리
 *
 * 모든 외부 API provider (SMS, PG, TaxInvoice, Identity, Holidays 등)에서
 * 반복되는 fetch + AbortController + setTimeout 패턴을 통합한다.
 */
interface FetchOptions extends Omit<RequestInit, "signal"> {
    /** 요청 타임아웃 (ms). 기본: 30000 */
    timeoutMs?: number;
}
interface FetchResult<T = unknown> {
    ok: boolean;
    status: number;
    data: T;
    headers: Headers;
}
/**
 * 타임아웃 지원 fetch 래퍼.
 * 지정된 시간 내 응답이 없으면 AbortError 를 throw 한다.
 *
 * @param url     요청 URL
 * @param options fetch 옵션 + timeoutMs
 * @returns       FetchResult (JSON 파싱 시도, 실패 시 text)
 */
declare function fetchWithTimeout<T = unknown>(url: string, options?: FetchOptions): Promise<FetchResult<T>>;
/**
 * JSON POST 요청을 공통 헤더와 함께 전송합니다.
 */
declare function fetchJson<T = unknown>(url: string, body: unknown, options?: FetchOptions): Promise<FetchResult<T>>;

/**
 * 문자열 포맷팅 유틸리티
 *
 * 전화번호, 사업자번호, 날짜 등 반복되는 포맷 변환을
 * 플러그인(SMS, OCR, Identity, TaxInvoice)에서 공유한다.
 */
/** 문자열에서 숫자만 추출한다 */
declare function extractDigits(s: string): string;
/** Date 값을 SQL datetime 문자열(YYYY-MM-DD HH:mm:ss)로 변환한다. */
declare function formatSqlDateTime(date?: Date): string;
/**
 * 한국 전화번호를 E.164 형식으로 변환한다.
 *
 * - "01012345678"  → "+821012345678" (0 제거 + 82 추가)
 * - "+821012345678" → 그대로
 *
 * @param phone    전화번호 문자열
 * @param country  국가 코드 (기본 "82")
 */
declare function normalizePhoneE164(phone: string, country?: string): string;
/**
 * 사업자번호를 NNN-NN-NNNNN 형식으로 정규화한다.
 *
 * "1234567890" → "123-45-67890"
 */
declare function formatBizNum(raw: string): string;

/** 문자열 내 `${VAR}` 플레이스홀더를 process.env 값으로 치환한다. */
declare function substituteEnvVars(str: string): string;

/** configs 디렉토리 절대경로를 반환한다. */
declare function resolveConfigsDir(): string;

/** .ts 또는 .js 확장자를 가진 모듈 파일을 찾아 동적 import용 URL을 반환한다. */
declare function resolveModulePath(dir: string, baseName: string): string | null;

/** configs 하위 JSON 파일을 로드한다. */
declare function loadJsonConfig<T = unknown>(filename: string): T | null;

type ParsedUserAgent = {
    raw: string;
    platform?: string;
    deviceType?: string;
    browser?: string;
    browserVersion?: string;
};
/** User-Agent 문자열을 공통 필드 구조로 정규화합니다. */
declare function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent;

/**
 * 암호학적 난수 유틸리티 — 인증코드, 토큰 생성 등
 *
 * 참고: 해시 함수는 crypto/hash.ts, 암복호화는 crypto/cipher.ts 를 사용한다.
 */
/**
 * 숫자 인증 코드를 생성한다.
 *
 * @param length 코드 자릿수 (기본 6)
 * @returns 지정 자릿수의 숫자 문자열 (예: "183927")
 */
declare function generateVerificationCode(length?: number): string;

/**
 * SHA-256 해시 유틸리티
 *
 * 여러 플러그인(sms/verification, identity, ocr/cache, password-reset 등)에서
 * 반복되는 해시 로직을 통합한다.
 *
 * 참고: AES/3DES/HMAC 등 암복호화는 crypto/cipher.ts 를 사용한다.
 */
/**
 * 문자열을 SHA-256 hex로 해시한다.
 */
declare function hashString(data: string): string;
/**
 * Buffer를 SHA-256 hex로 해시한다 (파일 해시 등).
 */
declare function hashBuffer(data: Buffer): string;

/**
 * 비밀번호 정책 검증
 *
 * configs/security.json 의 password_policy 섹션을 기반으로
 * 회원가입·비밀번호 변경 시 복잡도/금지패턴을 검증한다.
 *
 * Go internal/privacy/service.go ValidatePasswordPolicy +
 *    internal/security/password.go ValidateForbiddenPatterns 포팅
 */

declare const passwordPolicySchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    min_length: z.ZodDefault<z.ZodNumber>;
    max_length: z.ZodDefault<z.ZodNumber>;
    require_mixed_case: z.ZodDefault<z.ZodBoolean>;
    require_number: z.ZodDefault<z.ZodBoolean>;
    require_special: z.ZodDefault<z.ZodBoolean>;
    history_count: z.ZodDefault<z.ZodNumber>;
    forbidden_patterns: z.ZodDefault<z.ZodObject<{
        sequential_digits: z.ZodDefault<z.ZodBoolean>;
        repeated_chars: z.ZodDefault<z.ZodBoolean>;
        keyboard_patterns: z.ZodDefault<z.ZodBoolean>;
        sequential_length: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        sequential_digits: boolean;
        repeated_chars: boolean;
        keyboard_patterns: boolean;
        sequential_length: number;
    }, {
        sequential_digits?: boolean | undefined;
        repeated_chars?: boolean | undefined;
        keyboard_patterns?: boolean | undefined;
        sequential_length?: number | undefined;
    }>>;
    pii_check: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        entity: z.ZodDefault<z.ZodString>;
        fields: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        entity: string;
        fields: string[];
    }, {
        enabled?: boolean | undefined;
        entity?: string | undefined;
        fields?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    min_length: number;
    max_length: number;
    require_mixed_case: boolean;
    require_number: boolean;
    require_special: boolean;
    history_count: number;
    forbidden_patterns: {
        sequential_digits: boolean;
        repeated_chars: boolean;
        keyboard_patterns: boolean;
        sequential_length: number;
    };
    pii_check: {
        enabled: boolean;
        entity: string;
        fields: string[];
    };
}, {
    enabled?: boolean | undefined;
    min_length?: number | undefined;
    max_length?: number | undefined;
    require_mixed_case?: boolean | undefined;
    require_number?: boolean | undefined;
    require_special?: boolean | undefined;
    history_count?: number | undefined;
    forbidden_patterns?: {
        sequential_digits?: boolean | undefined;
        repeated_chars?: boolean | undefined;
        keyboard_patterns?: boolean | undefined;
        sequential_length?: number | undefined;
    } | undefined;
    pii_check?: {
        enabled?: boolean | undefined;
        entity?: string | undefined;
        fields?: string[] | undefined;
    } | undefined;
}>;
type PasswordPolicy = z.infer<typeof passwordPolicySchema>;
/** security.json 에서 password_policy 를 로드한다 (캐시) */
declare function loadPasswordPolicy(): PasswordPolicy;
/**
 * 비밀번호가 정책에 부합하는지 검증한다.
 *
 * @param password 평문 비밀번호
 * @param piiValues PII 필드값 배열 (예: ["01012345678", "19900101"])
 *                  pii_check.enabled 시 비밀번호에 포함 여부를 검사한다.
 * @returns null (통과) | 에러 메시지 문자열
 */
declare function validatePassword(password: string, piiValues?: string[]): string | null;

/**
 * CSRF 보안 플러그인 — Double Submit Cookie 패턴
 *
 * 동작 방식:
 * 1. GET /v1/health 또는 GET /csrf-token → 랜덤 토큰 생성 → Set-Cookie + JSON 응답
 * 2. POST/PUT/DELETE 등 상태변경 요청 시:
 *    - Cookie의 _csrf 값 vs Header의 x-csrf-token 값 비교
 *    - 불일치 시 403 Forbidden
 *
 * Safe methods(GET, HEAD, OPTIONS)는 검증하지 않습니다.
 * skip_paths에 지정된 경로는 CSRF 검증을 건너뜁니다.
 */

interface CsrfConfig {
    enabled: boolean;
    cookieName: string;
    headerName: string;
    cookieOptions: {
        httpOnly: boolean;
        sameSite: "strict" | "lax" | "none";
        secure: boolean;
        path: string;
        maxAge: number;
    };
    safeMethods: string[];
    skipPaths: string[];
    tokenLength: number;
}
interface IssuedCsrfToken {
    expiresIn: number;
}
/** CSRF 보안 설정을 설정 파일에서 로드한다 */
declare function loadCsrfConfig(): CsrfConfig;
declare function issueCsrfToken(reply: FastifyReply, cfg?: CsrfConfig): IssuedCsrfToken | null;

/**
 * 패킷 암호화 설정 로더
 *
 * security.json의 packet_encrypt 섹션을 파싱합니다.
 */
declare const PACKET_INFO_LABEL = "entity-server:packet-encryption";
interface PacketEncryptConfig {
    enabled: boolean;
    skipPaths: string[];
    magicMin: number;
    magicRange: number;
    anonymousEnabled: boolean;
    deviceCookieName: string;
    deviceCookieOptions: {
        httpOnly: boolean;
        sameSite: "strict" | "lax" | "none";
        secure: boolean;
        path: string;
        maxAge: number;
    };
}
/**
 * packet_encrypt 설정을 로드한다.
 *
 * security.json 읽기는 이미 캐시되지만, defaults 스프레드+매핑으로 매 호출마다
 * 새 객체를 만들던 것을 모듈 수준에서 1회만 만들어 재사용한다.
 * loadSecurityJson 캐시에는 핫리로드/무효화 경로가 없고(전수 grep 확인 —
 * app/utils/passwordPolicyConfig.ts 의 저장도 캐시를 무효화하지 않음),
 * packet_encrypt 설정 변경은 프로세스 재시작으로만 반영된다.
 */
declare function loadPacketEncryptConfig(): PacketEncryptConfig;

/**
 * 익명 디바이스 ID 쿠키 관리
 *
 * 요청에서 디바이스 ID를 읽거나, 없으면 새로 생성하여 쿠키로 설정합니다.
 */

declare function readAnonymousDeviceId(req: FastifyRequest, cfg: PacketEncryptConfig): string | null;
declare function ensureAnonymousDeviceId(req: FastifyRequest, reply: FastifyReply, cfg: PacketEncryptConfig): string | null;

/**
 * 익명 패킷 토큰 파생
 *
 * 디바이스 ID와 HMAC secret으로 패킷 암호화용 토큰을 생성합니다.
 */

/** entity-client와 공유하는 익명 패킷 토큰 쿠키 이름 */
declare const ANON_TOKEN_COOKIE_NAME = "anon_token";
declare function deriveAnonymousPacketToken(deviceId: string): string;
/** device_id 쿠키를 보장하고 anon_token 쿠키를 발급한다 */
declare function issuePacketCookies(req: FastifyRequest, reply: FastifyReply): void;
/** anon_token 쿠키를 응답에 추가한다 (HttpOnly 아님 — 클라이언트 JS가 읽어야 함) */
declare function setAnonTokenCookie(reply: FastifyReply, token: string, maxAge: number): void;

/**
 * HTTP 쿠키 유틸리티
 *
 * 쿠키 파싱, 직렬화, Set-Cookie 헤더 관리
 */

interface CookieOptions {
    httpOnly: boolean;
    sameSite: "strict" | "lax" | "none";
    secure: boolean;
    path: string;
    maxAge: number;
}
declare function serializeCookie(name: string, value: string, options: CookieOptions): string;
declare function appendSetCookie(reply: FastifyReply, cookieValue: string): void;

interface Database {
    [key: string]: any;
}

/** Kysely DB 인스턴스를 반환한다. group 생략 시 default 그룹 */
declare function dbConn(group?: string): kysely.Kysely<any>;

export { ANON_TOKEN_COOKIE_NAME, AppError, BadRequestError, ConflictError, ForbiddenError, NotFoundError, PACKET_INFO_LABEL, UnauthorizedError, ValidationError, acquireLock, appendSetCookie, broadcastRealtime, cache, clearTemplateCache, createCron, createPendingPayment, dbConn, decodeAuthTokenClaims, decrypt3DesCbc, decryptAesCbc, deriveAnonymousPacketToken, describeCron, encrypt3DesCbc, encryptAesCbc, ensureAnonymousDeviceId, ensurePluginEntities, enterRequestContext, entityServer, env, extractDigits, extractSessionIdFromRequest, fail, fetchJson, fetchWithTimeout, formatBizNum, formatSqlDateTime, generateVerificationCode, getRealtimeStats, getRequestContext, getTerminalConnections, hasSpecificHook, hashBuffer, hashString, hmacSha256, hmacSha256Hex, issueAuthTokenPair, issueCsrfToken, issuePacketCookies, loadCsrfConfig, loadJsonConfig, loadPacketEncryptConfig, loadPasswordPolicy, logFmt, logger, nextRuns, normalizePhoneE164, ok, parseUserAgent, readAnonymousDeviceId, registerAuthenticatedSession, registerEntityMutationListener, _setPushServiceRef as registerPushService, registerTerminalConnection, registerWithdrawHook, rejectPendingPayment, releaseLock, renderString, renderTemplate, replaceVars, resolveConfigsDir, resolveModulePath, resolvePendingPayment, revokeAuthenticatedSession, runAfterSubmit, runBeforeSubmit, runWithdrawHooks, sendEmail, sendPush, sendPushAll, sendRealtimeToAccount, sendRealtimeToConnection, sendRealtimeToLicense, serializeCookie, serverConfig, setAnonTokenCookie, setSharedLayout, setTemplateDir, sha256, sha256Hex, substituteEnvVars, toBool, toNumber, toString, unregisterTerminalConnection, validateCron, validatePassword };
export type { AccountInfo, AuthSessionClaims, AuthTokenConfig, AuthTokenPair, CacheDriver, CacheStore, CreateCronOptions, CronHandle, CsrfConfig, Database, DeleteContext, EntityHook, EntityMutationEvent, EntityMutationOp, IssuedCsrfToken, JwtUserInfo, PacketEncryptConfig, ParsedUserAgent, PasswordPolicy, PushServiceRef, RealtimeEnvelope, RealtimePublishInput, RealtimeStats, SendEmailParams, SendPushAllParams, SendPushParams, SubmitContext, TerminalPaymentResult, WithdrawHookFn };
