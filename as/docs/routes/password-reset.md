# 비밀번호 재설정 (Password Reset)

> **위치**: `app/routes/password-reset/`  
> **프리픽스**: `/v1/password-reset`  
> **모드**: `temp_password` (임시 비밀번호) | `link` (리셋 링크)

## 라우트 목록

| Method | Path                                                                                       | 인증 | 모드 | 설명                  |
| ------ | ------------------------------------------------------------------------------------------ | ---- | ---- | --------------------- |
| POST   | [/v1/password-reset/request](#post-v1apipassword-resetrequest)                             | —    | 공통 | 비밀번호 재설정 요청  |
| GET    | [/v1/password-reset/validate/:token](#get-v1apipassword-resetvalidatetoken-link-모드-전용) | —    | link | 토큰 유효성 확인      |
| POST   | [/v1/password-reset/verify](#post-v1apipassword-resetverify-link-모드-전용)                | —    | link | 토큰 검증 + 비번 변경 |

---

## 개요

비밀번호 분실 시 이메일을 통해 비밀번호를 재설정할 수 있는 셀프서비스 기능입니다.

---

## 모드

### 1. 임시 비밀번호 모드 (`temp_password`) — 기본값

```
사용자 → POST /request {email}
         → 임시 비밀번호 생성 (12자)
         → account.temp_password_hash 저장
         → 이메일 발송 (임시 비밀번호 포함)
         → 항상 성공 응답

사용자 → POST /v1/auth/login {email, passwd: 임시비밀번호}
         → 앱서버 `/v1/health`로 받은 `_csrf`를 헤더에 포함해 로그인
         → 앱서버 CSRF 검증 후 엔티티서버 로그인 전달
         → force_password_change: true 응답

사용자 → POST /v1/auth/change-password {current_passwd, new_passwd}
         → 엔티티서버 비밀번호 변경 (프록시)
```

### 2. 리셋 링크 모드 (`link`)

```
사용자 → POST /request {email}
         → 32-byte 토큰 생성
         → SHA-256(token) → account.password_reset_token 저장
         → 이메일 발송 (리셋 URL 포함)

사용자 → GET /validate/:token
         → 토큰 유효성 확인 (프론트엔드 UI용)

사용자 → POST /verify {token, new_password}
         → 토큰 검증 + 새 비밀번호 해싱 + account 업데이트
```

---

## API 엔드포인트

### POST `/v1/password-reset/request`

비밀번호 재설정 요청. 계정 존재 여부와 관계없이 항상 동일한 응답을 반환합니다.

#### 요청 파라미터 (Body)

| 필드    | 타입   | 필수 | 설명             |
| ------- | ------ | ---- | ---------------- |
| `email` | string | ✅   | 계정 이메일 주소 |

**Request:**

```json
{
    "email": "user@example.com"
}
```

**Response (항상 200):**

```json
{
    "ok": true,
    "message": "요청이 처리되었습니다."
}
```

### GET `/v1/password-reset/validate/:token` (link 모드 전용)

토큰 유효성을 확인합니다. 프론트엔드에서 비밀번호 입력 폼을 표시하기 전 사용합니다.

#### 경로 파라미터

| 필드    | 타입   | 필수 | 설명                          |
| ------- | ------ | ---- | ----------------------------- |
| `token` | string | ✅   | 이메일로 발송된 64자 hex 토큰 |

**Response:**

```json
{
    "success": true,
    "data": {
        "valid": true,
        "expires_in_sec": 280
    }
}
```

### POST `/v1/password-reset/verify` (link 모드 전용)

토큰을 검증하고 새 비밀번호를 설정합니다.

#### 요청 파라미터 (Body)

| 필드           | 타입   | 필수 | 설명                          |
| -------------- | ------ | ---- | ----------------------------- |
| `token`        | string | ✅   | 이메일로 발송된 64자 hex 토큰 |
| `new_password` | string | ✅   | 새 비밀번호                   |

**Request:**

```json
{
    "token": "64자_hex_토큰",
    "new_password": "새비밀번호"
}
```

**Success Response:**

```json
{
    "success": true,
    "data": {
        "message": "비밀번호가 변경되었습니다."
    }
}
```

---

## 설정

| 파일                                            | 설명        |
| ----------------------------------------------- | ----------- |
| `app/routes/password-reset/config.json`         | 런타임 설정 |
| `app/routes/password-reset/config.example.json` | 배포용 예시 |

### config.json 필드

```json
{
    "enabled": true,
    "mode": "temp_password",
    "temp_password_ttl_sec": 300,
    "temp_password_length": 12,
    "link_base_url": "https://myapp.com/reset-password",
    "link_token_ttl_sec": 300,
    "rate_limit": {
        "per_email_per_hour": 5,
        "per_ip_per_minute": 10
    },
    "email_subject": "비밀번호 재설정"
}
```

| 키                              | 설명                            | 기본값              |
| ------------------------------- | ------------------------------- | ------------------- |
| `enabled`                       | 기능 활성화                     | `true`              |
| `mode`                          | `"temp_password"` 또는 `"link"` | `"temp_password"`   |
| `temp_password_ttl_sec`         | 임시 비밀번호 유효 시간(초)     | `300` (5분)         |
| `temp_password_length`          | 임시 비밀번호 길이              | `12`                |
| `link_base_url`                 | 리셋 링크 URL (link 모드)       | `""`                |
| `link_token_ttl_sec`            | 토큰 유효 시간(초) (link 모드)  | `300` (5분)         |
| `rate_limit.per_email_per_hour` | 이메일당 시간당 최대 요청       | `5`                 |
| `rate_limit.per_ip_per_minute`  | IP당 분당 최대 요청             | `10`                |
| `email_subject`                 | 이메일 제목                     | `"비밀번호 재설정"` |

환경변수 치환 지원: `"link_base_url": "${RESET_PASSWORD_URL}"`

---

## 보안

| 항목           | 대책                                       |
| -------------- | ------------------------------------------ |
| 계정 열거 방지 | 이메일 존재 여부와 관계없이 동일 응답      |
| Rate Limit     | 이메일당 5회/시간, IP당 10회/분 (인메모리) |
| 임시 비밀번호  | SHA-256 + 16B salt 해시만 DB 저장          |
| 토큰 보안      | SHA-256 해시만 DB 저장 (256-bit 엔트로피)  |
| 일회성         | 사용 즉시 토큰/임시비번 필드 삭제          |
| Constant-time  | `timingSafeEqual` 사용 (password-utils.ts) |

---

## 이메일 템플릿

| 파일                       | 용도               | 변수                                            |
| -------------------------- | ------------------ | ----------------------------------------------- |
| `auth/password_reset`      | 임시 비밀번호 안내 | `${temp_password}`, `${expires_in}`, `${email}` |
| `auth/password_reset_link` | 리셋 링크 안내     | `${reset_url}`, `${expires_in}`, `${email}`     |
| `auth/force_reset`         | 관리자 강제 리셋   | `${temp_password}`, `${email}`                  |

템플릿 위치: `templates/email/auth/`

---

## 커스터마이징

`app/routes/password-reset/handlers.ts`를 직접 수정하여:

- 비밀번호 정책 검증 추가
- 커스텀 이메일 템플릿 변수 추가
- 외부 Rate Limit 서비스(Redis 등) 연동
- SMS 기반 인증번호 리셋 추가

## 관련 문서

- [Account Routes](./account-routes.md)
- [Alimtalk Routes](./alimtalk-routes.md)
- [Email Verification](./email-verification.md)
- [Friendtalk Routes](./friendtalk-routes.md)
- [Holidays Routes](./holidays-routes.md)
- [Identity Routes](./identity-routes.md)
- [LLM Routes](./llm-routes.md)
- [OCR Routes](./ocr-routes.md)
- [PG Routes](./pg-routes.md)
- [SMS Routes](./sms-routes.md)
- [SMTP Routes](./smtp-routes.md)
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
