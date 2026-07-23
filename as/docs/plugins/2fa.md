# 2FA (TOTP) 플러그인

QR 코드 기반 TOTP(Time-based One-Time Password) 2단계 인증 플러그인입니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [로그인 흐름](#로그인-흐름)
- [API 레퍼런스](#api-레퍼런스)
- [엔티티 구조](#엔티티-구조)

---

## 개요

클라이언트는 먼저 앱서버 `/v1/health`로 `_csrf` 쿠키를 확보한 뒤 앱서버 `/v1/auth/login`으로 로그인합니다. 로그인 요청은 앱서버 CSRF 검증을 통과한 뒤 Go 서버로 전달되며, Go 서버가 `two_factor_token`을 반환하면 클라이언트는
이 플러그인의 `/v1/account/2fa/verify` 로 TOTP 코드를 전달해 최종 JWT를 발급받습니다.

```
POST /v1/auth/login
    └─ 2FA 활성화 계정 → { two_factor_token: "..." }
            │
            ▼
POST /v1/account/2fa/verify   (TOTP 코드 제출)
    └─ 검증 성공 → { access_token, refresh_token }
```

---

## 설정

`app/plugins/2fa/config.json`:

```json
{
    "enabled": true,
    "issuer": "EntityServer",
    "code_digits": 6,
    "period_sec": 30,
    "skew": 1,
    "recovery_code_count": 10,
    "setup_token_ttl_sec": 300,
    "max_verify_attempts": 5,
    "verify_lockout_sec": 300,
    "jwt_access_ttl_sec": 3600,
    "jwt_refresh_ttl_sec": 1209600,
    "jwt_issuer": "entity-server"
}
```

| 필드                  | 기본값            | 설명                                  |
| --------------------- | ----------------- | ------------------------------------- |
| `enabled`             | `true`            | 플러그인 활성화                       |
| `issuer`              | `"EntityServer"`  | OTP 앱에 표시되는 서비스 이름         |
| `code_digits`         | `6`               | OTP 코드 자릿수                       |
| `period_sec`          | `30`              | OTP 유효 주기 (초)                    |
| `skew`                | `1`               | 허용 시간 오차 (±`skew` 주기)         |
| `recovery_code_count` | `10`              | 발급되는 복구 코드 수                 |
| `setup_token_ttl_sec` | `300`             | 설정 토큰 유효 시간 (초)              |
| `max_verify_attempts` | `5`               | 실패 허용 횟수 (초과 시 잠금)         |
| `verify_lockout_sec`  | `300`             | 잠금 해제까지 대기 시간 (초)          |
| `jwt_access_ttl_sec`  | `3600`            | 발급하는 Access Token 유효 시간 (초)  |
| `jwt_refresh_ttl_sec` | `1209600`         | 발급하는 Refresh Token 유효 시간 (초) |
| `jwt_issuer`          | `"entity-server"` | JWT `iss` 클레임 값                   |

---

## 로그인 흐름

```
1. POST /v1/auth/login → { two_factor_token }
2. POST /v1/account/2fa/verify { two_factor_token, code } → { access_token, refresh_token }
```

복구 코드 사용 시:

```
POST /v1/account/2fa/recovery { two_factor_token, recovery_code }
    → { access_token, refresh_token }
```

### 2FA 등록 흐름

```
1. POST /v1/account/2fa/setup (JWT) → { qr_url, secret, setup_token }
2. 클라이언트: OTP 앱으로 QR 스캔
3. POST /v1/account/2fa/setup/verify { setup_token, code } → 활성화 완료 + 복구 코드 반환
```

---

## API 레퍼런스

| 메소드   | 경로                                  | 인증               | 설명                          |
| -------- | ------------------------------------- | ------------------ | ----------------------------- |
| `POST`   | `/v1/account/2fa/setup`               | JWT                | 2FA 설정 시작 (QR·secret)     |
| `POST`   | `/v1/account/2fa/setup/verify`        | JWT or setup_token | 2FA 활성화 확인               |
| `DELETE` | `/v1/account/2fa`                     | JWT                | 2FA 비활성화                  |
| `GET`    | `/v1/account/2fa/status`              | JWT                | 2FA 활성화 여부 조회          |
| `POST`   | `/v1/account/2fa/recovery/regenerate` | JWT                | 복구 코드 재생성              |
| `POST`   | `/v1/account/2fa/verify`              | two_factor_token   | TOTP 코드 검증 + JWT 발급     |
| `POST`   | `/v1/account/2fa/recovery`            | two_factor_token   | 복구 코드로 로그인 + JWT 발급 |

---

## 엔티티 구조

2FA 플러그인 활성화 시 `account` 엔티티에 아래 필드가 추가됩니다  
(`plugins/2fa/entities/account.json`으로 자동 동기화).

| 필드                   | 타입        | 설명                                  |
| ---------------------- | ----------- | ------------------------------------- |
| `totp_secret`          | varchar(64) | TOTP Base32 시크릿 (암호화 저장 권장) |
| `totp_enabled`         | bool        | 2FA 활성화 여부                       |
| `totp_enabled_time`    | datetime    | 2FA 활성화 시각                       |
| `totp_recovery_codes`  | text        | 복구 코드 목록 (JSON 배열)            |
| `totp_failed_attempts` | uint        | 연속 실패 횟수 (잠금 판단 기준)       |
| `totp_locked_until`    | datetime    | 잠금 해제 시각                        |
