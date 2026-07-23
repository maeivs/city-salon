# 캐시 가이드

Entity App Server 전역 캐시 시스템입니다.  
`app.cache` 데코레이터로 등록되며, `@system/api` 의 `cache()` 헬퍼로 라우트·플러그인 어디서나 동일한 API 로 사용합니다.

**관련 문서**: [설정 파일 가이드](configs.md)

---

## 설정

`configs/cache.json` 파일로 드라이버와 TTL 을 지정합니다.  
파일이 없으면 메모리 드라이버 + TTL 3600초로 동작합니다.

```bash
cp configs/cache.example.json configs/cache.json
```

---

## 드라이버

| 드라이버      | `driver` 값   | 추가 설치             | 특징                                      |
| ------------- | ------------- | --------------------- | ----------------------------------------- |
| **메모리**    | `"memory"`    | 없음                  | 기본값. 빠름. 프로세스 재시작 시 초기화.  |
| **Redis**     | `"redis"`     | `npm install ioredis` | 프로세스 간 공유, 영속성. 외부 서버 필요. |
| **Memcached** | `"memcached"` | `npm install memjs`   | 경량·고속. `size` 조회 불가 (항상 `-1`).  |

### memory (기본)

```json
{
    "driver": "memory",
    "default_ttl_seconds": 3600,
    "memory": {
        "max_entries": 10000
    }
}
```

| 항목          | 타입   | 기본값  | 설명                                                          |
| ------------- | ------ | ------- | ------------------------------------------------------------- |
| `max_entries` | number | `10000` | 최대 항목 수. 초과 시 만료 항목 → 오래된 순으로 20% 자동 제거 |

### redis

```json
{
    "driver": "redis",
    "default_ttl_seconds": 3600,
    "redis": {
        "host": "localhost",
        "port": 6379,
        "password": "",
        "db": 0,
        "key_prefix": "entity-app-server:",
        "connect_timeout_ms": 5000
    }
}
```

| 항목                 | 타입   | 기본값                 | 설명                  |
| -------------------- | ------ | ---------------------- | --------------------- |
| `host`               | string | `localhost`            | Redis 호스트          |
| `port`               | number | `6379`                 | Redis 포트            |
| `password`           | string | _(없음)_               | AUTH 비밀번호         |
| `db`                 | number | `0`                    | Redis DB 번호         |
| `key_prefix`         | string | `"entity-app-server:"` | 모든 키에 붙는 접두사 |
| `connect_timeout_ms` | number | `5000`                 | 연결 타임아웃 (ms)    |

### memcached

```json
{
    "driver": "memcached",
    "default_ttl_seconds": 3600,
    "memcached": {
        "host": "localhost",
        "port": 11211,
        "username": "",
        "password": ""
    }
}
```

| 항목       | 타입   | 기본값      | 설명                      |
| ---------- | ------ | ----------- | ------------------------- |
| `host`     | string | `localhost` | Memcached 호스트          |
| `port`     | number | `11211`     | Memcached 포트            |
| `username` | string | _(없음)_    | SASL 인증 사용자명 (선택) |
| `password` | string | _(없음)_    | SASL 인증 비밀번호 (선택) |

---

## 공통 설정

| 항목                  | 타입   | 기본값     | 설명                               |
| --------------------- | ------ | ---------- | ---------------------------------- |
| `driver`              | string | `"memory"` | 사용할 드라이버                    |
| `default_ttl_seconds` | number | `3600`     | 기본 TTL (초). `0` 이면 만료 없음. |

---

## 사용법

### 기본 패턴 — Cache-Aside

```ts
import { cache, ok } from "@system/api";
import type { FastifyRequest, FastifyReply } from "fastify";

async function handler(req: FastifyRequest, reply: FastifyReply) {
    const store = cache();

    // 1. 캐시 조회
    const cached = await store.get<User[]>("users:all");
    if (cached) return ok(cached);

    // 2. 원본 데이터 조회
    const users = await dbConn().selectFrom("users").selectAll().execute();

    // 3. 캐시 저장 (TTL: 60초)
    await cache.set("users:all", users, 60_000);

    return ok(users);
}
```

### TTL 지정

`set()` 의 세 번째 인수는 **밀리초** 단위입니다.

```ts
await cache.set("key", data); // default_ttl_seconds 사용
await cache.set("key", data, 30_000); // 30초
await cache.set("key", data, 60 * 60_000); // 1시간
await cache.set("key", data, 0); // 만료 없음
```

### 전체 API

```ts
const store = cache();

await store.get<T>("key"); // T | null — 없거나 만료 시 null
await store.set("key", value); // default TTL 로 저장
await store.set("key", value, ttlMs); // 지정 TTL 로 저장
await store.del("key"); // 단일 키 삭제
await store.has("key"); // boolean
await store.flush(); // 전체 삭제

cache.size; // 현재 항목 수 (memcached 는 -1)
cache.driver; // "memory" | "redis" | "memcached"
```

### 키 네이밍 규칙

충돌 방지를 위해 `{리소스}:{식별자}` 형태를 권장합니다.

```ts
"users:all";
"users:123";
"products:list:page1";
"config:holidays:2026";
```

### 캐시 무효화

데이터 변경 시 해당 키를 삭제합니다.

```ts
// 사용자 목록 업데이트 후
await db.updateTable("users")...execute();
await cache().del("users:all");
```

### 플러그인에서 사용

플러그인 `index.ts` 에서는 `app.cache` 로 직접 접근합니다.

```ts
// src/app/plugins/my-plugin/service.ts
import { cache } from "@system/api";

export async function fetchWithCache(key: string) {
    const store = cache();
    const cached = await store.get<Data>(key);
    if (cached) return cached;

    const data = await fetchData();
    await store.set(key, data, 5 * 60_000); // 5분
    return data;
}
```

---

## 드라이버별 주의 사항

### 메모리

- 프로세스 재시작 시 캐시가 초기화됩니다.
- 멀티 프로세스(PM2 cluster 등) 환경에서는 **프로세스 간 캐시가 공유되지 않습니다**.
- 개발·단일 프로세스 환경에 적합합니다.

### Redis

- 외부 Redis 서버가 필요합니다.
- 프로세스 간 캐시가 공유됩니다.
- `key_prefix` 로 다른 애플리케이션과 키 충돌을 방지하세요.
- Redis 연결 실패 시 서버 시작이 중단됩니다.

### Memcached

- 외부 Memcached 서버가 필요합니다.
- `cache.size` 는 키 목록 조회 API 부재로 항상 `-1` 을 반환합니다.
- `cache.flush()` 는 **해당 서버 전체**를 비웁니다 (네임스페이스 없음).
