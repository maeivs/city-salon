# 본인인증 플러그인 (Identity)

NICE 휴대폰 본인인증 서비스를 연동합니다. 주민번호 없이 휴대폰 번호와 통신사 인증만으로 CI/DI를 발급받습니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [환경변수](#환경변수)
- [API](#api)
- [인증 흐름](#인증-흐름)
- [운영 팁](#운영-팁)

---

## 개요

| 항목           | 내용                                              |
| -------------- | ------------------------------------------------- |
| 프로바이더     | NICE 인증 (NICEid / CheckPlus)                    |
| 인증 방식      | 팝업/리다이렉트 방식 (중계사 콜백)                |
| CI             | 연계정보 — 개인 식별자 (서비스 간 공유 불가)      |
| DI             | 중복가입 확인 정보                                |
| 중복 가입 방지 | `duplicate_ci_check: true` 시 동일 CI 재가입 차단 |

> 기본 비활성화(`enabled: false`) 상태입니다. NICE 계약 및 사이트코드 발급 후 활성화하세요.

---

## 설정

`config.json`:

```json
{
    "enabled": false,
    "default": "nice",
    "return_url": "/v1/identity/callback",
    "success_redirect_url": "",
    "failure_redirect_url": "",
    "duplicate_ci_check": true,
    "request_ttl_sec": 300,
    "result_ttl_sec": 600,
    "providers": {
        "nice": {
            "driver": "nice",
            "site_code": "${NICE_SITE_CODE}",
            "site_password": "${NICE_SITE_PASSWORD}",
            "client_id": "${NICE_CLIENT_ID}",
            "client_secret": "${NICE_CLIENT_SECRET}"
        }
    },
    "rate_limit": {
        "per_ip_per_hour": 10,
        "per_account_per_day": 5
    }
}
```

### 설정 항목

| 항목                             | 기본값  | 설명                                   |
| -------------------------------- | ------- | -------------------------------------- |
| `enabled`                        | `false` | 플러그인 활성화                        |
| `default`                        | `nice`  | 사용할 프로바이더 키                   |
| `return_url`                     | —       | NICE 콜백 수신 URL (서버 내부)         |
| `success_redirect_url`           | —       | 인증 성공 후 클라이언트 리다이렉트 URL |
| `failure_redirect_url`           | —       | 인증 실패 후 클라이언트 리다이렉트 URL |
| `duplicate_ci_check`             | `true`  | CI 중복 가입 차단 여부                 |
| `request_ttl_sec`                | `300`   | 인증 요청 유효 시간(초)                |
| `result_ttl_sec`                 | `600`   | 인증 결과 보관 시간(초)                |
| `rate_limit.per_ip_per_hour`     | `10`    | IP당 시간별 최대 요청 수               |
| `rate_limit.per_account_per_day` | `5`     | 계정당 일별 최대 요청 수               |

---

## 환경변수

```env
NICE_SITE_CODE=NICE_사이트코드
NICE_SITE_PASSWORD=NICE_사이트패스워드
NICE_CLIENT_ID=NICE_클라이언트ID
NICE_CLIENT_SECRET=NICE_클라이언트시크릿
```

NICE 계약 후 [NICE 개발자센터](https://developer.nicelabs.co.kr)에서 발급받습니다.

---

## API

기본 경로: `/v1/identity`

| 메서드 | 경로                  | 인증     | 설명                                            |
| ------ | --------------------- | -------- | ----------------------------------------------- |
| `POST` | `/request`            | JWT 선택 | 인증 요청 생성 — NICE 팝업용 암호화 데이터 반환 |
| `POST` | `/callback`           |          | NICE 중계사 콜백 수신 (서버 내부용)             |
| `GET`  | `/result/:request_id` | JWT 선택 | 인증 결과 조회                                  |
| `POST` | `/verify-ci`          |          | CI 값으로 중복 가입 여부 확인                   |

### POST /request 요청 바디

```json
{
    "purpose": "signup"
}
```

`purpose` 유효값: `signup`, `account_recovery`, `adult_verification`

### POST /request 응답 예시

```json
{
    "ok": true,
    "data": {
        "request_id": "uuid-v4",
        "enc_data": "암호화된_요청_데이터",
        "token_version_id": "...",
        "integrity_value": "...",
        "url": "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb"
    }
}
```

### GET /result/:request_id 응답 예시

```json
{
    "ok": true,
    "data": {
        "name": "홍길동",
        "birth": "19900101",
        "gender": "M",
        "mobile": "01012345678",
        "ci": "...",
        "di": "..."
    }
}
```

---

## 인증 흐름

```
1. POST /identity/request          → { enc_data, url, ... }
2. 클라이언트에서 NICE 팝업 열기   (enc_data를 팝업 URL에 전달)
3. 사용자 휴대폰 인증 완료
4. NICE → POST /identity/callback  (서버로 결과 전달)
5. GET  /identity/result/:request_id → { name, birth, ci, di, ... }
6. 서비스 로직에서 결과 활용 (회원가입 완료, 계정 복구 등)
```

---

## 운영 팁

- `success_redirect_url`, `failure_redirect_url`은 실제 서비스 URL로 설정할 것
- 결과는 `result_ttl_sec`(기본 10분) 후 자동 삭제 → 조회는 즉시 처리
- CI는 서비스 간 공유 불가 — 동일 사용자라도 서비스별로 다른 CI 발급
- 테스트 환경에서는 NICE 제공 테스트 사이트코드 사용
