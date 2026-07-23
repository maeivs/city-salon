# Database 설정 가이드

Entity App Server에서 DB에 직접 접속하여 쿼리를 실행하는 방법을 설명합니다.

---

## 목차

| 섹션                                         | 내용                                                   |
| -------------------------------------------- | ------------------------------------------------------ |
| [1. 설정](#1-설정)                           | database.json 설정 항목, 환경변수 플레이스홀더         |
| [2. 드라이버별 설정](#2-드라이버별-설정)     | MySQL / MariaDB / PostgreSQL / SQLite                  |
| [3. 쿼리 빌더 (Kysely)](#3-쿼리-빌더-kysely) | 테이블 타입 정의, Database 인터페이스 매핑             |
| [4. 사용법](#4-사용법)                       | SELECT / INSERT / UPDATE / DELETE / Raw SQL / 트랜잭션 |
| [5. DB 미설정 시](#5-db-미설정-시)           | null 처리, 503 에러                                    |
| [6. readOnly 모드](#6-readonly-모드)         | 그룹 전체 쓰기 쿼리 차단                               |
| [6.1 tableReadOnly](#61-tablereadonly)       | 특정 테이블 패턴에 쓰기 쿼리 차단                      |
| [7. 예제 코드](#7-예제-코드)                 | src/app/routes/example/                                |
| [8. Kysely 참고 자료](#8-kysely-참고-자료)   | 공식 문서 링크                                         |

---

## 1. 설정

### configs/database.json

```json
{
    "default": "development",
    "groups": {
        "development": {
            "driver": "mysql",
            "host": "${DB_HOST}",
            "port": 3306,
            "database": "${DB_NAME}",
            "user": "${DB_USER}",
            "password": "${DB_PASSWORD}",
            "maxConnections": 10,
            "idleTimeout": 60000,
            "connectionTimeout": 10000,
            "readOnly": false
        }
    }
}
```

`default` — 사용할 그룹 이름을 지정합니다. `groups` 안에 여러 그룹을 정의해두고 환경별로 전환할 수 있습니다.

### 설정 항목

| 항목                | 타입     | 기본값   | 설명                                                       |
| ------------------- | -------- | -------- | ---------------------------------------------------------- |
| `driver`            | string   | _(필수)_ | `mysql` \| `mariadb` \| `tidb` \| `postgresql` \| `sqlite` |
| `host`              | string   | -        | DB 서버 호스트 (sqlite 제외)                               |
| `port`              | number   | -        | DB 서버 포트                                               |
| `database`          | string   | _(필수)_ | DB 이름 (sqlite: 파일 경로)                                |
| `user`              | string   | -        | 접속 사용자                                                |
| `password`          | string   | -        | 접속 비밀번호                                              |
| `maxConnections`    | number   | 10       | 최대 커넥션 수                                             |
| `idleTimeout`       | number   | 60000    | 유휴 커넥션 타임아웃 (ms)                                  |
| `connectionTimeout` | number   | 10000    | 접속 타임아웃 (ms)                                         |
| `ssl`               | boolean  | false    | SSL 사용 여부 (postgresql)                                 |
| `readOnly`          | boolean  | false    | 읽기전용 모드 (그룹 전체 쓰기 쿼리 차단)                   |
| `tableReadOnly`     | string[] | []       | 쓰기를 차단할 테이블 glob 패턴 목록 (예: `["entity_*"]`)   |

### 환경변수 플레이스홀더

설정값에 `${ENV_VAR_NAME}` 형태를 사용하면 `.env` 파일의 환경변수로 자동 치환됩니다.

```json
{
    "host": "${DB_HOST}",
    "password": "${DB_PASSWORD}"
}
```

### 기본 그룹 오버라이드

`database.json`의 `default` 값은 그대로 두고, 실행 환경에서만 기본 그룹을 바꾸려면 `.env`에 `DB_GROUP`을 설정하면 됩니다.

```env
DB_GROUP=development
```

설정한 값은 반드시 `database.json`의 `groups`에 존재해야 합니다.

---

## 2. 드라이버별 설정

### MySQL / TiDB

```json
{
    "driver": "mysql",
    "host": "localhost",
    "port": 3306,
    "database": "myapp",
    "user": "root",
    "password": "secret"
}
```

필요 패키지: `mysql2` (optionalDependencies에 포함)

### MariaDB

```json
{
    "driver": "mariadb",
    "host": "localhost",
    "port": 3306,
    "database": "myapp",
    "user": "root",
    "password": "secret"
}
```

필요 패키지: `mysql2` (optionalDependencies에 포함)

> MariaDB도 내부적으로 `mysql2` 드라이버 + Kysely `MysqlDialect`을 사용합니다. MySQL과 완전 호환됩니다.

### PostgreSQL

```json
{
    "driver": "postgresql",
    "host": "localhost",
    "port": 5432,
    "database": "myapp",
    "user": "postgres",
    "password": "secret",
    "ssl": true
}
```

필요 패키지: `pg` (optionalDependencies에 포함)

### SQLite

```json
{
    "driver": "sqlite",
    "database": "./data/myapp.db"
}
```

필요 패키지: `better-sqlite3` (optionalDependencies에 포함)

> SQLite는 `host`, `port`, `user`, `password` 설정이 불필요합니다.
> `database`에 파일 경로를 지정합니다. `readOnly: true`로 설정하면 파일 잠금 없이 열립니다.

---

## 3. 쿼리 빌더 (Kysely)

Entity App Server는 [Kysely](https://kysely.dev)를 DB 쿼리 빌더로 사용합니다.  
`req.server.db`가 `Kysely<Database>` 인스턴스이며, 타입 안전한 체이닝 쿼리를 제공합니다.

### 테이블 타입 정의

`src/app/database/` 폴더에서 테이블 구조를 정의합니다:

```
src/app/database/
├── index.ts           ← Database 인터페이스 (테이블 매핑 + re-export)
└── tables/
    ├── user.ts        ← UserTable 타입
    └── order.ts       ← OrderTable 타입
```

테이블 타입 정의 (`src/app/database/tables/user.ts`):

```ts
import type { Generated, ColumnType } from "kysely";

export interface UserTable {
    id: Generated<number>; // INSERT 시 생략 가능
    name: string;
    email: string;
    status: "active" | "inactive";
    created_time: ColumnType<Date, string | undefined, never>;
}
```

Database 매핑 (`src/app/database/index.ts`):

```ts
import type { UserTable } from "./tables/user.ts";
import type { OrderTable } from "./tables/order.ts";

export interface Database {
    users: UserTable;
    orders: OrderTable;
    [key: string]: any; // 미정의 테이블도 허용
}
```

- `Generated<T>` — DB가 자동 생성하는 값 (auto increment, default 등). INSERT 시 생략 가능
- `ColumnType<Select, Insert, Update>` — SELECT / INSERT / UPDATE 시 다른 타입 사용

> 테이블 타입을 정의하지 않아도 동작하지만, 정의하면 컬럼명 자동완성 + 타입 체크가 적용됩니다.

---

## 4. 사용법

핸들러에서는 `@system/api` 의 `dbConn()` 헬퍼로 Kysely 인스턴스를 가져옵니다.

```ts
import { dbConn } from "@system/api";

const db = dbConn(); // default 그룹
const db = dbConn("readonly"); // 특정 그룹
```

### 4.1 SELECT

```ts
import { ok, dbConn } from "@system/api";

export async function listUsers(req, reply) {
    const db = dbConn();
    const users = await db
        .selectFrom("users")
        .select(["id", "name", "email"])
        .where("status", "=", "active")
        .orderBy("name", "asc")
        .limit(20)
        .execute();

    return reply.send(ok(users));
}
```

### 4.2 단건 조회

```ts
const user = await dbConn()
    .selectFrom("users")
    .selectAll()
    .where("id", "=", userId)
    .executeTakeFirst(); // 결과 1건 또는 undefined
```

### 4.3 INSERT

```ts
const result = await dbConn()
    .insertInto("users")
    .values({ name: "John", email: "john@test.com", status: "active" })
    .executeTakeFirst();

console.log(result.insertId); // auto increment ID
```

### 4.4 UPDATE

```ts
const result = await dbConn()
    .updateTable("users")
    .set({ status: "inactive" })
    .where("id", "=", userId)
    .executeTakeFirst();

console.log(result.numUpdatedRows); // 영향받은 행 수
```

### 4.5 DELETE

```ts
const result = await dbConn()
    .deleteFrom("users")
    .where("id", "=", userId)
    .executeTakeFirst();

console.log(result.numDeletedRows);
```

### 4.6 Raw SQL

복잡한 쿼리나 `Database` 인터페이스에 등록하지 않은 테이블은 `sql` 태그를 사용합니다:

```ts
import { sql, dbConn } from "@system/api";

interface StatsRow {
    status: string;
    count: number;
}

const { rows } = await sql<StatsRow>`
    SELECT status, COUNT(*) as count
    FROM users
    GROUP BY status
    ORDER BY count DESC
`.execute(dbConn());
```

`sql` 태그 안에서 `${}` 보간은 자동으로 파라미터 바인딩됩니다 (SQL injection 방지):

```ts
const { rows } = await sql<User>`
    SELECT * FROM users
    WHERE name LIKE ${"%" + searchTerm + "%"}
    AND status = ${status}
    LIMIT ${limit}
`.execute(dbConn());
```

### 4.7 동적 WHERE 조건

```ts
const db = dbConn();
let query = db.selectFrom("users").select(["id", "name", "email"]);

if (name) {
    query = query.where("name", "like", `%${name}%`);
}
if (status) {
    query = query.where("status", "=", status);
}

const users = await query.execute();
```

### 4.8 OR 조건

```ts
const users = await dbConn()
    .selectFrom("users")
    .selectAll()
    .where((eb) =>
        eb.or([eb("name", "like", `%${q}%`), eb("email", "like", `%${q}%`)]),
    )
    .execute();
```

### 4.9 JOIN

```ts
const result = await dbConn()
    .selectFrom("orders")
    .innerJoin("users", "users.id", "orders.user_id")
    .select(["users.name", "orders.total", "orders.status"])
    .where("orders.status", "=", "completed")
    .execute();
```

### 4.10 트랜잭션

```ts
await dbConn()
    .transaction()
    .execute(async (trx) => {
        await trx
            .updateTable("orders")
            .set({ status: "completed" })
            .where("id", "=", orderId)
            .execute();

        await trx
            .insertInto("order_logs")
            .values({
                order_id: orderId,
                action: "completed",
                created_time: new Date(),
            })
            .execute();
    });
```

### 4.11 서브쿼리

```ts
// WHERE 절 서브쿼리 — 특정 조건을 가진 user_id 목록으로 필터
const db = dbConn();
const results = await db
    .selectFrom("orders")
    .selectAll()
    .where("user_id", "in", (eb) =>
        eb.selectFrom("users").select("seq").where("status", "=", "active"),
    )
    .execute();
```

```ts
// FROM 절 서브쿼리 — 인라인 뷰
const db = dbConn();
const result = await db
    .selectFrom(
        db
            .selectFrom("orders")
            .select(["user_id", db.fn.count("seq").as("order_count")])
            .groupBy("user_id")
            .as("order_stats"),
    )
    .select(["user_id", "order_count"])
    .where("order_count", ">=", 5)
    .execute();
```

### 4.12 UNION

```ts
import { unionAll } from "kysely";

// UNION ALL — 두 쿼리 결과 합치기 (중복 포함)
const db = dbConn();
const combined = await unionAll(
    db.selectFrom("sms_log").select(["seq", "content", "created_time"]),
    db.selectFrom("smtp_log").select(["seq", "content", "created_time"]),
)
    .orderBy("created_time", "desc")
    .limit(50)
    .execute();
```

```ts
import { union } from "kysely";

// UNION — 중복 제거
const db = dbConn();
const unique = await union(
    db.selectFrom("push_log").select("account_seq"),
    db.selectFrom("sms_log").select("account_seq"),
).execute();
```

---

## 5. DB 미설정 시

`configs/database.json` 파일이 없으면 `dbConn()` 호출 시 `BadRequestError(503)`를 던집니다.  
DB가 선택적으로 사용되는 핸들러라면 `req.server.db` 로 null 체크를 직접 할 수 있습니다:

````ts
export async function handler(req, reply) {
    if (!req.server.db) {
        return reply.code(503).send(fail("Database not configured"));
    }
    // ... 쿼리 실행
}

---

## 6. readOnly 모드

`database.json`에서 그룹에 `"readOnly": true`로 설정하면 해당 그룹의 모든 INSERT, UPDATE, DELETE 쿼리가 차단됩니다.

```json
{
    "driver": "mysql",
    "database": "analytics",
    "readOnly": true
}
````

읽기전용 DB(리플리카, 분석용 등)에 연결할 때 사용하면 실수로 데이터를 변경하는 것을 방지할 수 있습니다.

---

## 6.1 tableReadOnly

`database.json` 최상위에 `"tableReadOnly"`를 설정하면 **패턴과 일치하는 테이블에 대한 쓰기 쿼리**만 차단합니다.  
glob 와일드카드(`*`, `?`)를 지원하며, 대소문자를 구분하지 않습니다.

```json
{
    "default": "development",
    "tableReadOnly": ["entity_*"],
    "groups": {
        "development": { "...": "..." }
    }
}
```

위 설정 시 `entity_` 로 시작하는 모든 테이블(`entity_user`, `entity_config` 등)에 INSERT / UPDATE / DELETE를 실행하면 런타임 오류가 발생합니다.

```typescript
// ✅ SELECT는 허용
await app.db.selectFrom("entity_user").selectAll().execute();

// ❌ INSERT 차단 — 런타임 Error 발생
await app.db.insertInto("entity_user").values({ ... }).execute();
// Error: 테이블 "entity_user"은 읽기 전용입니다 — 쓰기 쿼리 차단 (패턴: "entity_*")
```

> **`readOnly` vs `tableReadOnly`**
>
> - `readOnly` — `groups` 안의 특정 그룹 전체를 읽기전용으로 설정합니다.
> - `tableReadOnly` — 모든 그룹에 공통 적용되며, 패턴과 일치하는 테이블만 쓰기를 차단합니다.

---

## 7. 예제 코드

전체 CRUD + 고급 쿼리 예제는 `src/app/routes/example/` 폴더를 참조하세요:

```
src/app/routes/example/
├── route.ts       ← 라우트 테이블 (URL ↔ 핸들러 매핑)
├── handlers.ts    ← 핸들러 구현 (Kysely 쿼리 예제)
└── types.ts       ← 요청/응답 타입 정의
```

이 폴더를 복사하면 새 라우트를 빠르게 만들 수 있습니다.

---

## 8. Kysely 참고 자료

- [Kysely 공식 문서](https://kysely.dev/docs/intro)
- [Kysely API 레퍼런스](https://kysely-org.github.io/kysely-apidoc/)
- [Kysely GitHub](https://github.com/kysely-org/kysely)
