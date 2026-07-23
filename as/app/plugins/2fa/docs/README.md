# 2단계 인증 플러그인 (2FA)

TOTP(Time-based One-Time Password) 기반 2단계 인증을 제공합니다. QR코드로 인증 앱을 연결하고, 로그인 시 OTP를 추가 검증합니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [API](#api)
- [인증 흐름](#인증-흐름)
- [운영 팁](#운영-팁)

---

## 개요

| 항목       | 내용                                   |
| ---------- | -------------------------------------- |
| 인증 방식  | TOTP (RFC 6238)                        |
| OTP 자리수 | 6자리                                  |
| 유효 시간  | 30초 주기 (skew ±1 허용)               |
| 복구코드   | 10개 (1회용, 전화기 분실 시 사용)      |
| 계정 연동  | 기존 `account` 엔티티에 TOTP 필드 추가 |

---

## 설정

`config.json`:

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

### 설정 항목

| 항목                  | 기본값         | 설명                                 |
| --------------------- | -------------- | ------------------------------------ |
| `enabled`             | `true`         | 플러그인 활성화                      |
| `issuer`              | `EntityServer` | 인증 앱에 표시될 서비스명            |
| `code_digits`         | `6`            | OTP 자리수                           |
| `period_sec`          | `30`           | OTP 유효 시간(초)                    |
| `skew`                | `1`            | 시간 오차 허용 범위 (±1 주기)        |
| `recovery_code_count` | `10`           | 복구코드 발급 개수                   |
| `setup_token_ttl_sec` | `300`          | 2FA 설정 토큰 유효 시간(초)          |
| `max_verify_attempts` | `5`            | 연속 실패 허용 횟수                  |
| `verify_lockout_sec`  | `300`          | 잠금 해제까지 대기 시간(초)          |
| `jwt_access_ttl_sec`  | `3600`         | 2FA 완료 후 발급되는 액세스 토큰 TTL |
| `jwt_refresh_ttl_sec` | `1209600`      | 리프레시 토큰 TTL (14일)             |

---

## API

기본 경로: `/v1/account/2fa`

| 메서드   | 경로                   | 인증             | 설명                                  |
| -------- | ---------------------- | ---------------- | ------------------------------------- |
| `POST`   | `/setup`               | JWT 필요         | 2FA 설정 시작 — QR코드 및 secret 반환 |
| `POST`   | `/setup/verify`        | setup 토큰       | OTP 입력으로 2FA 활성화 확인          |
| `DELETE` | `/`                    | JWT 필요         | 2FA 비활성화                          |
| `GET`    | `/status`              | JWT 필요         | 2FA 활성화 여부 조회                  |
| `POST`   | `/recovery/regenerate` | JWT 필요         | 복구코드 재생성 (기존 코드 무효화)    |
| `POST`   | `/verify`              | two_factor_token | 로그인 중 OTP 검증 — 최종 JWT 발급    |
| `POST`   | `/recovery`            | two_factor_token | 복구코드로 인증 — 최종 JWT 발급       |

### POST /setup 응답 예시

```json
{
    "ok": true,
    "data": {
        "setup_token": "...",
        "qr_url": "otpauth://totp/EntityServer:user@example.com?secret=...&issuer=EntityServer",
        "secret": "JBSWY3DPEHPK3PXP"
    }
}
```

### POST /verify 요청 바디

```json
{
    "two_factor_token": "eyJ...",
    "code": "123456"
}
```

---

## 인증 흐름

### 2FA 설정

```
1. POST /account/login         → { two_factor_required: false, access_token: "..." }
   (또는 2FA 미설정 계정 정상 로그인)
2. POST /account/2fa/setup     → { setup_token, qr_url, secret }
3. 인증 앱으로 QR 스캔
4. POST /account/2fa/setup/verify  body: { setup_token, code }  → 2FA 활성화
```

### 2FA 활성화 계정 로그인

```
1. POST /account/login         → { two_factor_required: true, two_factor_token: "..." }
2. POST /account/2fa/verify    body: { two_factor_token, code }  → { access_token, refresh_token }
```

### 복구코드 로그인 (기기 분실 시)

```
POST /account/2fa/recovery    body: { two_factor_token, recovery_code: "xxxx-xxxx" }
→ { access_token, refresh_token }
```

---

## 운영 팁

- `issuer`는 인증 앱 목록에 표시될 서비스 이름 — 배포 전 변경할 것
- 복구코드는 발급 시 일회성으로 보여주며 DB에 해시로 저장됨 — 사용자에게 안전하게 보관하도록 안내
- `skew: 1` 설정으로 ±30초 오차를 허용하므로, 서버 시간 동기화(NTP) 필요
- `max_verify_attempts` 초과 시 `verify_lockout_sec`만큼 잠김 — 운영 환경에 맞게 조정
