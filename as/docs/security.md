# 보안 설정 가이드

CORS, CSRF 방어, 패킷 암호화, 비밀번호 정책 설정 안내입니다.

| 설정 파일       | 섹션                                                              |
| --------------- | ----------------------------------------------------------------- |
| `cors.json`     | [CORS](#corsjson)                                                 |
| `csrf.json`     | [CSRF](#csrf)                                                     |
| `security.json` | [패킷 암호화](#packet_encrypt), [비밀번호 정책](#password_policy) |

---

## cors.json

프론트엔드 도메인의 CORS 접근을 제어합니다.  
파일이 없으면 `http://localhost:5173` 하나만 허용합니다.

### 예시

```json
{
    "enabled": true,
    "origins": ["http://localhost:5173", "https://app.yourdomain.com"],
    "credentials": true,
    "allowed_headers": [
        "Authorization",
        "Content-Type",
        "x-request-id",
        "x-csrf-token"
    ],
    "exposed_headers": [
        "x-request-id",
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-reset"
    ],
    "max_age": 86400
}
```

### 설정 항목

| 항목              | 타입     | 기본값                      | 설명                                            |
| ----------------- | -------- | --------------------------- | ----------------------------------------------- |
| `enabled`         | boolean  | `true`                      | CORS 활성화 (`false`이면 동일 출처만 허용)      |
| `origins`         | string[] | `["http://localhost:5173"]` | 허용할 출처 목록 — 정확한 URL 형식              |
| `credentials`     | boolean  | `true`                      | 쿠키·Authorization 헤더 포함 요청 허용          |
| `allowed_headers` | string[] | _(기본 CORS 헤더)_          | 클라이언트가 보낼 수 있는 추가 헤더             |
| `exposed_headers` | string[] | _(없음)_                    | 브라우저 JS에서 읽을 수 있도록 노출할 응답 헤더 |
| `max_age`         | number   | _(없음)_                    | preflight 캐시 시간(초) — `86400` = 24시간      |

> `origins`에 와일드카드(`*`)는 지원하지 않습니다. `credentials: true`와 함께 사용할 수 없기 때문입니다.

---

## csrf.json

CSRF 방어 설정 파일입니다. 파일이 없으면 CSRF는 비활성화됩니다.

### 전체 예시

```json
{
    "enabled": true,
    "cookie_name": "_csrf"
}
```

---

## csrf

브라우저가 직접 붙는 서버는 앱서버입니다. 따라서 프런트엔드가 AS만 사용하는 배포에서는 다음 원칙으로 운영합니다.

- AS `csrf.enabled = true`
- AS `/v1/health`가 `_csrf` 쿠키를 발급
- 브라우저는 `_csrf` 쿠키 값을 읽어 `X-CSRF-Token` 헤더로 전송
- ES는 브라우저 직접 노출이 아니라면 CSRF를 끄고, AS 뒤에서만 동작

### 예시

```json
{
    "enabled": true,
    "cookie_name": "_csrf",
    "header_name": "x-csrf-token",
    "cookie_options": {
        "http_only": false,
        "same_site": "lax",
        "path": "/",
        "secure": false,
        "max_age": 86400
    },
    "skip_paths": ["/v1/health", "/v1/alimtalk/webhook"]
}
```

### 설정 항목

| 항목                            | 타입     | 기본값   | 설명                                                  |
| ------------------------------- | -------- | -------- | ----------------------------------------------------- |
| `csrf.enabled`                  | boolean  | `false`  | CSRF 방어 활성화                                      |
| `csrf.cookie_options.http_only` | boolean  | `false`  | 브라우저 JS가 `_csrf`를 읽어 헤더에 넣을 수 있어야 함 |
| `csrf.cookie_options.secure`    | boolean  | `false`  | HTTPS 전용 쿠키 — 운영 환경에서는 `true` 권장         |
| `csrf.skip_paths`               | string[] | _(없음)_ | 웹훅 등 CSRF 검사를 건너뛸 경로                       |

> `_csrf` 쿠키는 Double Submit Cookie 패턴에 따라 JS가 직접 값을 읽어 요청 헤더에 포함합니다.  
> 브라우저 세션 시작점은 `/v1/health`입니다. entity-client는 health 응답 뒤 `_csrf` 쿠키를 감지하면 변경 메서드에 헤더를 자동으로 붙입니다.  
> `cookie_name`, `header_name`, `safe_methods` 등 나머지 옵션은 entity-client와 맞물린 규약이므로 임의 변경하지 않는 편이 안전합니다.

---

## security.json

패킷 암호화와 비밀번호 정책을 한 파일에서 제어합니다. 파일이 없으면 두 기능은 기본값으로 동작합니다.

### 전체 예시

```json
{
    "packet_encrypt": { ... },
    "password_policy": { ... }
}
```

---

## packet_encrypt

libsodium 기반 요청/응답 페이로드 암호화입니다.

### 예시

```json
{
    "packet_encrypt": {
        "enabled": true,
        "require_encryption": true,
        "magic_min": 2,
        "magic_range": 14
    }
}
```

### 설정 항목

| 항목                                | 타입     | 기본값   | 설명                                               |
| ----------------------------------- | -------- | -------- | -------------------------------------------------- |
| `packet_encrypt.enabled`            | boolean  | `false`  | 패킷 암호화 활성화                                 |
| `packet_encrypt.require_encryption` | boolean  | `true`   | 미암호화 요청 거부 여부 (`false`이면 평문도 허용)  |
| `packet_encrypt.magic_min`          | number   | `2`      | 매직 바이트 최솟값 (entity-client와 동일하게 설정) |
| `packet_encrypt.magic_range`        | number   | `14`     | 매직 바이트 범위 (entity-client와 동일하게 설정)   |
| `packet_encrypt.skip_paths`         | string[] | _(없음)_ | 암호화 검사를 건너뛸 경로 (필요 시 추가)           |

> `magic_min` / `magic_range`는 entity-client 설정과 반드시 일치해야 합니다.  
> HKDF 키 파생 레이블(`entity-server:packet-encryption`)은 코드에 하드코딩되어 있으며 변경할 수 없습니다.

### .env 오버라이드

`packet_encrypt` 섹션은 `.env`의 `PACKET_ENCRYPT_ENABLED`로만 켜고 끌 수 있습니다. 값이 있으면 `security.json`의 `packet_encrypt.enabled`보다 우선합니다.

| 환경변수                 | 설명                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `PACKET_ENCRYPT_ENABLED` | 패킷 암호화 활성화 여부 (`true`, `false`, `1`, `0`, `yes`) |

예시:

```env
PACKET_ENCRYPT_ENABLED=true
```

---

## password_policy

회원가입·비밀번호 변경 시 공통으로 적용되는 복잡도 규칙입니다.  
`enabled: false`(기본)이면 길이·복잡도 검증 없이 통과합니다.

앱 코드에서 `validatePassword()`를 호출하여 이 정책을 적용합니다.

```ts
import { validatePassword } from "@system/api";

const err = validatePassword(newPassword, [user.phone, user.birthday]);
if (err) return reply.code(400).send(fail(err));
```

### 예시

```json
{
    "password_policy": {
        "enabled": false,
        "min_length": 8,
        "max_length": 128,
        "require_mixed_case": false,
        "require_number": false,
        "require_special": false,
        "history_count": 5,
        "forbidden_patterns": {
            "sequential_digits": true,
            "repeated_chars": true,
            "keyboard_patterns": false,
            "sequential_length": 4
        },
        "pii_check": {
            "enabled": false,
            "entity": "user",
            "fields": ["phone", "birthday"]
        }
    }
}
```

### 기본 복잡도 설정

| 항목                 | 타입    | 기본값  | 설명                                              |
| -------------------- | ------- | ------- | ------------------------------------------------- |
| `enabled`            | boolean | `false` | 정책 활성화 — `false`이면 모든 복잡도 검사 건너뜀 |
| `min_length`         | number  | `8`     | 최소 길이                                         |
| `max_length`         | number  | `128`   | 최대 길이                                         |
| `require_mixed_case` | boolean | `false` | 대문자 + 소문자 모두 포함 여부                    |
| `require_number`     | boolean | `false` | 숫자 포함 여부                                    |
| `require_special`    | boolean | `false` | 특수문자 포함 여부 (`!@#$%^&*` 등)                |
| `history_count`      | number  | `5`     | 최근 N개 비밀번호 재사용 금지 (0이면 비활성)      |

### forbidden_patterns — 금지 패턴

| 항목                | 타입    | 기본값  | 설명                                       |
| ------------------- | ------- | ------- | ------------------------------------------ |
| `sequential_digits` | boolean | `true`  | 연속 숫자 금지 (예: `1234`, `9876`)        |
| `repeated_chars`    | boolean | `true`  | 반복 문자 금지 (예: `aaaa`, `1111`)        |
| `keyboard_patterns` | boolean | `false` | 키보드 연속 패턴 금지 (예: `qwer`, `asdf`) |
| `sequential_length` | number  | `4`     | 위 패턴 적용 최소 연속 길이                |

### pii_check — 개인정보 포함 금지

| 항목      | 타입     | 기본값   | 설명                                           |
| --------- | -------- | -------- | ---------------------------------------------- |
| `enabled` | boolean  | `false`  | PII 포함 검사 활성화                           |
| `entity`  | string   | `"user"` | 개인정보를 조회할 엔티티 이름                  |
| `fields`  | string[] | —        | 검사할 필드 목록 (예: `["phone", "birthday"]`) |

> `fields`에 지정한 필드값의 숫자 부분이 비밀번호에 4자 이상 포함되면 거부합니다.  
> 예: 전화번호 `010-1234-5678` → `01012345678` → 비밀번호에 `12345678` 포함 시 거부.

### 비밀번호 이력 재사용 방지

`history_count > 0`이고 `enabled: true`이면, 최근 N개의 해시와 비교하여 재사용을 차단합니다.  
이력은 `password_history` 엔티티에 저장됩니다.

> `password_history` 엔티티가 없으면 이력 검사를 건너뜁니다.
