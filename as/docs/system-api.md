# @system/api 상세 레퍼런스

`@system/api`는 `app/` 코드에서 `src/system/` 기능에 접근하기 위한 유일한 공개 인터페이스입니다.
모든 API는 TypeScript로 문서화되어 있으며, 배포 후에도 `system-api.js`에 포함되어 사용 가능합니다.

> 배포 후 `src/system/` 코드는 `system.js`로 난독화되므로 직접 탐색할 수 없습니다.  
> 프로젝트 이름은 Entity App Server로 바뀌었지만, 공개 import 경로는 하위 호환을 위해 `@system/api`를 유지합니다.
> 이 문서가 사용 가능한 API를 확인하는 유일한 방법입니다.

---

## 📑 빠른 네비게이션

### 1. [응답 / 에러](#1-응답--에러)

| API                                       | 설명                                   |
| ----------------------------------------- | -------------------------------------- |
| [`ok`](#ok)                               | 표준 성공 응답 래퍼                    |
| [`fail`](#fail)                           | 표준 실패 응답 래퍼                    |
| [`AppError`](#apperror)                   | statusCode를 포함하는 기본 에러 클래스 |
| [`BadRequestError`](#badrequesterror)     | 400 에러                               |
| [`UnauthorizedError`](#unauthorizederror) | 401 에러                               |
| [`ForbiddenError`](#forbiddenerror)       | 403 에러                               |
| [`NotFoundError`](#notfounderror)         | 404 에러                               |
| [`ConflictError`](#conflicterror)         | 409 에러                               |
| [`ValidationError`](#validationerror)     | 422 에러                               |

### 2. [환경 / 설정](#2-환경--설정)

| API                                       | 설명                     |
| ----------------------------------------- | ------------------------ |
| [`env`](#env)                             | 검증된 환경변수 객체     |
| [`serverConfig`](#serverconfig)           | `server.json` 로드 결과  |
| [`substituteEnvVars`](#substituteenvvars) | `${ENV}` 문자열 치환     |
| [`resolveConfigsDir`](#resolveconfigsdir) | `configs/` 절대경로 계산 |
| [`resolveModulePath`](#resolvemodulepath) | 모듈 상대 경로 계산      |
| [`loadJsonConfig`](#loadjsonconfig)       | JSON 설정 파일 로더      |

### 3. [로깅](#3-로깅)

| API                 | 설명                |
| ------------------- | ------------------- |
| [`logger`](#logger) | pino 로거           |
| [`logFmt`](#logfmt) | 컬러 로그 포맷 유틸 |

### 4. [Entity Server / 인프라](#4-entity-server--인프라)

| API                                             | 설명                          |
| ----------------------------------------------- | ----------------------------- |
| [`entityServer`](#entityserver)                 | Entity Server REST 클라이언트 |
| [`ensurePluginEntities`](#ensurepluginentities) | 플러그인 엔티티 스키마 등록   |
| [`registerPushService`](#registerpushservice)   | 푸시 서비스 레퍼런스 등록     |

### 5. [DB / SQL / 캐시](#5-db--sql--캐시)

| API                           | 설명                                 |
| ----------------------------- | ------------------------------------ |
| [`dbConn`](#dbconn)           | 기본 또는 지정 그룹 DB 인스턴스 반환 |
| [`sql`](#sql)                 | Kysely SQL 템플릿 태그               |
| [`cache`](#cache)             | namespaced 캐시 스토어               |
| [`CacheStore`](#cachestore)   | 캐시 스토어 타입                     |
| [`CacheDriver`](#cachedriver) | 캐시 드라이버 타입                   |
| [`Database`](#database)       | 사용자 확장용 DB 타입 인터페이스     |

### 6. [암호화 / 해시 / 보안](#6-암호화--해시--보안)

| API                                                     | 설명                    |
| ------------------------------------------------------- | ----------------------- |
| [`sha256`](#sha256)                                     | SHA-256 Buffer 반환     |
| [`sha256Hex`](#sha256hex)                               | SHA-256 hex 문자열 반환 |
| [`hmacSha256`](#hmacsha256)                             | HMAC-SHA256 base64 반환 |
| [`hmacSha256Hex`](#hmacsha256hex)                       | HMAC-SHA256 hex 반환    |
| [`encryptAesCbc`](#encryptaescbc)                       | AES-CBC 암호화          |
| [`decryptAesCbc`](#decryptaescbc)                       | AES-CBC 복호화          |
| [`encrypt3DesCbc`](#encrypt3descbc)                     | 3DES-CBC 암호화         |
| [`decrypt3DesCbc`](#decrypt3descbc)                     | 3DES-CBC 복호화         |
| [`generateVerificationCode`](#generateverificationcode) | 숫자 인증 코드 생성     |
| [`hashString`](#hashstring)                             | 문자열 SHA-256 hex      |
| [`hashBuffer`](#hashbuffer)                             | Buffer SHA-256 hex      |
| [`validatePassword`](#validatepassword)                 | 비밀번호 정책 검증      |
| [`loadPasswordPolicy`](#loadpasswordpolicy)             | 비밀번호 정책 로드      |
| [`PasswordPolicy`](#passwordpolicy)                     | 비밀번호 정책 타입      |

### 7. [이메일 / 푸시 / 템플릿](#7-이메일--푸시--템플릿)

| API                                         | 설명                      |
| ------------------------------------------- | ------------------------- |
| [`sendEmail`](#sendemail)                   | 이메일 발송               |
| [`SendEmailParams`](#sendemailparams)       | 이메일 발송 파라미터 타입 |
| [`setSharedLayout`](#setsharedlayout)       | 공용 이메일 레이아웃 설정 |
| [`setTemplateDir`](#settemplatedir)         | 템플릿 디렉터리 설정      |
| [`renderTemplate`](#rendertemplate)         | 파일 기반 템플릿 렌더링   |
| [`renderString`](#renderstring)             | 문자열 템플릿 렌더링      |
| [`replaceVars`](#replacevars)               | 템플릿 변수 치환          |
| [`clearTemplateCache`](#cleartemplatecache) | 템플릿 캐시 비움          |
| [`sendPush`](#sendpush)                     | 단건 푸시 발송            |
| [`sendPushAll`](#sendpushall)               | 다건 푸시 발송            |
| [`SendPushParams`](#sendpushparams)         | 단건 푸시 타입            |
| [`SendPushAllParams`](#sendpushallparams)   | 다건 푸시 타입            |

### 8. [스케줄 / 분산 락](#8-스케줄--분산-락)

| API                                       | 설명                |
| ----------------------------------------- | ------------------- |
| [`acquireLock`](#acquirelock)             | 분산 락 획득        |
| [`releaseLock`](#releaselock)             | 분산 락 해제        |
| [`createCron`](#createcron)               | Cron 작업 생성      |
| [`validateCron`](#validatecron)           | Cron 식 유효성 검사 |
| [`describeCron`](#describecron)           | Cron 식 설명        |
| [`nextRuns`](#nextruns)                   | 다음 실행 시각 계산 |
| [`CreateCronOptions`](#createcronoptions) | Cron 생성 옵션 타입 |
| [`CronHandle`](#cronhandle)               | Cron 핸들 타입      |

### 9. [HTTP / 포맷 / 타입 변환](#9-http--포맷--타입-변환)

| API                                         | 설명                  |
| ------------------------------------------- | --------------------- |
| [`fetchWithTimeout`](#fetchwithtimeout)     | 타임아웃 내장 fetch   |
| [`fetchJson`](#fetchjson)                   | JSON fetch helper     |
| [`toNumber`](#tonumber)                     | number coercion       |
| [`toString`](#tostring)                     | string coercion       |
| [`toBool`](#tobool)                         | boolean coercion      |
| [`extractDigits`](#extractdigits)           | 숫자만 추출           |
| [`normalizePhoneE164`](#normalizephonee164) | 전화번호 E.164 정규화 |
| [`formatSqlDateTime`](#formatsqldatetime)   | SQL datetime 포맷     |
| [`formatBizNum`](#formatbiznum)             | 사업자번호 포맷       |
| [`parseUserAgent`](#parseuseragent)         | User-Agent 파싱       |

### 10. [훅 / 도메인 타입](#10-훅--도메인-타입)

| API                                             | 설명                 |
| ----------------------------------------------- | -------------------- |
| [`EntityHook`](#entityhook)                     | 엔티티 훅 인터페이스 |
| [`UserInfo`](#userinfo)                         | 사용자 정보 타입     |
| [`SubmitContext`](#submitcontext)               | submit 훅 컨텍스트   |
| [`DeleteContext`](#deletecontext)               | delete 훅 컨텍스트   |
| [`registerWithdrawHook`](#registerwithdrawhook) | 회원 탈퇴 훅 등록    |
| [`runWithdrawHooks`](#runwithdrawhooks)         | 회원 탈퇴 훅 실행    |
| [`WithdrawHookFn`](#withdrawhookfn)             | 회원 탈퇴 훅 타입    |

### 11. [Realtime / WebSocket](#11-realtime--websocket)

| API                                                 | 설명                     |
| --------------------------------------------------- | ------------------------ |
| [`sendRealtimeToAccount`](#sendrealtimetoaccount)   | 계정 단위 realtime 발송  |
| [`sendRealtimeToConnection`](#sendrealtimetoconnection) | 연결 단위 realtime 발송 |
| [`broadcastRealtime`](#broadcastrealtime)           | 전체 연결 브로드캐스트   |
| [`getRealtimeStats`](#getrealtimestats)             | 현재 연결 통계 조회      |
| [`RealtimeEnvelope`](#realtimeenvelope)             | 공통 메시지 envelope 타입 |
| [`RealtimePublishInput`](#realtimepublishinput)     | 서버 발송 입력 타입      |
| [`RealtimeStats`](#realtimestats)                   | 연결 통계 타입           |

---

## 1. 응답 / 에러

### `ok()`

**설명**: 표준 성공 응답을 반환합니다. HTTP 200 상태 코드를 사용합니다.

**서명**:

```typescript
function ok(data?: any): { ok: true; data: any; errors: [] };
```

**사용예제**:

```typescript
import { ok } from "@api";

// 데이터와 함께 응답
export async function handleGetUser(request, reply) {
    const user = { id: 1, name: "John" };
    return reply.send(ok(user));
}

// 간단한 성공 응답
export async function handleDelete(request, reply) {
    await db.delete();
    return reply.send(ok());
}
```

---

### `fail()`

**설명**: 표준 실패 응답을 반환합니다. 에러 객체나 문자열을 받아 처리합니다.

**서명**:

```typescript
function fail(
    error: Error | string,
    statusCode?: number,
): { ok: false; errors: Error[] };
```

**사용예제**:

```typescript
import { fail, ValidationError } from "@api";

export async function handleValidation(request, reply) {
    const { email } = request.body;
    if (!email.includes("@")) {
        return reply.code(422).send(fail("Email must contain @", 422));
    }
    // or use ValidationError
    throw new ValidationError("Invalid email format");
}
```

---

### `AppError`

**설명**: 기본 애플리케이션 에러 클래스입니다. `statusCode` 속성을 포함합니다.

**사용예제**:

```typescript
import { AppError } from "@api";

class CustomError extends AppError {
    constructor(message: string) {
        super(message, 400);
    }
}

throw new CustomError("Something went wrong");
```

---

### `BadRequestError`

**설명**: HTTP 400 에러를 throw합니다.

**사용예제**:

```typescript
import { BadRequestError } from "@api";

if (!request.body.required_field) {
    throw new BadRequestError("Missing required field");
}
```

---

### `UnauthorizedError`

**설명**: HTTP 401 에러를 throw합니다.

**사용예제**:

```typescript
import { UnauthorizedError } from "@api";

if (!request.user) {
    throw new UnauthorizedError("Authentication required");
}
```

---

### `ForbiddenError`

**설명**: HTTP 403 에러를 throw합니다.

**사용예제**:

```typescript
import { ForbiddenError } from "@api";

if (user.role !== "admin") {
    throw new ForbiddenError("Admin access required");
}
```

---

### `NotFoundError`

**설명**: HTTP 404 에러를 throw합니다.

**사용예제**:

```typescript
import { NotFoundError } from "@api";

const user = await db.users.findById(id);
if (!user) {
    throw new NotFoundError("User not found");
}
```

---

### `ConflictError`

**설명**: HTTP 409 에러를 throw합니다.

**사용예제**:

```typescript
import { ConflictError } from "@api";

const existing = await db.emails.findOne({ email });
if (existing) {
    throw new ConflictError("Email already registered");
}
```

---

### `ValidationError`

**설명**: HTTP 422 에러를 throw합니다.

**사용예제**:

```typescript
import { ValidationError } from "@api";

if (password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters");
}
```

---

## 2. 환경 / 설정

### `env`

**설명**: 검증된 환경변수 객체입니다. `.env` 파일과 시스템 환경변수에서 값을 읽습니다.

**사용예제**:

```typescript
import { env } from "@api";

console.log(env.NODE_ENV); // "development" 또는 "production"
console.log(env.PORT); // "58200"

// 환경별 동작 분기
if (env.NODE_ENV === "production") {
    // production-only code
}
```

---

### `serverConfig`

**설명**: `configs/server.json` 설정을 로드한 객체입니다.

**사용예제**:

```typescript
import { serverConfig } from "@api";

console.log(serverConfig.host); // "0.0.0.0"
console.log(serverConfig.port); // 58200
console.log(serverConfig.baseUrl); // "http://localhost:58200"
console.log(serverConfig.logging); // { level: "info", app: { ... } }
```

---

### `substituteEnvVars()`

**설명**: 문자열 내 `${VAR_NAME}` 패턴을 환경변수로 치환합니다.

**사용예제**:

```typescript
import { substituteEnvVars } from "@api";

const str = "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}";
const result = substituteEnvVars(str);
// result: "Database: localhost:3306/mydb"
```

---

### `resolveConfigsDir()`

**설명**: `configs/` 디렉터리 절대경로를 반환합니다.

**사용예제**:

```typescript
import { resolveConfigsDir } from "@api";
import path from "path";
import fs from "fs";

const configsDir = resolveConfigsDir();
const customFile = path.join(configsDir, "custom-settings.json");
const content = fs.readFileSync(customFile, "utf-8");
```

---

### `resolveModulePath()`

**설명**: 모듈 상대 경로를 해석합니다. 주로 내부 사용입니다.

**사용예제**:

```typescript
import { resolveModulePath } from "@api";

const modulePath = resolveModulePath("../templates");
```

---

### `loadJsonConfig()`

**설명**: JSON 설정 파일을 로드하고 환경변수를 치환합니다.

**사용예제**:

```typescript
import { loadJsonConfig } from "@api";

interface MyConfig {
    apiKey: string;
    endpoint: string;
}

const config = loadJsonConfig<MyConfig>("my-service");
// configs/my-service.json 파일을 로드하고, ${...} 치환
```

---

## 3. 로깅

### `logger`

**설명**: pino 로거 인스턴스입니다. 다양한 로그 레벨을 지원합니다.

**사용예제**:

```typescript
import { logger } from "@api";

logger.info("Application started");
logger.debug({ userId: 123 }, "User action");
logger.warn("Rate limit approaching");
logger.error(new Error("Fatal error"), "Crash detected");
```

---

### `logFmt`

**설명**: 카테고리별 컬러 로그 포맷 유틸리티입니다.

**사용예제**:

```typescript
import { logger, logFmt } from "@api";

logger.info(logFmt.db("Connection established"));
logger.info(logFmt.server("Port 58200 listening"));
logger.info(logFmt.entity("Entity synced with ES"));
logger.warn(logFmt.cache("Cache miss"));
```

---

## 4. Entity Server / 인프라

### `entityServer`

**설명**: Entity Server REST 클라이언트입니다. Admin API와 통신할 때 HMAC 서명을 자동으로 추가합니다.

**사용예제**:

```typescript
import { entityServer } from "@api";

// Entity 조회
const data = await entityServer.get("/entity/User/123");

// Entity 생성
const created = await entityServer.post("/entity/User", {
    name: "John Doe",
    email: "john@example.com",
});

// Entity 수정
const updated = await entityServer.put("/entity/User/123", {
    name: "Jane Doe",
});

// Entity 삭제
await entityServer.delete("/entity/User/123");
```

---

### `ensurePluginEntities()`

**설명**: 플러그인 엔티티 스키마를 Entity Server에 등록합니다.

**사용예제**:

```typescript
import { ensurePluginEntities } from "@api";

// 플러그인 초기화 시 호출
await ensurePluginEntities([
    {
        name: "CustomUser",
        fields: [
            { name: "email", type: "string" },
            { name: "age", type: "number" },
        ],
    },
]);
```

---

### `registerPushService()`

**설명**: 푸시 서비스 레퍼런스를 등록합니다.

**사용예제**:

```typescript
import { registerPushService } from "@api";

// 플러그인 초기화 시
registerPushService({
    send: async (message) => {
        // FCM/APNs 로직
    },
    sendAll: async (messages) => {
        // 대량 발송 로직
    },
});
```

---

## 5. DB / SQL / 캐시

### `dbConn()`

**설명**: 데이터베이스 인스턴스를 반환합니다. 그룹 미지정 시 기본 그룹을 사용합니다.

**사용예제**:

```typescript
import { dbConn, sql } from "@api";

// 기본 DB 그룹으로 조회
const db = dbConn();
const users = await db.selectFrom("users").selectAll().execute();

// 특정 DB 그룹 선택
const analyticsDb = dbConn("analytics");
const report = await analyticsDb.selectFrom("reports").selectAll().execute();

// SQL 템플릿 태그 사용
const user = await db
    .selectFrom("users")
    .where(sql`email = ${email}`)
    .selectAll()
    .executeTakeFirst();
```

---

### `sql`

**설명**: Kysely SQL 템플릿 태그입니다. 동적 SQL 작성 시 사용합니다.

**사용예제**:

```typescript
import { dbConn, sql } from "@api";

const db = dbConn();
const email = "john@example.com";

const result = await db
    .selectFrom("users")
    .where(sql`email = ${email} AND status = ${"active"}`)
    .selectAll()
    .execute();
```

---

### `cache()`

**설명**: 네임스페이스가 적용된 캐시 스토어를 반환합니다.

**사용예제**:

```typescript
import { cache } from "@api";

// "user:123" 키로 저장
const userCache = cache("user");
await userCache.set("123", { id: 123, name: "John" }, 3600);

// 조회
const user = await userCache.get("123");

// 삭제
await userCache.del("123");

// 키 패턴으로 조회
const allUserKeys = await userCache.keys("*");
```

---

### `CacheStore`

**설명**: 캐시 스토어의 타입 인터페이스입니다.

**사용예제**:

```typescript
import type { CacheStore } from "@api";

interface CustomCacheStore extends CacheStore {
    get(key: string): Promise<any>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    del(key: string): Promise<void>;
}
```

---

### `CacheDriver`

**설명**: 캐시 드라이버(memory, Redis, Memcached)를 추상화한 타입입니다.

**사용예제**:

```typescript
import type { CacheDriver } from "@api";

const driver: CacheDriver = "memory" | "redis" | "memcached";
```

---

### `Database`

**설명**: 데이터베이스 테이블 타입 정의를 위한 기본 인터페이스입니다.

**사용예제**:

```typescript
import type { Database } from "@api";

declare global {
    namespace Database {
        interface users {
            id: number;
            email: string;
            name: string;
            created_at: Date;
        }
        interface posts {
            id: number;
            user_id: number;
            title: string;
        }
    }
}
```

---

## 6. 암호화 / 해시 / 보안

### `sha256()`

**설명**: SHA-256 해시를 Buffer로 반환합니다. 후속 암호화나 바이너리 작업에 사용합니다.

**사용예제**:

```typescript
import { sha256 } from "@api";

const data = "my secret data";
const hash = sha256(data);
console.log(hash); // Buffer

// 파생 키 생성
const derivedKey = sha256(hash + salt);
```

---

### `sha256Hex()`

**설명**: SHA-256 해시를 16진수 문자열로 반환합니다.

**사용예제**:

```typescript
import { sha256Hex } from "@api";

const filename = "document.pdf";
const checksum = sha256Hex(filename);
console.log(checksum); // "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
```

---

### `hmacSha256()`

**설명**: HMAC-SHA256을 base64로 반환합니다. 외부 규격이 base64를 요구할 때 사용합니다.

**사용예제**:

```typescript
import { hmacSha256 } from "@api";

// NICE 인증 무결성 검증
const data = "transaction_id=12345";
const key = "my_secret_key";
const signature = hmacSha256(data, key);
console.log(signature); // "i7YW3...==" (base64)

// NICE API 검증
if (signature === niceResponse.signature) {
    console.log("Signature verified");
}
```

---

### `hmacSha256Hex()`

**설명**: HMAC-SHA256을 16진수 문자열로 반환합니다. Solapi, 내부 서명 등에 사용합니다.

**사용예제**:

```typescript
import { hmacSha256Hex } from "@api";

// Solapi Authorization 헤더
const date = new Date().toISOString();
const salt = "random-salt";
const payload = `${date}${salt}`;
const apiSecret = "my-solapi-secret";
const signature = hmacSha256Hex(payload, apiSecret);

// Authorization 헤더: "HMAC-SHA256 signature"
const authHeader = `HMAC-SHA256 ${signature}`;
```

---

### `encryptAesCbc()`

**설명**: AES-256-CBC 대칭 암호화를 수행합니다.

**사용예제**:

```typescript
import { encryptAesCbc } from "@api";

const plaintext = "Sensitive customer data";
const secretKey = "32-byte-secret-key-exactly-here";
const iv = "16-byte-iv-value";

const encrypted = encryptAesCbc(plaintext, secretKey, iv);
console.log(encrypted); // { iv, data } 형태의 hex 문자열
```

---

### `decryptAesCbc()`

**설명**: AES-256-CBC 대칭 복호화를 수행합니다.

**사용예제**:

```typescript
import { decryptAesCbc } from "@api";

const encrypted = "..."; // encryptAesCbc 결과
const secretKey = "32-byte-secret-key-exactly-here";

const decrypted = decryptAesCbc(encrypted, secretKey);
console.log(decrypted); // "Sensitive customer data"
```

---

### `encrypt3DesCbc()`

**설명**: 3DES-CBC 암호화를 수행합니다. 레거시 시스템과의 호환성을 위해 제공됩니다.

**사용예제**:

```typescript
import { encrypt3DesCbc } from "@api";

const plaintext = "Legacy data";
const secretKey = "24-byte-3des-key";
const iv = "8-byte-iv-value";

const encrypted = encrypt3DesCbc(plaintext, secretKey, iv);
```

---

### `decrypt3DesCbc()`

**설명**: 3DES-CBC 복호화를 수행합니다.

**사용예제**:

```typescript
import { decrypt3DesCbc } from "@api";

const encrypted = "..."; // 3DES 암호화된 데이터
const secretKey = "24-byte-3des-key";

const decrypted = decrypt3DesCbc(encrypted, secretKey);
```

---

### `generateVerificationCode()`

**설명**: 인증 코드용 난수 생성합니다. 기본 6자리 숫자입니다.

**사용예제**:

```typescript
import { generateVerificationCode } from "@api";

// 6자리 인증 코드 생성
const code = generateVerificationCode();
console.log(code); // "123456"

// 사용자 인증 코드 저장
await cache("auth").set(`verify:${email}`, code, 600); // 10분 유효

// 검증
const submitted = request.body.code;
const stored = await cache("auth").get(`verify:${email}`);
if (submitted === stored) {
    console.log("Code verified");
}
```

---

### `hashString()`

**설명**: 문자열을 SHA-256 16진수로 해시합니다.

**사용예제**:

```typescript
import { hashString } from "@api";

const password = "user-password";
const hash = hashString(password);
// hash 저장, 이후 비교
```

---

### `hashBuffer()`

**설명**: Buffer를 SHA-256 16진수로 해시합니다.

**사용예제**:

```typescript
import { hashBuffer } from "@api";

const fileContent = Buffer.from("file data");
const fileHash = hashBuffer(fileContent);
console.log(fileHash); // 16진수 문자열
```

---

### `validatePassword()`

**설명**: 비밀번호가 보안 정책을 준수하는지 검증합니다.

**사용예제**:

```typescript
import { validatePassword, loadPasswordPolicy } from "@api";

const policy = await loadPasswordPolicy();
const password = "MyPass123!";

try {
    validatePassword(password, policy);
    console.log("Password is valid");
} catch (error) {
    console.log(error.message); // 정책 위반 메시지
}
```

---

### `loadPasswordPolicy()`

**설명**: `security.json`에서 비밀번호 정책을 로드합니다.

**사용예제**:

```typescript
import { loadPasswordPolicy } from "@api";

const policy = await loadPasswordPolicy();
console.log(policy.minLength); // 8
console.log(policy.requireNumber); // true
console.log(policy.requireSpecial); // true
```

---

### `PasswordPolicy`

**설명**: 비밀번호 정책 설정의 타입입니다.

**사용예제**:

```typescript
import type { PasswordPolicy } from "@api";

const customPolicy: PasswordPolicy = {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
};
```

---

## 7. 이메일 / 푸시 / 템플릿

### `sendEmail()`

**설명**: 이메일을 발송합니다. Handlebars 템플릿을 지원합니다.

**사용예제**:

```typescript
import { sendEmail } from "@api";

await sendEmail({
    to: "user@example.com",
    subject: "Welcome!",
    template: "welcome",
    data: { userName: "John" },
});

// 또는 HTML 직접 전송
await sendEmail({
    to: "admin@example.com",
    subject: "Alert",
    html: "<h1>System Alert</h1>",
});
```

---

### `SendEmailParams`

**설명**: 이메일 발송 파라미터의 타입입니다.

**사용예제**:

```typescript
import type { SendEmailParams } from "@api";

const emailParams: SendEmailParams = {
    to: "user@example.com",
    subject: "Notification",
    template: "notification",
    data: { message: "Important update" },
};
```

---

### `setSharedLayout()`

**설명**: 모든 이메일 템플릿에 공통으로 적용할 레이아웃을 설정합니다.

**사용예제**:

```typescript
import { setSharedLayout } from "@api";

// 앱 시작 시 설정
setSharedLayout("layout.hbs");

// layout.hbs에서 {{{body}}} 부분에 각 이메일 내용 삽입
```

---

### `setTemplateDir()`

**설명**: 이메일 템플릿 디렉터리를 설정합니다.

**사용예제**:

```typescript
import { setTemplateDir } from "@api";

// 커스텀 템플릿 디렉터리 설정
setTemplateDir("/app/email-templates");
```

---

### `renderTemplate()`

**설명**: 파일 기반 Handlebars 템플릿을 렌더링합니다.

**사용예제**:

```typescript
import { renderTemplate } from "@api";

const html = await renderTemplate("welcome.hbs", {
    userName: "John",
    activationLink: "https://example.com/activate/token",
});

console.log(html); // 렌더링된 HTML
```

---

### `renderString()`

**설명**: 문자열 기반 Handlebars 템플릿을 렌더링합니다.

**사용예제**:

```typescript
import { renderString } from "@api";

const template = "Hello {{name}}, your code is {{code}}";
const html = await renderString(template, {
    name: "John",
    code: "123456",
});

console.log(html); // "Hello John, your code is 123456"
```

---

### `replaceVars()`

**설명**: 간단한 변수 치환을 수행합니다. Handlebars보다 가볍습니다.

**사용예제**:

```typescript
import { replaceVars } from "@api";

const text = "Hello {{name}}, your order is {{orderId}}";
const result = replaceVars(text, {
    name: "John",
    orderId: "ORD123",
});

console.log(result); // "Hello John, your order is ORD123"
```

---

### `clearTemplateCache()`

**설명**: 렌더링된 템플릿 캐시를 비웁니다.

**사용예제**:

```typescript
import { clearTemplateCache } from "@api";

// 개발 중 템플릿 수정 후 캐시 초기화
clearTemplateCache();
```

---

### `sendPush()`

**설명**: 단일 사용자에게 푸시 알림을 발송합니다.

**사용예제**:

```typescript
import { sendPush } from "@api";

await sendPush({
    deviceToken: "user-device-token",
    title: "Order Update",
    body: "Your order has been shipped",
    data: { orderId: "12345" },
});
```

---

### `sendPushAll()`

**설명**: 여러 사용자에게 푸시 알림을 대량 발송합니다.

**사용예제**:

```typescript
import { sendPushAll } from "@api";

await sendPushAll([
    {
        deviceToken: "device-1",
        title: "Event",
        body: "New event available",
    },
    {
        deviceToken: "device-2",
        title: "Event",
        body: "New event available",
    },
]);
```

---

### `SendPushParams`

**설명**: 단건 푸시 발송 파라미터 타입입니다.

**사용예제**:

```typescript
import type { SendPushParams } from "@api";

const pushParams: SendPushParams = {
    deviceToken: "token",
    title: "Notification",
    body: "Message content",
    data: { key: "value" },
};
```

---

### `SendPushAllParams`

**설명**: 다건 푸시 발송 파라미터 타입입니다.

**사용예제**:

```typescript
import type { SendPushAllParams } from "@api";

const pushAllParams: SendPushAllParams[] = [
    { deviceToken: "token1", title: "Hi", body: "msg1" },
    { deviceToken: "token2", title: "Hi", body: "msg2" },
];
```

---

## 8. 스케줄 / 분산 락

### `acquireLock()`

**설명**: 데이터베이스 기반 분산 락을 획득합니다. 다중 인스턴스 환경에서 중복 실행을 방지합니다.

**사용예제**:

```typescript
import { acquireLock, releaseLock } from "@api";

const lockId = "daily-report-job";
const acquired = await acquireLock(lockId, 3600); // 1시간 TTL

if (acquired) {
    try {
        // 크리티컬 작업 수행
        await generateDailyReport();
    } finally {
        await releaseLock(lockId);
    }
} else {
    console.log("Lock already held by another instance");
}
```

---

### `releaseLock()`

**설명**: 획득한 분산 락을 해제합니다.

**사용예제**:

```typescript
import { releaseLock } from "@api";

await releaseLock("my-job-lock");
```

---

### `createCron()`

**설명**: Cron 작업을 생성합니다.

**사용예제**:

```typescript
import { createCron } from "@api";

const job = createCron({
    name: "sync-users",
    expression: "0 2 * * *", // 매일 2시
    handler: async () => {
        console.log("Syncing users...");
        await syncUsers();
    },
});

// 필요시 job.stop()
```

---

### `validateCron()`

**설명**: Cron 식의 유효성을 검사합니다.

**사용예제**:

```typescript
import { validateCron } from "@api";

try {
    validateCron("0 2 * * *");
    console.log("Valid cron");
} catch (error) {
    console.log("Invalid cron:", error.message);
}
```

---

### `describeCron()`

**설명**: Cron 식의 의미를 설명하는 텍스트를 반환합니다.

**사용예제**:

```typescript
import { describeCron } from "@api";

const desc = describeCron("0 2 * * *");
console.log(desc); // "At 02:00"

const desc2 = describeCron("*/15 * * * *");
console.log(desc2); // "Every 15 minutes"
```

---

### `nextRuns()`

**설명**: Cron 식의 다음 실행 시각을 계산합니다.

**사용예제**:

```typescript
import { nextRuns } from "@api";

const nextSchedules = nextRuns("0 2 * * *", 5); // 다음 5회
console.log(nextSchedules);
// [
//   2026-03-26T02:00:00Z,
//   2026-03-27T02:00:00Z,
//   ...
// ]
```

---

### `CreateCronOptions`

**설명**: Cron 생성 옵션 타입입니다.

**사용예제**:

```typescript
import type { CreateCronOptions } from "@api";

const options: CreateCronOptions = {
    name: "my-job",
    expression: "0 * * * *",
    handler: async () => {
        // 작업
    },
    timezone: "Asia/Seoul", // 선택사항
};
```

---

### `CronHandle`

**설명**: Cron 핸들 타입입니다. `stop()` 메서드를 제공합니다.

**사용예제**:

```typescript
import type { CronHandle } from "@api";

const handle: CronHandle = createCron({
    name: "test",
    expression: "* * * * *",
    handler: async () => {},
});

// 필요시 중지
handle.stop();
```

---

## 9. HTTP / 포맷 / 타입 변환

### `fetchWithTimeout()`

**설명**: 타임아웃이 내장된 fetch 함수입니다.

**사용예제**:

```typescript
import { fetchWithTimeout } from "@api";

try {
    const response = await fetchWithTimeout(
        "https://api.example.com/data",
        { timeout: 5000 }, // 5초
    );
    const data = await response.json();
} catch (error) {
    if (error.name === "AbortError") {
        console.log("Request timeout");
    }
}
```

---

### `fetchJson()`

**설명**: JSON 응답을 자동으로 파싱하는 fetch helper입니다.

**사용예제**:

```typescript
import { fetchJson } from "@api";

const data = await fetchJson("https://api.example.com/users", {
    method: "GET",
    timeout: 5000,
});

console.log(data); // 이미 파싱된 JSON
```

---

### `toNumber()`

**설명**: 값을 숫자로 강제 변환합니다.

**사용예제**:

```typescript
import { toNumber } from "@api";

console.log(toNumber("123")); // 123
console.log(toNumber("45.67")); // 45.67
console.log(toNumber("abc")); // NaN
console.log(toNumber(null)); // 0
```

---

### `toString()`

**설명**: 값을 문자열로 강제 변환합니다.

**사용예제**:

```typescript
import { toString } from "@api";

console.log(toString(123)); // "123"
console.log(toString(true)); // "true"
console.log(toString(null)); // ""
```

---

### `toBool()`

**설명**: 값을 boolean으로 강제 변환합니다.

**사용예제**:

```typescript
import { toBool } from "@api";

console.log(toBool("true")); // true
console.log(toBool("1")); // true
console.log(toBool("0")); // false
console.log(toBool("")); // false
```

---

### `extractDigits()`

**설명**: 문자열에서 숫자만 추출합니다.

**사용예제**:

```typescript
import { extractDigits } from "@api";

console.log(extractDigits("010-1234-5678")); // "01012345678"
console.log(extractDigits("Price: $100")); // "100"
```

---

### `normalizePhoneE164()`

**설명**: 전화번호를 E.164 형식으로 정규화합니다.

**사용예제**:

```typescript
import { normalizePhoneE164 } from "@api";

console.log(normalizePhoneE164("010-1234-5678")); // "+821012345678"
console.log(normalizePhoneE164("01012345678")); // "+821012345678"
console.log(normalizePhoneE164("+82 10 1234 5678")); // "+821012345678"
```

---

### `formatSqlDateTime()`

**설명**: 날짜를 SQL datetime 형식으로 포맷합니다.

**사용예제**:

```typescript
import { formatSqlDateTime } from "@api";

const date = new Date("2026-03-25T14:30:45Z");
console.log(formatSqlDateTime(date)); // "2026-03-25 14:30:45"
```

---

### `formatBizNum()`

**설명**: 사업자번호를 "XXX-XX-XXXXX" 형식으로 포맷합니다.

**사용예제**:

```typescript
import { formatBizNum } from "@api";

console.log(formatBizNum("1234567890")); // "123-45-67890"
```

---

### `parseUserAgent()`

**설명**: HTTP `User-Agent` 헤더 문자열을 파싱하여 브라우저/OS/기기 정보를 반환합니다.

**사용예제**:

```typescript
import { parseUserAgent } from "@system/api";
import type { ParsedUserAgent } from "@system/api";

const ua: ParsedUserAgent = parseUserAgent(req.headers["user-agent"]);
console.log(ua.browser, ua.os, ua.device);
```

---

## 10. 훅 / 도메인 타입

### `EntityHook`

**설명**: 엔티티 CRUD 훅 인터페이스입니다.

**사용예제**:

```typescript
import type { EntityHook, SubmitContext } from "@api";

const hook: EntityHook = {
    beforeSubmit: async (context: SubmitContext) => {
        console.log("Before saving:", context.entity);
    },
    afterSubmit: async (result) => {
        console.log("After saved:", result);
    },
    beforeDelete: async (context) => {
        console.log("Before delete");
    },
};
```

---

### `UserInfo`

**설명**: 현재 사용자 정보 타입입니다.

**사용예제**:

```typescript
import type { UserInfo } from "@api";

const user: UserInfo = {
    id: "user-123",
    email: "user@example.com",
    roles: ["user", "admin"],
};
```

---

### `SubmitContext`

**설명**: 엔티티 저장(submit) 훅의 컨텍스트입니다.

**사용예제**:

```typescript
import type { SubmitContext } from "@api";
import { registerWithdrawHook, logger } from "@api";

const hook = async (context: SubmitContext) => {
    logger.info(
        {
            entity: context.entity.name,
            user: context.user?.id,
            isCreate: context.isCreate,
        },
        "Entity submitted",
    );

    // 저장 전 검증/변환
    if (context.isCreate && context.entity.type === "premium") {
        context.entity.activatedAt = new Date();
    }
};
```

---

### `DeleteContext`

**설명**: 엔티티 삭제 훅의 컨텍스트입니다.

**사용예제**:

```typescript
import type { DeleteContext } from "@api";
import { logger } from "@api";

const hook = async (context: DeleteContext) => {
    logger.info(
        {
            entityId: context.id,
            entityName: context.entity.name,
            user: context.user?.id,
        },
        "Entity deleting",
    );

    // 삭제 전 정리 작업
    await cleanupRelatedData(context.id);
};
```

---

### `registerWithdrawHook()`

**설명**: 회원 탈퇴 시 실행할 훅을 등록합니다.

**사용예제**:

```typescript
import { registerWithdrawHook } from "@api";

registerWithdrawHook(async (userId) => {
    // 사용자 관련 모든 데이터 삭제/익명화
    await deleteUserData(userId);
    console.log(`User ${userId} withdraw complete`);
});
```

---

### `runWithdrawHooks()`

**설명**: 등록된 모든 회원 탈퇴 훅을 실행합니다.

**사용예제**:

```typescript
import { runWithdrawHooks } from "@api";

// 회원 탈퇴 처리 루트에서
export async function handleWithdraw(request, reply) {
    const userId = request.user.id;

    // 모든 정리 훅 실행
    await runWithdrawHooks(userId);

    return reply.send(ok({ message: "Withdrawal complete" }));
}
```

---

### `WithdrawHookFn`

**설명**: 회원 탈퇴 훅 함수의 타입입니다.

**사용예제**:

```typescript
import type { WithdrawHookFn } from "@api";

const myHook: WithdrawHookFn = async (userId: string) => {
    console.log(`Withdrawing user: ${userId}`);
    // 정리 로직
};
```

---

## 11. Realtime / WebSocket

### `sendRealtimeToAccount()`

**설명**: 특정 계정에 연결된 모든 WebSocket 세션으로 realtime 이벤트를 전송합니다. 반환값은 실제 전송된 연결 수입니다.

**사용예제**:

```typescript
import { sendRealtimeToAccount } from "@system/api";

const delivered = sendRealtimeToAccount(12, {
    type: "event",
    channel: "order",
    event: "order.created",
    data: {
        order_seq: 1001,
        status: "pending",
    },
});

console.log(delivered);
```

---

### `sendRealtimeToConnection()`

**설명**: 특정 connection ID 하나에만 이벤트를 전송합니다. 대상 연결이 없으면 `false`를 반환합니다.

**사용예제**:

```typescript
import { sendRealtimeToConnection } from "@system/api";

const ok = sendRealtimeToConnection("rt_8c6b9d", {
    type: "notification",
    channel: "session",
    event: "session.warning",
    data: {
        message: "다른 기기에서 로그인되었습니다.",
    },
});

console.log(ok);
```

---

### `broadcastRealtime()`

**설명**: 현재 연결된 모든 WebSocket 세션으로 이벤트를 전송합니다. 반환값은 실제 브로드캐스트된 연결 수입니다.

**사용예제**:

```typescript
import { broadcastRealtime } from "@system/api";

const delivered = broadcastRealtime({
    type: "notification",
    channel: "system",
    event: "system.notice",
    data: {
        message: "오늘 23시에 점검이 시작됩니다.",
    },
});

console.log(delivered);
```

---

### `getRealtimeStats()`

**설명**: 현재 realtime 허브의 연결 수와 계정 수를 반환합니다.

**사용예제**:

```typescript
import { getRealtimeStats } from "@system/api";

const stats = getRealtimeStats();
console.log(stats.totalConnections, stats.accountCount);
```

---

### `RealtimeEnvelope`

**설명**: 서버와 클라이언트가 공유하는 공통 메시지 envelope 타입입니다.

**사용예제**:

```typescript
import type { RealtimeEnvelope } from "@system/api";

const envelope: RealtimeEnvelope<{ order_seq: number }> = {
    v: 1,
    id: "msg_01",
    ts: new Date().toISOString(),
    type: "event",
    channel: "order",
    event: "order.created",
    data: { order_seq: 42 },
};
```

---

### `RealtimePublishInput`

**설명**: 서버가 realtime 메시지를 만들 때 사용하는 입력 타입입니다. `event`는 필수이며 `type`, `channel`, `data`, `meta`를 함께 지정할 수 있습니다.

**사용예제**:

```typescript
import type { RealtimePublishInput } from "@system/api";

const payload: RealtimePublishInput = {
    type: "event",
    channel: "inventory",
    event: "inventory.changed",
    data: {
        sku: "A-100",
        quantity: 3,
    },
};
```

---

### `RealtimeStats`

**설명**: realtime 연결 통계 타입입니다.

**사용예제**:

```typescript
import type { RealtimeStats } from "@system/api";

const stats: RealtimeStats = {
    totalConnections: 10,
    accountCount: 4,
};
```

---

## 마이그레이션 체크리스트

새로운 public API를 추가할 때:

- [ ] `src/system/**`에 구현 추가
- [ ] `src/system/public-api.ts`에 export 추가
- [ ] 이 문서(`docs/system-api.md`)에 설명과 사용예제 추가
- [ ] 필요하면 `docs/architecture.md`의 `@system/api` 목록도 갱신
- [ ] `./scripts/build.sh --no-tar`로 빌드 검증

---

## 관련 문서

- [system.md](system.md) — 전체 시스템 구조 및 모듈 설명
- [architecture.md](architecture.md) — 아키텍처 개요
- [security.md](security.md) — 보안 설정
- [configs.md](configs.md) — 설정 파일 가이드
- [cache.md](cache.md) — 캐시 사용법
- [hooks.md](hooks.md) — 훅 상세 가이드
