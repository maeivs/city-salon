# 기능별 흐름도

---

## 목차

- [1. 로그인](#1-로그인)
- [2. 회원가입](#2-회원가입)
- [3. 회원 탈퇴](#3-회원-탈퇴)
- [4. OAuth 소셜 로그인 (리다이렉트 · 콜백)](#4-oauth-소셜-로그인-리다이렉트--콜백)
- [5. OAuth 계정 연동 관리](#5-oauth-계정-연동-관리)
- [6. 2FA (TOTP)](#6-2fa-totp)
- [7. 이메일 인증](#7-이메일-인증)
- [8. 비밀번호 재설정](#8-비밀번호-재설정)
- [9. 엔티티 CRUD (프록시)](#9-엔티티-crud-프록시)
- [10. 파일 업로드 · 다운로드 (프록시)](#10-파일-업로드--다운로드-프록시)
- [11. 엔티티 훅](#11-엔티티-훅)

---

## 1. 로그인

> **담당**: 브라우저 경계와 1차 로그인 분기는 앱서버, 최종 JWT 발급은 Go 서버
> 앱서버는 `/v1/health`에서 `_csrf` 쿠키를 발급하고, `/v1/auth/*` 요청의 CSRF 검증과 2FA 분기를 먼저 처리합니다.

```
클라이언트
    │
    │  GET /v1/health
    │  X-Session-Bootstrap: 1   (선택)
    ▼
앱서버
    │
    ├─ `_csrf` 쿠키 발급
    ├─ `token_refresh` 쿠키가 있으면 세션 복구 시도
    └─ 필요 시 ES `/v1/health` 호출 후 access token 재발급
    │
    ▼
클라이언트
    │
    │  POST /v1/auth/login
    │  { email, password }
    │  X-CSRF-Token: {_csrf cookie 값}
    ▼
앱서버
    │
    ├─ CSRF 미들웨어 검증
    ├─ 이메일로 account 조회
    ├─ 계정 상태 확인 (active / dormant / withdrawn)
    ├─ 비밀번호 검증 (일반/임시 비밀번호)
    ├─ 2FA 필요 여부 확인
    │   ├─ 2FA 활성화  → two_factor_token 발급 (단기)
    │   ├─ 역할상 2FA 필수 + 미설정 → setup_token 발급
    │   └─ 2FA 비대상 → Go 서버로 전달
    │
    └─ 전달 → POST /v1/auth/login
    │
    ▼
Go 서버
    │
    ├─ 이메일로 account 조회
    ├─ bcrypt 비밀번호 검증
    ├─ 계정 상태 확인
    ├─ access_token + refresh_token 발급
    └─ 응답 반환
    │
    ▼
앱서버
    │
    └─ 응답/쿠키 전달
    │
    ▼
클라이언트
    │
    │  (2FA 활성화된 경우)
    ▼
    POST /v1/account/2fa/verify  [앱서버 담당]
    → two_factor_token + TOTP 코드 검증 → JWT 발급 + auth 쿠키 설정
```

> 프런트엔드는 ES 주소를 직접 알 필요가 없습니다. 브라우저 요청은 항상 AS로 보내고, AS가 인증/보안 경계를 처리한 뒤 ES와 통신합니다.
> 일반 사용자 2FA의 소유권은 AS 플러그인입니다. 즉 `/v1/auth/login`의 1차 분기와 `/v1/account/2fa/*`의 setup, verify, recovery, disable, status는 AS가 처리하고, Go 서버는 최종 JWT 발급과 관리자 강제 해제 라우트만 유지합니다.

---

## 2. 회원가입

> **담당**: 앱서버 (가입 절차는 비즈니스 규칙)

```
클라이언트
    │
    │  POST /v1/account/register
    │  { email, password, name, ... }
    ▼
앱서버 (routes/account/register/)
    │
    ├─ 입력값 검증 (이메일 형식, 비밀번호 정책)
    ├─ 중복 이메일 확인 (entityServer.list)
    │
    ├─ 이메일 인증 필요 여부 확인 (email-verify config)
    │   ├─ 인증 필요 → 계정 status=pending 으로 임시 생성
    │   │              → email-verify/send 내부 호출 → 인증 메일 발송
    │   │              → 201 반환
    │   └─ 인증 불필요 → 계정 status=active 로 바로 생성
    │                   → 환영 메일 발송 (설정에 따라)
    │                   → 201 반환
    │
    └─ entityServer.submit("account", data)  ← Go CRUD API
    │
    ▼
Go 서버 (엔티티 CRUD)
    │
    ├─ 비밀번호 bcrypt 해싱 (submit 훅 내부)
    ├─ account 레코드 저장
    └─ seq 반환
    │
    ▼
앱서버
    │
    └─ sendEmail(환영/인증 메일)  ← Go SMTP API 또는 앱서버 직접 발송
    │
    ▼
클라이언트 (201 Created)
```

---

## 3. 회원 탈퇴

> **담당**: 앱서버 (이메일 발송 판단) + Go 서버 (익명화 처리)

```
클라이언트
    │
    │  POST /v1/account/withdraw
    │  Authorization: Bearer {access_token}
    │  { passwd? }
    ▼
앱서버 (routes/account/withdraw/)
    │
    ├─ JWT에서 account_seq 추출
    ├─ account 조회 (entityServer.get) → email 저장 (익명화 전 확보)
    │
    ├─ POST ${ENTITY_SERVER_URL}/v1/auth/withdraw  ← Go 내부 직접 호출
    │     Authorization: Bearer {access_token} 그대로 전달
    │     ↓
    │   Go 서버 (HandleWithdraw)
    │     ├─ 비밀번호 검증 (옵션)
    │     ├─ 이메일 → withdrawn_XXXXXX@anonymized.local
    │     ├─ name → "탈퇴회원"
    │     ├─ account_oauth 레코드 비활성화
    │     ├─ password_history 삭제
    │     ├─ account status → withdrawn
    │     └─ refresh_token 폐기
    │
    ├─ 탈퇴 완료 이메일 발송 (fire-and-forget)
    │   sendEmail(미리 저장한 email, "withdraw-complete" 템플릿)
    │
    └─ 200 OK 반환
    │
    ▼
클라이언트
```

---

## 4. OAuth 소셜 로그인 (리다이렉트 · 콜백)

> **담당**: 앱서버 (소셜 로그인 흐름은 비즈니스 규칙)
> **지원 프로바이더**: Google · GitHub · Naver · Kakao · Line · Apple

```
[리다이렉트 단계]

클라이언트
    │
    │  GET /v1/oauth/:provider
    │  (예: /v1/oauth/google)
    ▼
앱서버 (routes/oauth/handlers/redirect.ts)
    │
    ├─ oauth.json에서 프로바이더 설정 로드
    ├─ PKCE 지원 여부 확인 (Apple, Line)
    │   └─ PKCE 필요 → code_verifier 생성 → code_challenge 계산
    ├─ HMAC-SHA256 state 토큰 생성 (CSRF 방지)
    │   format: base64url(provider:nonce).mac
    ├─ state 인메모리 맵에 저장 (TTL: config state_ttl_sec)
    └─ 302 Redirect → 프로바이더 인증 URL
       (auth_url?client_id=...&state=...&code_challenge=...&scope=...)
    │
    ▼
프로바이더 (Google / GitHub / Naver 등)
    │
    │  사용자 로그인 + 동의
    ▼

[콜백 단계]

프로바이더
    │
    │  GET/POST /v1/oauth/:provider/callback
    │  ?code=...&state=...
    ▼
앱서버 (routes/oauth/handlers/callback.ts)
    │
    ├─ state 검증 (HMAC-SHA256, TTL, provider 일치)
    ├─ code → access_token 교환 (프로바이더 token_url 호출)
    │   └─ Apple: ES256 JWT client_secret 자동 생성 후 교환
    │   └─ PKCE: code_verifier 함께 전송
    ├─ 사용자 정보 조회
    │   ├─ Google : id_token 파싱 또는 userinfo endpoint
    │   ├─ GitHub : /user + /user/emails
    │   ├─ Naver  : response 객체에서 추출
    │   ├─ Kakao  : kakao_account.email 도트 표기 추출
    │   ├─ Apple  : id_token JWT payload + form user JSON
    │   └─ Line   : profile API + id_token email
    │
    ├─ account upsert (upsert.ts)
    │   ├─ Step 1: account_oauth(provider, provider_id) → account_seq 조회
    │   ├─ Step 2: 없으면 email로 account 조회 → 자동 연동
    │   └─ Step 3: 모두 없으면 신규 account + account_oauth 생성
    │              (entityServer.submit → Go CRUD)
    │
    ├─ 2FA 활성화 여부 확인
    │   ├─ 2FA 없음 → JWT (access_token + refresh_token) 발급
    │   └─ 2FA 있음 → two_factor_token 발급
    │
    ├─ success_redirect_url 설정 여부
    │   ├─ 있음 → 302 Redirect (token을 쿼리파라미터 또는 쿠키로 전달)
    │   └─ 없음 → JSON 응답 { access_token, refresh_token }
    │
    ▼
클라이언트
```

---

## 5. OAuth 계정 연동 관리

> **담당**: 앱서버 (연동 상태 관리는 비즈니스 규칙)

### 연동 (Link)

```
클라이언트
    │  POST /v1/account/oauth/link
    │  Authorization: Bearer {access_token}
    │  { provider, code, state?, redirect_uri? }
    ▼
앱서버 (routes/account/oauth/handlers/link.ts)
    │
    ├─ JWT에서 account_seq 추출
    ├─ state 검증 (있는 경우)
    ├─ code → access_token 교환
    ├─ 사용자 정보 조회
    ├─ 이미 연동된 provider 확인
    │   ├─ active → 409 Conflict
    │   └─ unlinked → 재활성화 (status=active, linked_at=now())
    ├─ 다른 계정에 연동된 provider_id 확인 → 409
    └─ 신규 account_oauth 레코드 생성
    │
    ▼
클라이언트 (200 OK)
```

### 연동 해제 (Unlink)

```
클라이언트
    │  DELETE /v1/account/oauth/link/:provider
    │  Authorization: Bearer {access_token}
    ▼
앱서버 (routes/account/oauth/handlers/unlink.ts)
    │
    ├─ JWT에서 account_seq 추출
    ├─ account_oauth 레코드 확인 (active)
    ├─ 로그인 수단 보호: has_password=false + 다른 활성 연동 없음 → 400
    └─ account_oauth status=unlinked, unlinked_at=now()
    │
    ▼
클라이언트 (200 OK)
```

---

## 6. 2FA (TOTP)

> **담당**: 앱서버 (인증 절차는 비즈니스 규칙)

### 설정 흐름

```
클라이언트
    │  POST /v1/account/2fa/setup
    │  Authorization: Bearer {access_token}
    ▼
앱서버 (routes/account/2fa/handlers/setup.ts)
    │
    ├─ JWT에서 account_seq 추출
    ├─ TOTP 비밀키 생성 (base32)
    ├─ QR코드 URL 생성 (otpauth://)
    ├─ QR코드 이미지 생성
    ├─ account.totp_secret_pending에 저장
    ├─ setup_token 발급 (단기, 5분)
    └─ { qr_code, secret, setup_token } 반환
    │
    ▼
클라이언트 → OTP 앱으로 QR 스캔
    │
    │  POST /v1/account/2fa/setup/verify
    │  { setup_token, code }
    ▼
앱서버 (routes/account/2fa/handlers/setup-verify.ts)
    │
    ├─ setup_token 검증
    ├─ TOTP 코드 검증 (window: skew ±1)
    ├─ totp_secret_pending → totp_secret 이동
    ├─ totp_enabled = true
    ├─ 리커버리 코드 10개 생성 + bcrypt 해싱 저장
    └─ 리커버리 코드 반환 (1회만 표시)
```

### 로그인 2단계 검증 흐름

```
[로그인 → two_factor_token 발급]
    │
클라이언트
    │  POST /v1/account/2fa/verify
    │  { two_factor_token, code }
    ▼
앱서버 (routes/account/2fa/handlers/verify.ts)
    │
    ├─ two_factor_token 검증 (단기 토큰)
    ├─ token에서 account_seq 추출
    ├─ account.totp_secret 조회
    ├─ TOTP 코드 검증 (replay 방지: 사용된 코드 캐싱)
    └─ 검증 성공 → JWT (access_token + refresh_token) 발급
    │
    ▼
클라이언트
```

---

## 7. 이메일 인증

> **담당**: 앱서버 (인증 절차는 비즈니스 규칙)

```
[코드 방식]

클라이언트
    │  POST /v1/email-verify/send
    │  { email, method: "code" }
    ▼
앱서버 (routes/email-verify/handlers/send.ts)
    │
    ├─ 이메일로 account 조회
    ├─ Rate Limit 확인 (최근 N분 이내 재발송 제한)
    ├─ 6자리 숫자 코드 생성 + SHA256 해싱
    ├─ email_verification 엔티티에 저장 (TTL + 시도횟수)
    └─ SMTP 발송 (인증코드 템플릿)
    │
    ▼
클라이언트
    │  POST /v1/email-verify/confirm
    │  { email, code }
    ▼
앱서버 (routes/email-verify/handlers/confirm.ts)
    │
    ├─ 코드 해시 비교
    ├─ TTL 확인, 시도 횟수 확인 (최대 N회)
    ├─ account.email_verified = true
    ├─ account.status = active (pending → active)
    └─ 검증 토큰 반환
    │
    ▼
클라이언트 (검증 완료)

[링크 방식]

send → 랜덤 토큰 생성 → 링크 이메일 발송
    │
GET /v1/email-verify/activate?token=...
    ▼
앱서버 → 토큰 검증 → account 활성화 → Redirect
```

---

## 8. 비밀번호 재설정

> **담당**: 앱서버 (재설정 방식은 비즈니스 규칙)

### 임시비밀번호 방식 (기본)

```
클라이언트
    │  POST /v1/password-reset/request
    │  { email }
    ▼
앱서버 (routes/password-reset/)
    │
    ├─ email로 account 조회 (없어도 200 반환 — 사용자 열거 방지)
    ├─ 임시 비밀번호 생성 (랜덤 8~12자)
    ├─ POST /v1/auth/change-password 내부 호출
    │   → Go 서버에서 bcrypt 해싱 + 즉시 저장
    └─ SMTP 발송 (임시 비밀번호 포함)
    │
    ▼
클라이언트 (이메일 수신 → 임시 비밀번호로 로그인)
    │
    └─ 로그인 후 비밀번호 변경 권장
```

### 링크 방식

```
클라이언트
    │  POST /v1/password-reset/request
    │  { email }
    ▼
앱서버 (routes/password-reset/)
    │
    ├─ email로 account 조회 (없어도 200 반환 — 사용자 열거 방지)
    ├─ 랜덤 리셋 토큰 생성 (32바이트 hex)
    ├─ password_reset_token 엔티티에 저장 (TTL: 30분)
    └─ SMTP 발송 (재설정 링크 포함)
    │
    ▼
클라이언트 (이메일 수신 → 링크 클릭)
    │
    │  GET /v1/password-reset/validate?token=...
    ▼
앱서버
    │
    ├─ 토큰 유효성 확인 (TTL, 사용 여부)
    └─ 200 OK (유효) 또는 400 (만료/사용됨)
    │
    ▼
클라이언트 (새 비밀번호 입력)
    │
    │  POST /v1/password-reset/verify
    │  { token, new_password }
    ▼
앱서버
    │
    ├─ 토큰 검증
    ├─ 비밀번호 정책 검증
    ├─ POST /v1/auth/change-password 내부 호출
    │   → Go 서버에서 bcrypt 해싱 + 저장
    ├─ 토큰 사용 처리 (재사용 방지)
    └─ 200 OK
    │
    ▼
클라이언트
```

### 관리자 리셋 방식

```
관리자 (admin 역할 계정)
    │
    │  POST /v1/admin/account/:seq/reset-password
    │  Authorization: Bearer {admin_access_token}
    ▼
앱서버 (admin 라우트)
    │
    ├─ JWT decode → role 확인 (admin 권한 없으면 403)
    ├─ account_seq로 account 조회 → email 확보
    │   (익명화 전 이메일 미리 저장)
    ├─ 임시 비밀번호 생성 (랜덤 8~12자)
    ├─ 게이트웨이 account/change-password 핸들러에서 직접 처리
    │   ├─ 현재 비밀번호 검증
    │   ├─ bcrypt 해싱
    │   └─ 비밀번호 저장 + 이력 기록
    │
    ├─ SMTP 발송 (임시 비밀번호 + 관리자 리셋 안내)
    │   sendEmail(email, "admin-password-reset", { temp_password })
    └─ 200 OK
    │
    ▼
관리자 (처리 완료)
사용자 (이메일 수신 → 임시 비밀번호로 로그인 → 비밀번호 변경 권장)
```

> **주의**: 임시 비밀번호는 응답 본문에 포함하지 않는다 — 이메일로만 전달한다.

---

## 9. 엔티티 CRUD (프록시)

> **담당**: Go 서버 · 앱서버는 투명 프록시

```
클라이언트
    │  POST /v1/entity/:entity/submit
    │  Authorization: Bearer {access_token}
    │  { ... 데이터 ... }
    ▼
앱서버 (system/proxy/register.ts)
    │
    ├─ JWT decode (user 정보 추출, verify는 Go에서)
    ├─ 엔티티 훅 확인 (beforeSubmit 등록된 경우)
    │   └─ beforeSubmit(entity, ctx, user) 실행
    │       └─ 예외 throw 시 → 요청 차단 (4xx 반환)
    │
    │  프록시 → POST /v1/entity/:entity/submit
    ▼
Go 서버 (엔티티 CRUD)
    │
    ├─ JWT verify + RBAC 접근 제어
    ├─ 엔티티 JSON 정의 기반 유효성 검증
    ├─ 필드 암호화 (설정된 경우)
    ├─ DB insert/update
    ├─ 변경 이력 저장
    └─ { ok, seq } 반환
    │
    ▼
앱서버
    │
    ├─ 엔티티 훅 (afterSubmit 등록된 경우)
    │   └─ afterSubmit(entity, ctx, user) 비동기 실행
    │       (알림 발송, 외부 API 호출 등)
    │
    └─ 클라이언트에 응답 반환
    │
    ▼
클라이언트
```

---

## 10. 파일 업로드 · 다운로드 (프록시)

> **담당**: Go 서버 · 앱서버는 투명 프록시

```
[업로드]

클라이언트
    │  POST /v1/files/:entity/upload
    │  Authorization: Bearer {access_token}
    │  multipart/form-data
    ▼
앱서버 (프록시, timeout: 60s)
    │
    │  → POST /v1/files/:entity/upload
    ▼
Go 서버
    │
    ├─ JWT verify + RBAC
    ├─ 용량 쿼터 확인
    ├─ 파일 저장 (로컬 / S3 등 설정에 따라)
    ├─ files 엔티티에 메타 저장
    └─ { uuid, url } 반환
    │
    ▼
클라이언트

[다운로드 — 인증 없이 접근 가능한 임시 URL]

클라이언트
    │  POST /v1/files/token/:uuid   ← 임시 토큰 발급
    ▼
Go 서버 → 단기 토큰 반환
    │
GET /v1/files/:uuid?token=...  ← 토큰으로 직접 접근 가능
```

---

## 11. 엔티티 훅

> **담당**: 앱서버 (`app/hooks/`)

```
[beforeSubmit 예시: 특정 엔티티 제출 전 데이터 변환]

Go 서버 CRUD 요청 수신 전
    │
앱서버 훅 로더 (system/hooks/)
    │
    ├─ app/hooks/registry.ts에서 엔티티명 → EntityHook 매핑 조회
    ├─ beforeSubmit(entity, { old, new }, user) 실행
    │   ├─ 데이터 가공 / 검증 / 외부 API 확인
    │   ├─ throw → 요청 차단 (4xx)
    │   └─ return data → 변환된 데이터로 Go에 전달
    │
Go 서버에서 실제 저장

[afterSubmit 예시: 저장 후 알림 발송]

Go 서버 CRUD 완료
    │
앱서버 훅 (비동기)
    │
    └─ afterSubmit(entity, { old, new }, user)
        ├─ 변경 내용에 따라 SMTP 발송 판단
        ├─ sendEmail(...)  ← Go SMTP API 호출
        ├─ 외부 CRM webhook 호출
        └─ 예외 → 로그만 남김 (이미 저장 완료됨)
```
