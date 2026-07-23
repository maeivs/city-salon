# 결제(PG) 플러그인

토스페이먼츠, 페이레터(Payletter)를 통한 결제 처리 플러그인입니다. 주문 생성부터 결제 승인, 취소, 웹훅 처리까지 지원합니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [환경변수](#환경변수)
- [API](#api)
- [결제 흐름](#결제-흐름)
- [운영 팁](#운영-팁)

---

## 개요

| 항목            | 내용                                  |
| --------------- | ------------------------------------- |
| 지원 프로바이더 | 토스페이먼츠(V2), 페이레터(Payletter) |
| 금액 제한       | 최소 100원, 최대 10,000,000원         |
| 주문 ID         | `ORD` 접두사 자동 생성                |
| 웹훅            | PG사 결제 결과 웹훅 자동 처리         |

> 기본 비활성화(`enabled: false`)입니다. PG사 계약 및 API 키 발급 후 활성화하세요.

---

## 설정

`config.json`:

```json
{
    "enabled": false,
    "default": "toss_payments",
    "webhook_secret": "",
    "order_id_prefix": "ORD",
    "success_url": "/payment/success",
    "fail_url": "/payment/fail",
    "webhook_url": "/v1/pg/webhook",
    "amount_limit": { "min": 100, "max": 10000000 },
    "workers": 2,
    "providers": {
        "toss_payments": {
            "driver": "toss_payments",
            "client_key": "${TOSS_CLIENT_KEY}",
            "secret_key": "${TOSS_SECRET_KEY}",
            "api_url": "https://api.tosspayments.com",
            "api_version": "2024-06-01"
        },
        "payletter": {
            "driver": "payletter",
            "client_id": "${PAYLETTER_CLIENT_ID}",
            "api_key": "${PAYLETTER_API_KEY}",
            "api_key_search": "${PAYLETTER_API_KEY_SEARCH}",
            "api_url": "https://pgapi.payletter.com"
        }
    }
}
```

### 설정 항목

| 항목               | 기본값             | 설명                        |
| ------------------ | ------------------ | --------------------------- |
| `enabled`          | `false`            | 플러그인 활성화             |
| `default`          | `toss_payments`    | 사용할 프로바이더 키        |
| `webhook_secret`   | `""`               | 웹훅 서명 검증 비밀키       |
| `order_id_prefix`  | `ORD`              | 주문 ID 앞에 붙는 접두사    |
| `success_url`      | `/payment/success` | 결제 성공 후 리다이렉트 URL |
| `fail_url`         | `/payment/fail`    | 결제 실패 후 리다이렉트 URL |
| `amount_limit.min` | `100`              | 최소 결제 금액 (원)         |
| `amount_limit.max` | `10000000`         | 최대 결제 금액 (원)         |
| `workers`          | `2`                | 웹훅 처리 워커 수           |

---

## 환경변수

```env
# 토스페이먼츠
TOSS_CLIENT_KEY=test_ck_...   # 또는 live_ck_...
TOSS_SECRET_KEY=test_sk_...   # 또는 live_sk_...

# 페이레터
PAYLETTER_CLIENT_ID=...
PAYLETTER_API_KEY=...
PAYLETTER_API_KEY_SEARCH=...
```

---

## API

기본 경로: `/v1/pg`

| 메서드 | 경로                      | 인증        | 설명                            |
| ------ | ------------------------- | ----------- | ------------------------------- |
| `GET`  | `/config`                 |             | 클라이언트 SDK 설정 조회 (공개) |
| `POST` | `/orders`                 | 로그인 필요 | 주문 생성                       |
| `GET`  | `/orders/:orderId`        | 로그인 필요 | 주문 조회                       |
| `POST` | `/confirm`                | 로그인 필요 | 결제 승인 (PG → 서버 확인)      |
| `POST` | `/orders/:orderId/cancel` | 로그인 필요 | 결제 취소                       |
| `POST` | `/orders/:orderId/sync`   | 로그인 필요 | PG사 상태 동기화 (관리자)       |
| `POST` | `/webhook`                |             | PG사 웹훅 수신                  |

### GET /config 응답 예시

```json
{
    "ok": true,
    "data": {
        "provider": "toss_payments",
        "client_key": "test_ck_...",
        "success_url": "/payment/success",
        "fail_url": "/payment/fail"
    }
}
```

### POST /orders 요청 바디

```json
{
    "amount": 29900,
    "order_name": "프리미엄 플랜 1개월",
    "customer_name": "홍길동",
    "customer_email": "hong@example.com",
    "provider": "toss_payments"
}
```

### POST /confirm 요청 바디 (토스페이먼츠)

```json
{
    "payment_key": "...",
    "order_id": "ORD-...",
    "amount": 29900
}
```

### 주문 상태 값

| 상태        | 설명                  |
| ----------- | --------------------- |
| `created`   | 주문 생성됨 (결제 전) |
| `pending`   | 결제 진행 중          |
| `paid`      | 결제 완료             |
| `cancelled` | 취소됨                |
| `failed`    | 결제 실패             |

---

## 결제 흐름

```
1. GET  /v1/pg/config              → { client_key }
2. POST /v1/pg/orders              → { order_id }
3. 클라이언트 → 토스페이먼츠 위젯/SDK
4. 결제 완료 → GET /payment/success?paymentKey=...&orderId=...
5. POST /v1/pg/confirm             body: { payment_key, order_id, amount }
6. 서버 → PG사 최종 승인 확인 완료 → { status: "paid" }
```

---

## 운영 팁

- 테스트 환경에서는 `test_ck_...` / `test_sk_...` 키 사용
- `webhook_secret` 설정 권장 — PG사 웹훅 서명 검증으로 위변조 방지
- 실 결제 전 반드시 `success_url`, `fail_url`을 실제 서비스 URL로 변경
- 결제 금액은 클라이언트와 서버 모두에서 검증 (프론트 금액 조작 방지)
