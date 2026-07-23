# 이메일 인증 API

게이트웨이 독립 라우트 `app/routes/email-verify/`에서 처리.  
접두사: `/v1/email-verify`

## 라우트 목록

| Method | Path                                                             | 인증 | 설명                |
| ------ | ---------------------------------------------------------------- | ---- | ------------------- |
| POST   | [/v1/email-verify/send](#1-post-send--인증-코드링크-발송)    | —    | 인증 코드/링크 발송 |
| POST   | [/v1/email-verify/confirm](#2-post-confirm--코드-검증)       | —    | 코드 검증           |
| GET    | [/v1/email-verify/activate](#3-get-activate--링크-클릭-인증) | —    | 링크 클릭 인증      |
| GET    | [/v1/email-verify/status](#4-get-status--인증-상태-조회)     | JWT  | 인증 상태 조회      |
| POST   | [/v1/email-verify/change](#5-post-change--이메일-변경)       | JWT  | 이메일 변경         |

---

## 설정

| 파일                                          | 설명        |
| --------------------------------------------- | ----------- |
| `app/routes/email-verify/config.json`         | 런타임 설정 |
| `app/routes/email-verify/config.example.json` | 배포용 예시 |

### config.json 필드

| 필드                            | 타입    | 기본값          | 설명                                  |
| ------------------------------- | ------- | --------------- | ------------------------------------- |
| `enabled`                       | boolean | `true`          | 기능 활성화                           |
| `required`                      | boolean | `false`         | 미인증 계정 로그인 차단               |
| `code_length`                   | number  | `6`             | 숫자 인증 코드 길이                   |
| `code_ttl_sec`                  | number  | `300`           | 코드/토큰 유효 시간(초)               |
| `max_attempts`                  | number  | `5`             | 최대 인증 시도 횟수                   |
| `resend_cooldown_sec`           | number  | `60`            | 재발송 쿨다운(초)                     |
| `link_base_url`                 | string  | `""`            | 링크 인증 활성화 URL (link 방식 필수) |
| `rate_limit.per_email_per_hour` | number  | `5`             | 이메일당 시간당 최대 발송 수          |
| `email_subject`                 | string  | `"이메일 인증"` | 이메일 제목                           |

> `link_base_url`은 인증 링크 방식(`method: "link"`) 사용 시 필수.  
> 예: `https://app.example.com/v1/email-verify/activate`

---

## 엔드포인트

### 1. POST /send — 인증 코드/링크 발송

**인증**: 불필요

#### 요청 파라미터 (Body)

| 필드     | 타입   | 필수 | 기본값   | 설명                          |
| -------- | ------ | ---- | -------- | ----------------------------- |
| `email`  | string | ✅   | —        | 인증 대상 이메일 (최대 320자) |
| `method` | string | —    | `"code"` | `"code"` 또는 `"link"`        |

```jsonc
// 요청
{
    "email": "user@example.com",
    "method": "code"
}

// 응답 200
{
    "success": true,
    "data": { "message": "인증 이메일을 발송했습니다." }
}
```

**동작:**

- 계정 존재 여부와 무관하게 동일 응답 (열거 공격 방지)
- 이미 인증된 이메일 → `"이미 인증된 이메일입니다."`
- 재발송 쿨다운(60초) 체크
- Rate limit: 이메일당 시간 5회

### 2. POST /confirm — 코드 검증

**인증**: 불필요

#### 요청 파라미터 (Body)

| 필드    | 타입   | 필수 | 설명                  |
| ------- | ------ | ---- | --------------------- |
| `email` | string | ✅   | 인증 대상 이메일      |
| `code`  | string | ✅   | 발송된 숫자 인증 코드 |

```jsonc
// 요청
{
    "email": "user@example.com",
    "code": "482917"
}

// 성공 200
{
    "success": true,
    "data": { "message": "이메일 인증이 완료되었습니다." }
}

// 실패 401
{
    "success": false,
    "error": "인증 코드가 일치하지 않습니다."
}
```

**동작:**

- 만료 확인 (code_ttl_sec)
- 시도 횟수 초과 시 429 반환
- constant-time 비교 (timing attack 방지)
- 성공 시 `email_verified = true`, 코드 필드 초기화

### 3. GET /activate — 링크 클릭 인증

**인증**: 불필요

```
GET /v1/email-verify/activate?email=user@example.com&token=<64자hex>&redirect=1
```

| 파라미터   | 설명                                                     |
| ---------- | -------------------------------------------------------- |
| `email`    | 인증 대상 이메일                                         |
| `token`    | 발송된 토큰 원문 (64자 hex)                              |
| `redirect` | `"1"` 시 인증 후 `link_base_url?verified=1`로 리다이렉트 |

**동작:**

- confirm과 동일한 검증 로직 (만료, 시도횟수, constant-time)
- 시도 횟수 초과/실패 시 attempts 증가
- `redirect=1` + `link_base_url` 설정 시 302 리다이렉트

### 4. GET /status — 인증 상태 조회

**인증**: JWT 필요

#### 요청 파라미터

없음 (JWT 토큰에서 사용자 식별)

```jsonc
// 응답 200
{
    "success": true,
    "data": {
        "email": "user@example.com",
        "email_verified": false,
        "required": false,
        "can_resend": true,
        "resend_available_at": "2024-01-01T00:01:00.000Z", // can_resend=false일 때만
    },
}
```

### 5. POST /change — 이메일 변경

**인증**: JWT 필요

#### 요청 파라미터 (Body)

| 필드               | 타입   | 필수 | 설명                                    |
| ------------------ | ------ | ---- | --------------------------------------- |
| `new_email`        | string | ✅   | 변경할 새 이메일                        |
| `current_password` | string | 조건 | 비밀번호 계정은 필수, OAuth 전용은 생략 |

```jsonc
// 요청
{
    "new_email": "new@example.com",
    "current_password": "현재비밀번호"    // 비밀번호 계정 필수, OAuth 전용 생략
}

// 응답 200
{
    "success": true,
    "data": {
        "message": "이메일이 변경되었습니다. 새 이메일로 인증 코드를 발송했습니다.",
        "email": "new@example.com",
        "email_verified": false
    }
}
```

**동작:**

- 비밀번호 계정: `current_password` 필수 (SHA-256 constant-time 검증)
- OAuth 전용 계정: 비밀번호 불필요
- 중복 이메일 확인 (409 Conflict)
- 기존 인증 필드 초기화 후 새 코드 발송

---

## 가입 연동 흐름

`POST /v1/account/register` 실행 시 email-verify 설정에 따라 자동으로 연동됩니다.

```
이메일 인증 ON  (email-verify/config.json: enabled=true)
┌─────────────────────────────────────────────────┐
│ POST /account/register                                │
│   → 인증 코드/링크 메일 발송                            │
│   → email_verified = false                             │
│                                                         │
│ POST /email-verify/confirm  또는  GET /activate        │
│   → 코드/토큰 검증 성공                                │
│   → email_verified = true 저장                        │
│   → [send_welcome_email=true] 환영 메일 발송             │
└─────────────────────────────────────────────────┘

이메일 인증 OFF (email-verify/config.json: enabled=false)
┌─────────────────────────────────────────────────┐
│ POST /account/register                                │
│   → email_verified = true (인증 불필요)                   │
│   → [send_welcome_email=true] 환영 메일 즉시 발송          │
└─────────────────────────────────────────────────┘
```

`send_welcome_email` 팔드는 `account/register/config.json`에서 제어합니다.

---

## 에러 코드

| HTTP | 메시지                          | 상황                     |
| ---- | ------------------------------- | ------------------------ |
| 400  | email is required               | 이메일 누락              |
| 400  | email is too long               | 이메일 320자 초과        |
| 400  | method must be 'code' or 'link' | 잘못된 method            |
| 400  | link_base_url is not configured | link 방식인데 URL 미설정 |
| 400  | 인증 요청이 없습니다.           | 코드 발송 이력 없음      |
| 401  | 인증 코드가 만료되었습니다.     | TTL 초과                 |
| 401  | 인증 코드가 일치하지 않습니다.  | 코드 불일치              |
| 401  | 비밀번호가 일치하지 않습니다.   | 이메일 변경 시 비번 틀림 |
| 409  | 이미 사용 중인 이메일입니다.    | 중복 이메일              |
| 429  | 발송 제한 횟수를 초과했습니다.  | Rate limit 초과          |
| 429  | 최대 시도 횟수를 초과했습니다.  | max_attempts 초과        |
| 429  | 재발송 쿨다운 중입니다.         | 60초 이내 재발송         |

---

## 이메일 템플릿

| 파일                                          | 사용처    | 변수                                             |
| --------------------------------------------- | --------- | ------------------------------------------------ |
| `templates/email/auth/verification.html`      | 코드 인증 | `${code}`, `${expires_in}`, `${email}`           |
| `templates/email/auth/verification_link.html` | 링크 인증 | `${activation_url}`, `${expires_in}`, `${email}` |

---

## 관련 문서

- [Account Routes](./account-routes.md)
- [Alimtalk Routes](./alimtalk-routes.md)
- [Friendtalk Routes](./friendtalk-routes.md)
- [Holidays Routes](./holidays-routes.md)
- [Identity Routes](./identity-routes.md)
- [LLM Routes](./llm-routes.md)
- [OCR Routes](./ocr-routes.md)
- [Password Reset](./password-reset.md)
- [PG Routes](./pg-routes.md)
- [SMS Routes](./sms-routes.md)
- [SMTP Routes](./smtp-routes.md)
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
