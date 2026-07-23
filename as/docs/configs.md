# 설정 파일 가이드

Entity App Server의 설정은 두 곳에 나뉩니다.

| 위치             | 용도                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| `.env`           | **비밀값** — API Key, HMAC Secret, JWT Secret 등 외부에 노출되면 안 되는 값 |
| `configs/*.json` | **서버 동작** — 포트, 로깅, DB 접속, CORS 등 행동 방식을 제어하는 값        |

---

## 설정 파일 목록

| 설정                                      | 설명                                       |
| ----------------------------------------- | ------------------------------------------ |
| [.env](#env)                              | 비밀값 (Entity Server 키, JWT Secret)      |
| [server.json](#serverjson)                | 포트, 호스트, 로깅                         |
| [database.json](database.md)              | DB 드라이버, 접속 정보, 읽기 전용          |
| [cache.json](cache.md)                    | 캐시 드라이버 (memory / redis / memcached) |
| [cors.json](security.md#corsjson)         | CORS 허용 도메인, 헤더                     |
| [csrf.json](security.md#csrfjson)         | CSRF 토큰 쿠키/헤더 정책                   |
| [security.json](security.md)              | 패킷 암호화, 비밀번호 정책                 |
| [identity.json](plugins/identity.md)      | JWT, 세션, 인증                            |
| [llm.json](plugins/llm.md)                | LLM (OpenAI / Claude / Gemini)             |
| [ocr.json](plugins/ocr.md)                | OCR                                        |
| [pg.json](plugins/pg.md)                  | PG 결제                                    |
| [tax-invoice.json](plugins/taxinvoice.md) | 전자세금계산서                             |
| [holidays.json](#holidaysjson)            | 휴일 데이터 동기화                         |
| [alimtalk.json](plugins/alimtalk.md)      | 카카오 알림톡                              |
| [friendtalk.json](plugins/friendtalk.md)  | 카카오 친구톡                              |
| [sms.json](plugins/sms.md)                | SMS 발송 플러그인                          |
| [push.json](plugins/push.md)              | FCM/APNs 푸시 알림                         |

> 파일이 없으면 해당 기능은 기본값으로 동작하거나 비활성화됩니다.

---

## .env

`.env` 파일에는 **외부 서비스 연결에 필요한 비밀값만** 적습니다.  
서버 포트, 로그 레벨 등 행동 설정은 `configs/server.json`에서 합니다.

### 전체 예시

```env
# ── 필수 ─────────────────────────────────────────────
NODE_ENV=production

ENTITY_SERVER_URL=http://127.0.0.1:47200
ENTITY_API_KEY=your-api-key
ENTITY_HMAC_SECRET=change-this-to-32-char-or-longer-hmac-secret

JWT_SECRET=change-this-to-same-32-char-or-longer-jwt-secret

# ── DB 직접 접속 (database.json 환경변수 치환용) ──
DB_HOST_DEVELOPMENT=127.0.0.1
DB_PORT_DEVELOPMENT=3306
DB_NAME_DEVELOPMENT=mydb_dev
DB_USER_DEVELOPMENT=root
DB_PASSWORD_DEVELOPMENT=password

# ── 선택: 플러그인 API 키 ─────────────────────────
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# ALIMTALK_API_KEY=
# TOSS_SECRET_KEY=
```

### 항목 설명

| 항목                 | 필수 | 설명                                                                                                      |
| -------------------- | :--: | --------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`           |  ✅  | `development` \| `production` \| `test`                                                                   |
| `ENTITY_SERVER_URL`  |  ✅  | Entity Server 주소 — Entity Server의 `server.json` `port`(기본: 47200)와 일치                             |
| `ENTITY_API_KEY`     |  ✅  | Entity Server 관리자 화면에서 발급한 API Key                                                              |
| `ENTITY_HMAC_SECRET` |  ✅  | API Key 발급 시 함께 제공되는 HMAC Secret, 32자 이상                                                      |
| `JWT_SECRET`         |  ✅  | **Entity Server와 반드시 동일한 값**, 32자 이상 — Entity Server `configs/auth/jwt.json`의 `${JWT_SECRET}` |
| `DB_*`               |  -   | `database.json`에서 `${변수명}` 형태로 참조할 때만 필요                                                   |

### Entity Server 키 맞추기

게이트웨이는 Entity Server에 API Key + HMAC 서명으로 인증합니다.  
세 값은 **Entity Server에서 발급된 값**을 그대로 복사해야 합니다.

```
Entity Server 관리자 → API Keys 메뉴 → 키 생성
  └─ api_key   → 게이트웨이 .env ENTITY_API_KEY
  └─ hmac_secret → 게이트웨이 .env ENTITY_HMAC_SECRET
```

JWT Secret은 Entity Server가 발급한 토큰을 게이트웨이가 직접 검증하기 때문에 반드시 같아야 합니다:

```
Entity Server configs/auth/jwt.json
  └─ "secret": "${JWT_SECRET}"  ← 엔티티 서버 .env의 JWT_SECRET

게이트웨이 .env
  └─ JWT_SECRET=<위와 동일한 값>
```

> ⚠️ `JWT_SECRET`이 다르면 게이트웨이에서 토큰 검증에 실패해 모든 인증 요청이 401을 반환합니다.

### .env.example

프로젝트 생성 시 `.env`가 `.env.example`과 함께 생성됩니다. 기본값은 예시 값이므로 바로 수정해서 사용하세요.

필요하면 `.env.example`을 기준으로 `.env`를 다시 만들 수 있습니다.

---

## server.json

Entity App Server의 포트, 호스트, 로깅 동작을 제어합니다.

### 전체 예시

```json
{
    "namespace": "entity-app-server",
    "port": 3000,
    "host": "0.0.0.0",
    "logging": {
        "level": "info",
        "logDir": "./logs",
        "access": {
            "enabled": true,
            "filename": "access",
            "frequency": "daily",
            "maxFiles": 14,
            "maxSize": "100m"
        },
        "error": {
            "enabled": true,
            "filename": "error",
            "frequency": "daily",
            "maxFiles": 30,
            "maxSize": "50m"
        }
    }
}
```

### 설정 항목

| 항목        | 타입   | 기본값                | 설명                                                                                                                           |
| ----------- | ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `namespace` | string | `"entity-app-server"` | 인스턴스 식별자 — 모든 캐시 키가 `sha256(namespace:key)` 로 저장됨. 여러 앱이 Redis/Memcached를 공유할 때 키 충돌 방지         |
| `port`      | number | `3000`                | HTTP 리슨 포트                                                                                                                 |
| `host`      | string | `"0.0.0.0"`           | 바인드 호스트 (`127.0.0.1`로 제한 가능)                                                                                        |
| `baseUrl`   | string | 자동 계산             | 공개 베이스 URL. 생략하면 `http://localhost:<port>` 또는 지정한 host 기반으로 자동 계산. 외부 도메인/프록시가 있으면 직접 지정 |

#### logging

| 항목                       | 타입    | 기본값     | 설명                                                         |
| -------------------------- | ------- | ---------- | ------------------------------------------------------------ |
| `logging.level`            | string  | `"info"`   | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` |
| `logging.logDir`           | string  | `"./logs"` | 로그 파일 저장 디렉터리                                      |
| `logging.access.enabled`   | boolean | `true`     | 접근 로그 파일 활성화                                        |
| `logging.access.filename`  | string  | `"access"` | 파일 기본명 (pino-roll이 날짜 접미사 자동 추가)              |
| `logging.access.frequency` | string  | `"daily"`  | 로테이션 주기: `"daily"` \| `"hourly"`                       |
| `logging.access.maxFiles`  | number  | `14`       | 보관 최대 파일 수 — 초과분 자동 삭제                         |
| `logging.access.maxSize`   | string  | `"100m"`   | 파일당 최대 크기 — 초과 시 즉시 교체                         |
| `logging.error.enabled`    | boolean | `true`     | 에러 로그 파일 활성화 (error 레벨 이상)                      |
| `logging.error.filename`   | string  | `"error"`  | 파일 기본명                                                  |
| `logging.error.frequency`  | string  | `"daily"`  | 로테이션 주기                                                |
| `logging.error.maxFiles`   | number  | `30`       | 보관 최대 파일 수                                            |
| `logging.error.maxSize`    | string  | `"50m"`    | 파일당 최대 크기                                             |

### 로그 파일 구조

`logs/` 디렉터리에 날짜별 파일이 생성됩니다:

```
logs/
├── access.2026-03-04.log   ← 오늘 접근 로그
├── access.2026-03-03.log   ← 어제 (maxFiles 초과 시 자동 삭제)
├── error.2026-03-04.log    ← 오늘 에러 로그
└── error.2026-03-03.log
```

`access.log` — HTTP 요청 1건당 1줄 JSON:

```json
{
    "requestId": "abc-123",
    "method": "GET",
    "url": "/api/user/list",
    "statusCode": 200,
    "responseTime": 12,
    "ip": "123.45.67.89",
    "userAgent": "Mozilla/5.0 ..."
}
```

`error.log` — `error` / `fatal` 레벨만 기록:

```json
{
    "level": 50,
    "err": { "message": "...", "stack": "..." },
    "msg": "Unhandled error"
}
```

### 환경별 동작

| 동작       | development        | production                         |
| ---------- | ------------------ | ---------------------------------- |
| 콘솔 출력  | pino-pretty (컬러) | JSON stdout                        |
| access.log | 파일 기록됨        | `logging.access.enabled` 값에 따라 |
| error.log  | 파일 기록됨        | `logging.error.enabled` 값에 따라  |

### 환경변수 플레이스홀더

```json
{
    "port": "${SERVER_PORT}"
}
```

외부 공개 주소가 포트 기반 기본값과 다를 때만 `baseUrl`을 추가하면 됩니다.

```json
{
    "port": "${SERVER_PORT}",
    "baseUrl": "https://api.example.com"
}
```

---

## cors.json / csrf.json / security.json

CORS, CSRF, 패킷 암호화, 비밀번호 정책 설정은 **[security.md](security.md)** 를 참고하세요.

---

## holidays.json

공휴일 데이터를 자동으로 동기화하는 스케줄러 설정입니다.  
Entity Server의 `holiday` 엔티티에 공공 데이터 포털(data.go.kr) API로 조회한 공휴일을 저장합니다.

### 전체 예시

```json
{
    "enabled": true,
    "cron": "0 3 1 1,12 *",
    "yearsAhead": 1,
    "entity": "holiday"
}
```

### 설정 항목

| 항목         | 타입    | 기본값           | 설명                                           |
| ------------ | ------- | ---------------- | ---------------------------------------------- |
| `enabled`    | boolean | `true`           | 공휴일 동기화 활성화                           |
| `cron`       | string  | `"0 3 1 1,12 *"` | 실행 주기 — 기본값은 1월 1일·12월 1일 새벽 3시 |
| `yearsAhead` | number  | `1`              | 현재 연도 기준 몇 년 앞까지 미리 동기화할지    |
| `entity`     | string  | `"holiday"`      | 공휴일 데이터를 저장할 엔티티 이름             |

API Key는 `.env`의 `DATAGOKR_API_KEY`에 설정합니다:

```env
DATAGOKR_API_KEY=your-data-go-kr-api-key
```
