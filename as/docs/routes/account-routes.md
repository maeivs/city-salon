# Account Routes

> **위치**: `app/routes/account/`  
> **프리픽스**: `/v1/account`

## 라우트 목록

| Method | Path                                                    | 인증 | 설명     |
| ------ | ------------------------------------------------------- | ---- | -------- |
| POST   | [/v1/account/register](#post-v1apiaccount-register) | —    | 회원가입 |
| POST   | [/v1/account/withdraw](#post-v1apiaccountwithdraw)  | JWT  | 회원탈퇴 |

---

## 개요

계정 관련 라우트를 묶는 플러그인입니다.  
자동 로더가 `routes/account/route.ts`를 탐색하여 `/v1/account` prefix로 등록하고,  
`route.ts` 내부에서 하위 라우트를 수동으로 등록합니다.

```
routes/account/route.ts          ← 자동 로더가 /v1/account 로 등록
├── register/route.ts            ← /register prefix 로 수동 등록
│   → POST /v1/account/register
└── withdraw/route.ts            ← /withdraw prefix 로 수동 등록
    → POST /v1/account/withdraw
```

---

## API 엔드포인트

### POST `/v1/account/register`

<a id="post-v1apiaccount-register"></a>

이메일·비밀번호로 계정을 생성합니다.  
설정에 따라 가입 직후 **이메일 인증 메일** 또는 **환영 메일**을 발송할 수 있습니다.

> entity-server의 `POST /v1/auth/register`를 게이트웨이로 이관한 구현입니다.

#### 요청 본문

| 필드       | 타입   | 필수 | 설명                              |
| ---------- | ------ | ---- | --------------------------------- |
| `email`    | string | ✅   | 이메일 주소 (중복 불가)           |
| `password` | string | ✅   | 비밀번호 (비밀번호 정책 적용)     |
| `name`     | string | -    | 이름                              |
| `phone`    | string | -    | 전화번호                          |
| 기타 필드  | any    | -    | account 엔티티의 추가 필드로 전달 |

> **주의**: `status`, `rbac_role`, `has_password`, `email_verified`, `passwd` 등
> 보안 관련 필드는 요청 본문에 포함해도 무시됩니다.

#### 응답

**201 Created:**

```json
{
    "ok": true,
    "data": {
        "seq": 42,
        "email": "user@example.com",
        "email_verified": false
    }
}
```

`email_verified`는 email-verify/config.json 에서 `enabled: true`일 때 `false`, 그 외엔 `true`.

**400 Bad Request:**

```json
{ "ok": false, "error": "email is required" }
{ "ok": false, "error": "비밀번호는 최소 8자 이상이어야 합니다" }
```

**409 Conflict:**

```json
{ "ok": false, "error": "이미 사용 중인 이메일입니다." }
```

#### 사용 예제

```bash
curl -X POST "http://localhost:3000/v1/account/register" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "user@example.com",
        "password": "Passw0rd!",
        "name": "홍길동"
    }'
```

---

## 처리 흐름

### 회원가입

```
POST /v1/account/register
  │
  ├─ 1. 입력 검증 (email, password 필수 / 이메일 형식)
  ├─ 2. 비밀번호 정책 검증 (configs/security.json password_policy)
  ├─ 3. 이메일 중복 확인 (account 엔티티)
  ├─ 4. 비밀번호 SHA-256+salt 해시
  ├─ 5. account 엔티티 생성 (entityServer.submit)
  │      status: "active", rbac_role: default_role
  │      email_verified: email-verify.enabled ? false : true
  │
  ├─ 6a. [email-verify.enabled=true]  → 인증 코드/링크 메일 발송 (비동기)
  │          (환영 메일은 인증 완료 후 confirm/activate에서 발송)
  ├─ 6b. [email-verify.enabled=false, send_welcome_email=true]
  │          → 즉시 환영 메일 발송 (비동기)
  │
  └─ 201 { seq, email, email_verified }
```

### 이메일 인증 완료 (환영 메일 연동)

```
POST /v1/email-verify/confirm  또는  GET /v1/email-verify/activate
  │
  ├─ 코드/토큰 검증
  ├─ email_verified = true 저장
  ├─ [send_welcome_email=true] → 환영 메일 발송 (비동기)
  └─ 200
```

이메일 발송은 **비동기** — 발송 실패가 201/200 응답에 영향을 주지 않습니다.

---

## 설정 (`src/app/routes/account/register/config.json`)

| 키                      | 타입    | 기본값                 | 설명                                                                         |
| ----------------------- | ------- | ---------------------- | ---------------------------------------------------------------------------- |
| `enabled`               | boolean | `true`                 | 라우트 활성화 여부                                                           |
| `send_welcome_email`    | boolean | `false`                | 가입 후 환영 메일 발송 (이메일 인증 불필요시 즉시, 인증 필요시 인증 완료 후) |
| `welcome_email_subject` | string  | `"가입을 환영합니다!"` | 환영 메일 제목                                                               |
| `default_role`          | string  | `"user"`               | 신규 계정 RBAC role                                                          |

> 이메일 인증 여부(인증 코드 길이, TTL 등)는 `email-verify/config.json`의 `enabled`로 제어됩니다.

### 설정 예시

```json
{
    "enabled": true,
    "send_welcome_email": true,
    "welcome_email_subject": "가입을 환영합니다!",
    "default_role": "user"
}
```

---

## API 엔드포인트

### POST `/v1/account/withdraw`

<a id="post-v1apiaccountwithdraw"></a>

현재 로그인한 계정을 탈퇴(익명화)합니다.

> **JWT 필수** — `Authorization: Bearer <token>` 헤더

#### 요청 본문

| 필드     | 타입   | 필수 | 설명                                        |
| -------- | ------ | ---- | ------------------------------------------- |
| `passwd` | string | 조건 | 비밀번호 계정(`has_password=true`)이면 필수 |

#### 응답

**200 OK:**

```json
{ "ok": true, "data": { "message": "탈퇴 처리가 완료되었습니다." } }
```

**400 / 401 / 403 / 404:**

```json
{ "ok": false, "error": "비밀번호가 필요합니다." }
{ "ok": false, "error": "비밀번호가 일치하지 않습니다." }
{ "ok": false, "error": "관리자 계정은 자가 탈퇴가 불가합니다." }
```

#### 탈퇴 처리 내용

| 대상                     | 처리                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `account.email`          | `withdrawn_<seq>@anonymized.local` 덮어쓰기                            |
| `account.passwd`         | `""` (비밀번호 삭제)                                                   |
| `account.status`         | `"inactive"`                                                           |
| `account.has_password`   | `false`                                                                |
| `account.email_verified` | `false`                                                                |
| `account_oauth`          | 연결 OAuth 레코드 전체 hard delete                                     |
| `user`                   | `name = "탈퇴회원_<seq>"`, `profile_image = ""`, `status = "inactive"` |
| `password_history`       | 전체 hard delete                                                       |

> user / account_oauth / password_history 엔티티가 없는 환경에서는 해당 단계를 무시합니다.

#### 사용 예제

```bash
curl -X POST "http://localhost:3000/v1/account/withdraw" \
    -H "Authorization: Bearer <jwt_token>" \
    -H "Content-Type: application/json" \
    -d '{ "passwd": "my_password" }'
```

---

## 이메일 템플릿

| 용도      | 파일                                            | 변수                  |
| --------- | ----------------------------------------------- | --------------------- |
| 인증 코드 | `templates/email/auth/verification.html`        | `code`, `ttl_minutes` |
| 인증 링크 | `templates/email/auth/verification_link.html`   | `link`, `ttl_minutes` |
| 환영 메일 | `src/app/routes/account/templates/welcome.html` | `name`, `email`       |

---

## 하위 라우트 추가 방법

`app/routes/account/route.ts`에 등록 한 줄을 추가합니다.

```typescript
// app/routes/account/route.ts
import newRoutes from "./new-feature/route.ts";

export default async function accountRoutes(app: FastifyInstance) {
    await app.register(registerRoutes, { prefix: "/register" });
    await app.register(withdrawPlugin, { prefix: "/withdraw" });
    await app.register(newRoutes, { prefix: "/new-feature" }); // 추가
}
```

---

## 관련 문서

- [Alimtalk Routes](./alimtalk-routes.md)
- [Email Verification](./email-verification.md)
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
