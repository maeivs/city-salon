# system/ 내부 구조

Entity App Server 서버 코어(`system.js` / 소스 리포지토리 빌드 시 `dist/system.js`)를 구성하는 `src/system/` 디렉터리의 전체 구조와 각 모듈의 역할을 정리합니다.

> 이 디렉터리의 코드는 esbuild로 번들되어 생성된 프로젝트에서는 루트의 `system.js`, `system-api.js`로 제공되고, 소스 리포지토리 빌드 산출물에서는 `dist/system.js`, `dist/system-api.js`로 출력됩니다.  
> `app/` 코드에서는 `@system/api`(`public-api.ts`) 를 통해서만 system 기능에 접근합니다.

---

## 디렉터리 트리

```
src/system/
├── app.ts                          — Fastify 앱 생성 · 플러그인/라우트 등록 오케스트레이터
├── index.ts                        — 엔트리포인트 (서버 시작)
├── public-api.ts                   — @system/api 배럴 (app/ 공개 API)
├── startup-banner.ts               — 시작 시 콘솔 배너 출력
│
├── config/                         — 설정 로더
│   ├── env.ts                      — 환경변수 검증 (NODE_ENV, 필수 키)
│   ├── server.ts                   — server.json 로더 (port, host, logging)
│   ├── cors.ts                     — cors.json 로더
│   ├── database.ts                 — database.json 로더 (Kysely 초기화)
│   ├── entity-server.ts            — Entity Server 클라이언트 설정
│   ├── security.ts                 — security.json → Helmet 옵션
│   ├── security-loader.ts          — security.json 범용 로더 (packet_encrypt, password_policy)
│   ├── packet-encrypt.ts           — security.json → 패킷 암호화 설정 추출
│   ├── rate-limit.ts               — Rate Limit 옵션
│   ├── config-path.ts              — configs/ 디렉터리 경로 해석
│   ├── module-path.ts              — 모듈 상대 경로 해석
│   ├── json-config.ts              — 범용 JSON 파일 로더
│   └── env-substitution.ts         — ${VAR} 환경변수 치환
│
├── logging/                        — 로깅
│   ├── logger.ts                   — pino 멀티스트림 로거 (main + access)
│   └── log-format.ts               — ANSI 컬러 로그 포맷터 (logFmt)
│
├── middleware/                     — Fastify 인프라 미들웨어
│   ├── auth.ts                     — JWT 검증 (authRequired preHandler)
│   ├── csrf.ts                     — CSRF 토큰 발급/검증
│   ├── packet-encrypt.ts           — 요청 복호화 / 응답 암호화
│   ├── database.ts                 — Kysely DB 연결 등록
│   ├── error-handler.ts            — 전역 에러 핸들러
│   ├── request-id.ts               — x-request-id 생성/전파
│   ├── access-log.ts               — HTTP 접근 로그
│   ├── extension-loader.ts         — app/plugins/** 자동 탐색·등록
│   ├── _db-ref.ts                  — DB 인스턴스 내부 레퍼런스
│   └── _push-ref.ts                — 푸시 서비스 내부 레퍼런스
│
├── routes/                         — 라우트 로더
│   ├── loader.ts                   — app/routes/** 자동 탐색·등록
│   └── entity-interceptor.ts       — 엔티티 CRUD 인터셉터 (훅 실행)
│
├── hooks/                          — 엔티티 훅 시스템
│   ├── types.ts                    — EntityHook, SubmitContext, DeleteContext 타입
│   ├── runner.ts                   — 훅 실행기 (before/after 호출)
│   ├── loader.ts                   — app/hooks/registry.ts 로더
│   └── withdraw-hooks.ts           — 회원 탈퇴 훅 등록/실행
│
├── proxy/
│   └── register.ts                 — Entity Server 프록시 라우트 등록
│
├── entity-server/                  — Entity Server 연동
│   ├── client.ts                   — ES Admin API HMAC 서명 HTTP 클라이언트
│   └── bootstrap.ts                — 플러그인 엔티티 스키마 동기화
│
├── cache/                          — 캐시 시스템
│   ├── types.ts                    — CacheStore, CacheDriver 인터페이스
│   ├── index.ts                    — cache() 팩토리 (namespace 자동 적용)
│   ├── config.ts                   — cache.json 로더
│   ├── plugin.ts                   — Fastify 캐시 플러그인
│   ├── namespaced.ts               — 네임스페이스 키 래퍼
│   ├── _store-ref.ts               — 캐시 스토어 내부 레퍼런스
│   └── drivers/
│       ├── memory.ts               — 인메모리 캐시 (기본)
│       ├── redis.ts                — Redis 드라이버
│       └── memcached.ts            — Memcached 드라이버
│
├── crypto/                         — 암호화
│   ├── cipher.ts                   — AES-CBC, 3DES-CBC, SHA-256, HMAC-SHA256
│   ├── hash.ts                     — SHA-256 해시 (string/buffer)
│   ├── random.ts                   — 인증 코드 생성
│   ├── packet.ts                   — 네트워크 패킷 암/복호화 (XChaCha20-Poly1305)
│   └── data-encrypt.ts             — DB 데이터 암/복호화 (XChaCha20 + AES-256-GCM fallback)
│
├── security/                       — 보안
│   ├── password-policy.ts          — 비밀번호 복잡도 정책 검증
│   ├── anonymous-device.ts         — 익명 디바이스 생성/조회 (Entity Server 연동)
│   ├── anonymous-device-id.ts      — 익명 디바이스 ID 쿠키 관리
│   └── anonymous-packet-token.ts   — 익명 패킷 토큰 HMAC 파생
│
├── http/                           — HTTP 유틸리티
│   ├── response.ts                 — ok() / fail() 응답 래퍼
│   └── cookie.ts                   — 쿠키 파싱/직렬화/Set-Cookie 관리
│
├── email/                          — 이메일
│   ├── sender.ts                   — 이메일 발송 (sendEmail)
│   └── template-engine.ts          — Handlebars 템플릿 렌더링
│
├── push/
│   └── sender.ts                   — FCM/APNs 푸시 발송 (sendPush, sendPushAll)
│
├── scheduler/                      — 스케줄러
│   ├── cron-utils.ts               — createCron, validateCron, describeCron, nextRuns
│   ├── distributed-lock.ts         — acquireLock / releaseLock (DB 기반 분산 락)
│   └── schedule-loader.ts          — app/schedules/** 자동 탐색·등록
│
├── utils/                          — 공통 유틸리티
│   ├── errors.ts                   — AppError + HTTP 에러 클래스 (400~422)
│   ├── coerce.ts                   — toNumber, toString, toBool 타입 변환
│   ├── format.ts                   — 전화번호 E.164, 사업자번호, SQL 날짜 포맷
│   ├── http-client.ts              — fetchWithTimeout, fetchJson
│   ├── user-agent.ts               — User-Agent 파서
│   ├── app-path.ts                 — 프로젝트 루트/앱 경로 해석
│   └── date-prefixed-log-stream.ts — 날짜별 로그 파일 스트림 (pino-roll)
│
└── types/
    └── fastify.d.ts                — Fastify 인스턴스 타입 확장 (app.db, app.config 등)
```

---

## 모듈 관계도

```
                        ┌─────────────────┐
                        │    index.ts      │  ← node system.js
                        │  (서버 시작)     │
                        └───────┬─────────┘
                                │
                        ┌───────▼─────────┐
                        │    app.ts        │  ← Fastify 앱 빌더
                        └───────┬─────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
    ┌─────▼─────┐     ┌────────▼────────┐    ┌───────▼───────┐
    │  config/   │     │  middleware/     │    │    routes/    │
    │  logging/  │     │  (인프라 미들웨어│    │    proxy/     │
    └───────────┘     │   auth, csrf,   │    │    hooks/     │
                       │   packet, db)   │    └───────────────┘
                       └────────┬────────┘
                                │
          ┌────────────┬────────┼────────┬─────────────┐
          │            │        │        │             │
    ┌─────▼────┐ ┌─────▼───┐ ┌─▼────┐ ┌─▼────┐ ┌─────▼─────┐
    │  cache/  │ │ crypto/ │ │email/│ │push/ │ │ scheduler/│
    │  (캐시)  │ │ (암호화)│ │      │ │      │ │  (크론)   │
    └──────────┘ └─────────┘ └──────┘ └──────┘ └───────────┘
```

---

## 부트스트랩 순서

`app.ts`의 `buildApp()` 함수가 다음 순서로 Fastify 인스턴스를 구성합니다:

| 단계 | 동작                            | 설명                                                                                  |
| :--: | ------------------------------- | ------------------------------------------------------------------------------------- |
|  1   | Fastify 인스턴스 생성           | `trustProxy: true`, 자체 pino 로거 사용                                               |
|  2   | CORS · Helmet · Rate Limit      | 보안 기본 플러그인                                                                    |
|  3   | 시스템 미들웨어 (`middleware/`) | requestId → requestSupersede → accessLog → errorHandler → cache → realtime → auth → csrf → packetEncrypt → database |
|  4   | `loadHooks()`                   | `app/hooks/registry.ts` 로드                                                          |
|  5   | `loadExtensionPlugins()`        | `app/plugins/**/index.ts` 자동 탐색                                                   |
|  6   | `registerEntityInterceptor()`   | 엔티티 CRUD 훅 인터셉터 등록                                                          |
|  7   | `registerRoutes()`              | `app/routes/**/route.ts` 자동 탐색                                                    |
|  8   | `registerProxyRoutes()`         | Entity Server 패스스루 (미처리 경로)                                                  |
|  9   | `loadSchedules()`               | `app/schedules/**/index.ts` 자동 탐색                                                 |
|  10  | `/v1/health` 등록 → `listen()`  | 헬스체크 + 서버 시작                                                                  |

> 5~7번 순서가 중요합니다. 플러그인/라우트가 프록시(8번)보다 먼저 등록되므로, 동일 경로를 정의하면 앱 서버가 직접 처리합니다.

---

## 빌드 산출물

| 파일                                   | 빌더    | 내용                                          |
| -------------------------------------- | ------- | --------------------------------------------- |
| `system.js` / `dist/system.js`         | esbuild | 서버 코어 번들 (이 디렉터리 전체, 난독화)     |
| `system-api.js` / `dist/system-api.js` | esbuild | `public-api.ts`만 번들 (`@system/api` 진입점) |

`system.js`는 수정 불가 영역, `app/`은 TypeScript 소스 그대로 배포되어 자유롭게 수정 가능합니다.

---

## 주요 모듈 상세

### config/

모든 JSON 설정 파일(`configs/*.json`)과 환경변수(`.env`)를 로드합니다.

- `env.ts` — `NODE_ENV`, 필수 키 검증. `Env` 타입과 `env`, `isDev` 익스포트
- `server.ts` — `server.json` → `serverConfig` (port, host, baseUrl, logging)
- `database.ts` — `database.json` → Kysely 인스턴스 생성 (MariaDB/MySQL)
- `json-config.ts` — `loadJsonConfig<T>(name)` 범용 로더 (`${VAR}` 치환 포함)
- `env-substitution.ts` — `"${DB_HOST}"` → `process.env.DB_HOST` 치환 유틸

### logging/

pino 기반 멀티스트림 로거입니다.

- `logger.ts` — `logger` (일반 로그) + `accessLogger` (접근 로그, 별도 파일)
- `log-format.ts` — `logFmt.server(msg)`, `logFmt.db(msg)` 등 카테고리별 ANSI 컬러 포맷

```ts
import { logger, logFmt } from "@system/api";
logger.info(logFmt.db("연결 완료"));
```

### middleware/

Fastify `register()`로 등록되는 인프라 미들웨어입니다.  
`app/plugins/`의 비즈니스 플러그인과 구분하기 위해 `middleware/`로 명명합니다.

| 파일                  | 역할                  |
| --------------------- | --------------------- |
| `auth.ts`             | JWT 검증 preHandler   |
| `csrf.ts`             | CSRF 토큰 검증        |
| `packet-encrypt.ts`   | 패킷 암/복호화        |
| `database.ts`         | Kysely DB 연결        |
| `error-handler.ts`    | setErrorHandler       |
| `request-id.ts`       | x-request-id 생성     |
| `request-supersede.ts`| 헤더 기반 동일 요청 중단 |
| `access-log.ts`       | 요청별 접근 로그      |
| `extension-loader.ts` | app/plugins 자동 로드 |

#### `request-supersede.ts`

클라이언트가 `X-Supersede-Key` 헤더를 보내면, 앱 서버는 같은 `ip + user-agent + method + path + supersede key` 조합의 이전 in-flight 요청을 `onRequest` 단계에서 중단합니다.

- 이전 요청의 `AbortController`를 중단합니다.
- 아직 끝나지 않은 이전 응답 스트림은 `destroy()`로 종료합니다.
- 현재 요청에는 `req.supersedeKey`, `req.supersedeSignal`을 주입합니다.
- 새 요청이 거의 동시에 도착한 경우를 위해 등록 직후 이벤트 루프에 한 틱 양보해 최신 요청이 supersede를 먼저 반영할 시간을 확보합니다.

이 기능은 지도를 빠르게 이동할 때처럼 이전 응답이 곧바로 무의미해지는 조회에 적합합니다. 쿼리스트링이 달라도 프런트가 같은 논리 요청으로 보고 싶다면 같은 헤더 값을 계속 보내면 됩니다.

```http
GET /v1/ais/vessels?lat_min=-50&lat_max=75&lon_min=-120&lon_max=175&zoom=3
X-Supersede-Key: ais-vessels-map
```

라우트나 서비스에서 장시간 작업을 수행한다면 `req.supersedeSignal`도 함께 확인해야 내부 계산까지 빨리 멈출 수 있습니다.

```ts
const signal = AbortSignal.any([
    req.supersedeSignal ?? new AbortController().signal,
    requestCloseController.signal,
]);

if (signal.aborted) {
    throw signal.reason;
}
```

### crypto/

| 파일              | 알고리즘                             | 용도                     |
| ----------------- | ------------------------------------ | ------------------------ |
| `cipher.ts`       | AES-256-CBC, 3DES-CBC, SHA-256, HMAC | 범용 암호화 유틸         |
| `hash.ts`         | SHA-256                              | 해시 유틸                |
| `packet.ts`       | XChaCha20-Poly1305 (libsodium)       | 네트워크 패킷 암/복호화  |
| `data-encrypt.ts` | XChaCha20 + AES-256-GCM fallback     | DB 레코드 필드 암/복호화 |
| `random.ts`       | crypto.randomInt                     | 숫자 인증 코드 생성      |

`cipher.ts`는 `system/` 내부 구현에서 직접 써도 되지만, `app/` 코드에서는 반드시 `@system/api`를 통해 접근합니다.

```ts
import {
    encryptAesCbc,
    decryptAesCbc,
    hmacSha256,
    hmacSha256Hex,
    sha256,
    sha256Hex,
} from "@system/api";
```

자주 쓰는 기준은 다음과 같습니다.

| 함수            | 반환값   | 주 용도                                                          |
| --------------- | -------- | ---------------------------------------------------------------- |
| `hmacSha256`    | base64   | NICE 등 외부 규격이 base64 무결성 값을 요구할 때                 |
| `hmacSha256Hex` | hex      | Solapi, 내부 서명 문자열 등 사람이 읽는 hex 시그니처가 필요할 때 |
| `sha256`        | `Buffer` | 후속 암호화/파생 키 계산에 바로 넘길 때                          |
| `sha256Hex`     | hex      | 해시 문자열 저장, 비교, 로그 출력                                |

### app/에서 system 암호화 유틸을 쓰는 예

```ts
import { hmacSha256Hex } from "@system/api";

const payload = `${date}${salt}`;
const signature = hmacSha256Hex(payload, secret);
```

중요한 점은, `app/` 소스는 배포 후에도 수정 가능하지만 `system/`은 난독화 번들로 숨겨진다는 점입니다. 따라서 사용 가능한 공용 함수는 코드 검색이 아니라 `public-api.ts`와 이 문서 기준으로 확인해야 합니다.

### hooks/

엔티티 CRUD 전/후에 커스텀 로직을 실행하는 훅 시스템입니다.

- `types.ts` — `EntityHook`, `SubmitContext`, `DeleteContext`, `UserInfo` 인터페이스
- `runner.ts` — 훅 실행기 (`runBeforeGet`, `runAfterSubmit` 등)
- `loader.ts` — `app/hooks/registry.ts`를 동적 import로 로드
- `withdraw-hooks.ts` — 회원 탈퇴 시 실행할 정리 훅 등록/실행

`routes/entity-interceptor.ts`가 프록시 전에 훅을 인터셉트하여 `runner.ts`를 호출합니다.

### entity-server/

Entity Server(Go) Admin API와의 통신을 담당합니다.

- `client.ts` — HMAC-SHA256 서명 HTTP 클라이언트 (`postEntityAdmin`)
- `bootstrap.ts` — 플러그인 엔티티 스키마를 ES에 등록 (`ensurePluginEntities`)

### security/

- `password-policy.ts` — `security.json`의 `password_policy` 설정을 로드하여 비밀번호 복잡도 검증
- `anonymous-device.ts` — 미인증 사용자의 디바이스 식별 (Entity Server `anon_device` 엔티티 연동)
- `anonymous-device-id.ts` — 디바이스 ID 쿠키 읽기/생성 (UUID v4)
- `anonymous-packet-token.ts` — HMAC-SHA256으로 익명 패킷 토큰 파생

### scheduler/

분산 환경에서 안전한 크론 스케줄링을 제공합니다.

- `cron-utils.ts` — `createCron(opts)`, `validateCron(expr)`, `describeCron(expr)`, `nextRuns(expr, count)`
- `distributed-lock.ts` — DB 기반 `acquireLock(key, ttl)` / `releaseLock(key)` (다중 인스턴스 중복 방지)
- `schedule-loader.ts` — `app/schedules/**/index.ts`를 자동 탐색하여 `start()` 호출

---

## public-api.ts (`@system/api`)

`app/` 코드에서 system 기능에 접근하기 위한 유일한 진입점입니다.  
상세 export 목록과 사용 예제는 [@system/api 상세 레퍼런스](system-api.md)를 참고하세요.

```ts
import { ok, fail, logger, entityServer, dbConn, cache } from "@system/api";
import { sendEmail, sendPush, createCron, acquireLock } from "@system/api";
import type { EntityHook, SubmitContext, UserInfo } from "@system/api";
```

### 설계 원칙

- `app/` 코드는 `system/` 내부 모듈을 직접 import하지 않는다
- 모든 접근은 `@system/api` 배럴 파일을 통한다
- 내부 레퍼런스(`_db-ref`, `_push-ref`, `_store-ref`)는 공개 API에서 래핑하여 노출한다

### 왜 `@system/api`만 써야 하나

배포 시 `src/system/`은 다음 두 파일로만 압축·난독화됩니다.

| 산출물                                 | 역할                           |
| -------------------------------------- | ------------------------------ |
| `system.js` / `dist/system.js`         | 서버 코어 전체 실행 번들       |
| `system-api.js` / `dist/system-api.js` | `@system/api` 공개 진입점 번들 |

즉, 최종 사용자 입장에서는 `system/` 원본 구현을 탐색할 수 없고, 공개 계약은 `@system/api`가 전부입니다.
새 공용 유틸을 추가할 때도 반드시 다음 순서를 지켜야 합니다.

1. `src/system/**`에 구현 추가
2. `src/system/public-api.ts`에 export 추가
3. `docs/system.md` 또는 관련 문서에 사용법 추가
4. 필요하면 `docs/architecture.md`의 `@system/api` 목록도 갱신

이 과정을 거쳐야 난독화 이후에도 “사용 가능한 시스템 기능”이 문서와 공개 API에 남습니다.

### 공용 유틸 추가 기준

다음 기준으로 `system/`에 둘지, `app/plugins/shared/`에 둘지 결정합니다.

| 위치                      | 넣어야 하는 것                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `src/system/`             | 특정 서비스에 종속되지 않는 범용 기능. 예: HMAC hex/base64, AES, JSON 설정 로더, HTTP 유틸 |
| `src/app/plugins/shared/` | 특정 벤더/도메인 규약을 캡슐화한 공용 함수. 예: Solapi Authorization 헤더 조립             |

예를 들어 `hmacSha256Hex`는 범용 primitive이므로 `system/crypto`가 맞고, Solapi의 `date + salt + Authorization` 포맷은 Solapi 규약이므로 `app/plugins/shared`에 두는 것이 맞습니다.

`app/`에서 필요한 기능이 보이지 않으면, 먼저 `public-api.ts`와 [@system/api 상세 레퍼런스](system-api.md)를 확인하고, 없다면 `system/` 구현을 직접 import하지 말고 공개 API로 승격할지 판단해야 합니다.

---

## 관련 문서

- [@system/api 상세 레퍼런스](system-api.md) — 모든 공개 API 상세 설명 및 사용예제
- [아키텍처](architecture.md) — 전체 구조, 4가지 역할, 인증 흐름
- [내부 구조](internals.md) — 부트스트랩 순서, 요청 처리 흐름
- [보안 설정](security.md) — CORS, CSRF, 패킷 암호화, 비밀번호 정책
- [설정 파일](configs.md) — .env, server.json, database.json 등
- [캐시](cache.md) — memory/Redis/Memcached 캐시 사용법
- [훅](hooks.md) — 엔티티 CRUD 훅 상세 가이드
