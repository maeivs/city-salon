# PG(결제) 가이드

토스페이먼츠, KCP, 이니시스, 카카오페이, 페이레터, PayPal 등 다양한 PG사를 통한 결제 처리 가이드입니다.

이 문서는 플러그인의 개요/설정/운영 가이드를 중심으로 다룹니다.  
실제 라우트표, 호출 예제, 응답 예제는 [PG Routes](../routes/pg-routes.md) 문서를 참고하세요.

---

## 목차

- [개요](#개요)
- [프로바이더 비교](#프로바이더-비교)
- [설정](#설정)
- [결제 흐름](#결제-흐름)
- [API 레퍼런스](#api-레퍼런스)
- [웹훅 처리](#웹훅-처리)
- [운영 팁](#운영-팁)

---

## 개요

Entity App Server의 PG 플러그인은 여러 결제 대행사를 단일 API로 추상화합니다.

- 주문 생성 → 결제창 → 승인까지 일관된 흐름
- 전체/부분 취소
- PG사 웹훅 수신·검증
- 클라이언트 SDK 설정 제공

---

## 프로바이더 비교

| provider       | driver          | 특징                        |
| -------------- | --------------- | --------------------------- |
| 토스페이먼츠   | `toss_payments` | 국내 대표 PG, 간편결제 통합 |
| KCP            | `kcp`           | 기업향, 에스크로 지원       |
| KG이니시스     | `inicis`        | 다양한 결제 수단, 해외결제  |
| 다날           | `danal`         | 휴대폰 소액결제 특화        |
| 헥토파이낸셜   | `hecto`         | 계좌이체/가상계좌 강점      |
| 카카오페이     | `kakaopay`      | 카카오 간편결제             |
| 네이버페이     | `naverpay`      | 네이버 간편결제             |
| 나이스페이먼츠 | `nice_payments` | 나이스 간편결제             |
| 페이코         | `payco`         | NHN 간편결제                |
| 와나           | `wanna`         | B2B 정산 특화               |
| 페이레터       | `payletter`     | 게임·콘텐츠 결제 특화       |
| PayPal         | `paypal`        | 글로벌 결제, 해외 고객 지원 |

---

## 설정

`configs/plugins/pg.json`:

```json
{
    "enabled": false,
    "default": "toss_payments",
    "providers": {
        "toss_payments": {
            "driver": "toss_payments",
            "client_key": "${TOSS_CLIENT_KEY}",
            "secret_key": "${TOSS_SECRET_KEY}",
            "api_url": "https://api.tosspayments.com",
            "api_version": "2024-06-01"
        },
        "kakaopay": {
            "driver": "kakaopay",
            "admin_key": "${KAKAO_PAY_ADMIN_KEY}",
            "cid": "${KAKAO_PAY_CID}",
            "api_url": "https://kapi.kakao.com"
        },
        "nice_payments": {
            "driver": "nice_payments",
            "client_key": "${NICE_CLIENT_KEY}",
            "secret_key": "${NICE_SECRET_KEY}",
            "api_url": "https://api.nicepay.co.kr"
        },
        "inicis": {
            "driver": "inicis",
            "mid": "${INICIS_MID}",
            "sign_key": "${INICIS_SIGN_KEY}",
            "iv": "${INICIS_IV}",
            "api_url": "https://iniapi.inicis.com"
        },
        "naverpay": {
            "driver": "naverpay",
            "partner_id": "${NAVER_PAY_PARTNER_ID}",
            "client_id": "${NAVER_PAY_CLIENT_ID}",
            "client_secret": "${NAVER_PAY_CLIENT_SECRET}",
            "chain_id": "${NAVER_PAY_CHAIN_ID}",
            "api_url": "https://pay.naver.com"
        },
        "payco": {
            "driver": "payco",
            "partner_id": "${PAYCO_PARTNER_ID}",
            "partner_secret": "${PAYCO_PARTNER_SECRET}",
            "api_url": "https://apis.payco.com"
        },
        "payletter": {
            "driver": "payletter",
            "client_id": "${PAYLETTER_CLIENT_ID}",
            "api_key": "${PAYLETTER_API_KEY}",
            "api_key_search": "${PAYLETTER_API_KEY_SEARCH}",
            "api_url": "https://pgapi.payletter.com"
        },
        "paypal": {
            "driver": "paypal",
            "client_id": "${PAYPAL_CLIENT_ID}",
            "secret_key": "${PAYPAL_CLIENT_SECRET}",
            "api_url": "https://api-m.sandbox.paypal.com",
            "webhook_secret": "${PAYPAL_WEBHOOK_ID}"
        }
    }
}
```

### 환경변수 (.env)

```env
# 토스페이먼츠
TOSS_CLIENT_KEY=test_ck_...
TOSS_SECRET_KEY=test_sk_...

# 카카오페이
KAKAO_PAY_ADMIN_KEY=...
KAKAO_PAY_CID=TC0ONETIME

# 페이레터
PAYLETTER_CLIENT_ID=your_client_id
PAYLETTER_API_KEY=payment_api_key
PAYLETTER_API_KEY_SEARCH=search_api_key

# PayPal
PAYPAL_CLIENT_ID=AXxx...
PAYPAL_CLIENT_SECRET=EXxx...
PAYPAL_WEBHOOK_ID=WEBHOOK_ID_FROM_PAYPAL_DASHBOARD
```

---

## 결제 흐름

```
1. POST /v1/pg/orders         →  주문 생성 (order_id 발급)
2. 클라이언트에서 PG 결제창 호출    →  사용자 결제 진행
3. POST /v1/pg/confirm         →  결제 승인 (payment_key + order_id + amount)
4. 결제 완료                       →  order status: paid
```

> 취소 시: `POST /v1/pg/orders/:orderId/cancel`

---

## API 레퍼런스

이 문서는 기능 소개/설정/운영 기준을 다룹니다.  
라우트별 파라미터 표, 요청/응답 예제, 상태코드는 아래 라우트 문서를 기준으로 확인합니다.

- 상세 API 레퍼런스: [PG Routes](../routes/pg-routes.md)

기본 경로: `/v1/pg`

| 메서드 | 경로                      | 설명                     |
| ------ | ------------------------- | ------------------------ |
| `POST` | `/orders`                 | 주문 생성                |
| `GET`  | `/orders/:orderId`        | 주문 조회                |
| `POST` | `/confirm`                | 결제 승인                |
| `POST` | `/orders/:orderId/cancel` | 결제 취소                |
| `POST` | `/orders/:orderId/sync`   | PG사와 상태 동기화       |
| `POST` | `/webhook`                | PG사 웹훅 수신           |
| `GET`  | `/config`                 | 클라이언트 SDK 설정 조회 |

---

## 웹훅 처리

PG사에서 결제 이벤트를 서버로 전송합니다.

```
POST /v1/pg/webhook
```

게이트웨이는 웹훅 서명을 검증한 후 `pg_webhook_log` 테이블에 기록합니다.

### 페이레터 웹훅 서명 검증

```
SHA256(user_id + amount + tid + api_key).toUpperCase()
```

서명이 일치하지 않으면 `400` 오류를 반환합니다.

### PayPal 웹훅 서명 검증

PayPal Webhook Signature 검증 API를 사용합니다.  
`webhook_secret` 설정값에 **PayPal 대시보드에서 발급한 Webhook ID**를 입력해야 합니다.

요청 헤더에서 아래 값을 추출한 뒤 `|` 구분자로 합쳐 `signature` 파라미터로 전달합니다:

```
PAYPAL-AUTH-ALGO|PAYPAL-CERT-URL|PAYPAL-TRANSMISSION-ID|PAYPAL-TRANSMISSION-SIG|PAYPAL-TRANSMISSION-TIME
```

`webhook_secret` 미설정 시 검증을 건너뜁니다 (개발 환경용).

---

## 운영 팁

- 결제 금액 불일치(`amount mismatch`) 방지를 위해 `confirm` 시 서버 측 금액을 재검증
- 웹훅 엔드포인트는 PG사 어드민에 등록 필수 (방화벽 허용 포함)
- `/orders/:orderId/sync`로 웹훅 유실 시 수동으로 PG사 상태 동기화 가능
- 테스트 환경에서는 PG사 테스트 키 사용 (`test_ck_`, `TC0ONETIME` 등)
- **PayPal** 라이브 전환 시 `api_url`을 `https://api-m.paypal.com`으로 변경
- **PayPal** `confirmPayment` 응답의 `paymentKey`는 **Capture ID**이므로 환불 시 이 값을 사용

---

## 관련 문서

- [PG Routes](../routes/pg-routes.md)
- [설정 예제](../../src/app/plugins/pg/config.example.json)
- [페이레터 클라이언트 구현](../../src/app/plugins/pg/client-payletter.ts)
- [Entity Server PG 가이드](../../../docs/plugins/pg-guide.md)
