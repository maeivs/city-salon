# OAuth 2.0 소셜 로그인 플러그인

Google·GitHub·Kakao·Naver·Apple 소셜 로그인과 기존 계정 연동을 처리합니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [로그인 흐름](#로그인-흐름)
- [API 레퍼런스](#api-레퍼런스)
- [엔티티 구조](#엔티티-구조)

---

## 개요

```
클라이언트 → GET /v1/oauth/:provider
                 │
                 ▼ (302 Redirect)
         프로바이더 인증 화면
                 │
                 ▼ (code 반환)
GET /v1/oauth/:provider/callback
    └─ 토큰 교환 → 사용자 정보 조회 → account_oauth upsert → JWT 발급
```

지원 프로바이더: `google` · `github` · `kakao` · `naver` · `apple`

---

## 설정

플러그인 활성화와 프로바이더 설정은 `app/plugins/oauth/config.json`에서 함께 관리합니다:

```json
{
    "enabled": true,
    "state_secret": "${OAUTH_STATE_SECRET}",
    "providers": [
        {
            "driver": "google",
            "client_id": "...",
            "client_secret": "...",
            "redirect_url": "/v1/oauth/google/callback",
            "scopes": ["openid", "email", "profile"]
        }
    ]
}
```

> Apple Sign-In 콜백은 Apple이 `POST`로 전송하므로  
> Go 서버 CORS·CSRF 설정의 `skip_paths`에 `/v1/oauth/apple/callback`을 추가해야 합니다.

---

## 로그인 흐름

### 신규 소셜 로그인

```
1. 클라이언트: GET /v1/oauth/google → 302 → Google 인증 화면
2. Google: GET /v1/oauth/google/callback?code=...
3. 서버: code 교환 → access_token → 사용자 정보 조회
4. account_oauth upsert (provider=google, provider_id=...)
5. account 없으면 자동 생성, 있으면 연결
6. JWT 발급 → 응답
```

### 계정 연동 (기존 로그인 계정에 소셜 추가)

```
POST /v1/account/oauth/link { provider, code } (JWT 필요)
    → account_oauth 추가
```

---

## API 레퍼런스

### 소셜 로그인

| 메소드         | 경로                               | 설명                                |
| -------------- | ---------------------------------- | ----------------------------------- |
| `GET`          | `/v1/oauth/:provider`          | 프로바이더 인증 화면으로 리다이렉트 |
| `GET` / `POST` | `/v1/oauth/:provider/callback` | 콜백 처리 + JWT 발급                |

### 계정 OAuth 연동 관리

| 메소드   | 경로                                      | 인증 | 설명                   |
| -------- | ----------------------------------------- | ---- | ---------------------- |
| `POST`   | `/v1/account/oauth/link`              | JWT  | 프로바이더 연동 추가   |
| `DELETE` | `/v1/account/oauth/link/:provider`    | JWT  | 연동 해제              |
| `GET`    | `/v1/account/oauth/providers`         | JWT  | 연동된 프로바이더 목록 |
| `POST`   | `/v1/account/oauth/refresh/:provider` | JWT  | 프로바이더 토큰 갱신   |

---

## 엔티티 구조

### account_oauth

소셜 계정 연결 정보를 저장합니다 (`plugins/oauth/entities/account_oauth.json`으로 자동 생성).

| 필드               | 타입         | 설명                                      |
| ------------------ | ------------ | ----------------------------------------- |
| `account_seq`      | integer      | 연결된 account seq                        |
| `provider`         | enum         | `google` `github` `kakao` `naver` `apple` |
| `provider_id`      | varchar(256) | 프로바이더 고유 사용자 ID                 |
| `status`           | enum         | `linked` `unlinked`                       |
| `email`            | varchar(320) | 프로바이더에서 제공한 이메일              |
| `name`             | varchar(256) | 프로바이더 표시 이름                      |
| `profile_image`    | text         | 프로필 이미지 URL                         |
| `access_token`     | text         | 프로바이더 Access Token                   |
| `refresh_token`    | text         | 프로바이더 Refresh Token                  |
| `token_expires_at` | datetime     | Access Token 만료 시각                    |
| `raw`              | json         | 프로바이더 원본 응답 (디버깅용)           |
| `linked_at`        | datetime     | 연동 시각                                 |
| `unlinked_at`      | datetime     | 연동 해제 시각                            |
