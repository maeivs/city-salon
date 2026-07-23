# OAuth 2.0 소셜 로그인 플러그인

Google, GitHub, Naver, Kakao, Apple, Line 소셜 로그인을 지원합니다. PKCE 및 state 기반 CSRF 방어가 내장되어 있습니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [환경변수](#환경변수)
- [API](#api)
- [로그인 흐름](#로그인-흐름)
- [운영 팁](#운영-팁)

---

## 개요

| 항목            | 내용                                      |
| --------------- | ----------------------------------------- |
| 지원 프로바이더 | Google, GitHub, Naver, Kakao, Apple, Line |
| CSRF 방어       | state 토큰 (HMAC, TTL 600초)              |
| PKCE            | Apple, Line 기본 활성화                   |
| 계정 병합       | 동일 이메일 기존 계정과 자동 연동 가능    |

> 기본 비활성화(`enabled: false`)입니다. 사용할 프로바이더의 OAuth 앱을 등록하고 환경변수를 설정한 후 활성화하세요.

---

## 설정

`config.json` 핵심 구조:

```json
{
    "enabled": false,
    "state_secret": "${OAUTH_STATE_SECRET}",
    "state_ttl_sec": 600,
    "success_redirect_url": "${OAUTH_SUCCESS_REDIRECT_URL}",
    "failure_redirect_url": "${OAUTH_FAILURE_REDIRECT_URL}",
    "providers": [
        {
            "driver": "google",
            "client_id": "${GOOGLE_CLIENT_ID}",
            "client_secret": "${GOOGLE_CLIENT_SECRET}",
            "redirect_url": "/v1/oauth/google/callback",
            "scopes": ["openid", "email", "profile"]
        },
        {
            "driver": "apple",
            "client_id": "${APPLE_CLIENT_ID}",
            "redirect_url": "/v1/oauth/apple/callback",
            "scopes": ["name", "email"],
            "pkce": true,
            "apple_team_id": "${APPLE_TEAM_ID}",
            "apple_key_id": "${APPLE_KEY_ID}",
            "apple_private_key": "${APPLE_PRIVATE_KEY}"
        }
    ]
}
```

### 설정 항목

| 항목                       | 설명                                 |
| -------------------------- | ------------------------------------ |
| `state_secret`             | state 토큰 서명 비밀키 (CSRF 방어용) |
| `state_ttl_sec`            | state 토큰 유효 시간 (기본 600초)    |
| `success_redirect_url`     | 로그인 성공 후 리다이렉트 URL        |
| `failure_redirect_url`     | 로그인 실패 후 리다이렉트 URL        |
| `providers[].driver`       | 프로바이더 식별자                    |
| `providers[].redirect_url` | 콜백 URL (서버 내부 경로)            |
| `providers[].scopes`       | 요청할 권한 범위                     |
| `providers[].pkce`         | PKCE 활성화 (Apple, Line 권장)       |

---

## 환경변수

```env
OAUTH_STATE_SECRET=랜덤_비밀키_32자_이상

# Google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# GitHub
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Naver
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...

# Kakao
KAKAO_CLIENT_ID=...
KAKAO_CLIENT_SECRET=...

# Apple
APPLE_CLIENT_ID=com.example.app
APPLE_TEAM_ID=...
APPLE_KEY_ID=...
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# Line
LINE_CLIENT_ID=...
LINE_CLIENT_SECRET=...

# 리다이렉트
OAUTH_SUCCESS_REDIRECT_URL=https://example.com/login/success
OAUTH_FAILURE_REDIRECT_URL=https://example.com/login/fail
```

---

## API

### 소셜 로그인

| 메서드 | 경로                               | 설명                                     |
| ------ | ---------------------------------- | ---------------------------------------- |
| `GET`  | `/v1/oauth/:provider`          | 프로바이더 인증 페이지로 리다이렉트      |
| `GET`  | `/v1/oauth/:provider/callback` | OAuth 콜백 처리 (JWT 발급 후 리다이렉트) |
| `POST` | `/v1/oauth/:provider/callback` | Apple Sign-In 콜백 (POST 형식)           |

`provider` 값: `google`, `github`, `naver`, `kakao`, `apple`, `line`

### 계정 연동 관리

| 메서드   | 경로                                      | 인증     | 설명                      |
| -------- | ----------------------------------------- | -------- | ------------------------- |
| `POST`   | `/v1/account/oauth/link`              | JWT 필요 | 소셜 계정 추가 연동       |
| `DELETE` | `/v1/account/oauth/link/:provider`    | JWT 필요 | 특정 프로바이더 연동 해제 |
| `GET`    | `/v1/account/oauth/providers`         | JWT 필요 | 연동된 프로바이더 목록    |
| `POST`   | `/v1/account/oauth/refresh/:provider` | JWT 필요 | 소셜 액세스 토큰 갱신     |

---

## 로그인 흐름

```
1. 클라이언트  → GET /v1/oauth/google
2. 서버        → 302 Redirect → Google 인증 페이지
3. 사용자 동의
4. Google      → GET /v1/oauth/google/callback?code=...&state=...
5. 서버        → state 검증 → 코드 교환 → 사용자 정보 조회
6. 서버        → 계정 생성/조회 → JWT 발급
7. 서버        → 302 Redirect → success_redirect_url#token=...
```

---

## 운영 팁

- 각 프로바이더 개발자 콘솔에서 `redirect_url`을 허용 URL로 등록 필수
- Apple Sign-In은 `https://` 도메인에서만 동작 (로컬호스트 테스트 불가)
- `OAUTH_STATE_SECRET`은 충분히 긴 랜덤 값 사용 (openssl rand -hex 32)
- 동일 이메일로 여러 소셜 계정 연동 시 계정 병합 정책을 사전에 결정할 것
- Kakao는 비즈니스 앱 전환 후 이메일 수집 가능
