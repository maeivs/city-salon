# PG Routes

기준 파일: `src/app/plugins/pg/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [PG Guide](../../plugins/pg.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                                  | 설명                      |
| ------ | --------------------------------------------------------------------- | ------------------------- |
| POST   | [/v1/pg/orders](#post-v1apipgorders)                              | 주문 생성                 |
| GET    | [/v1/pg/orders/:orderId](#get-v1apipgordersorderid)               | 주문 단건 조회            |
| POST   | [/v1/pg/confirm](#post-v1apipgconfirm)                            | 결제 승인                 |
| POST   | [/v1/pg/orders/:orderId/cancel](#post-v1apipgordersorderidcancel) | 결제 취소                 |
| POST   | [/v1/pg/orders/:orderId/sync](#post-v1apipgordersorderidsync)     | 결제 상태 동기화          |
| POST   | [/v1/pg/webhook](#post-v1apipgwebhook)                            | PG 웹훅 수신              |
| GET    | [/v1/pg/config](#get-v1apipgconfig)                               | 클라이언트 결제 설정 조회 |

## 라우트 상세

### POST /v1/pg/orders

<a id="post-v1apipgorders"></a>

- 설명: 결제 요청을 위한 주문을 생성한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/pg/orders" \
	-H "Content-Type: application/json" \
	-d '{"amount":10000,"orderName":"테스트 주문"}'
```

### GET /v1/pg/orders/:orderId

<a id="get-v1apipgordersorderid"></a>

- 설명: 주문 ID로 결제 주문 상태를 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/pg/orders/ORD_20260304_0001"
```

### POST /v1/pg/confirm

<a id="post-v1apipgconfirm"></a>

- 설명: PG 승인 토큰을 받아 결제를 최종 승인한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/pg/confirm" \
	-H "Content-Type: application/json" \
	-d '{"paymentKey":"pay_xxx","orderId":"ORD_20260304_0001","amount":10000}'
```

### POST /v1/pg/orders/:orderId/cancel

<a id="post-v1apipgordersorderidcancel"></a>

- 설명: 승인된 결제를 주문 기준으로 취소한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/pg/orders/ORD_20260304_0001/cancel" \
	-H "Content-Type: application/json" \
	-d '{"reason":"고객 요청"}'
```

### POST /v1/pg/orders/:orderId/sync

<a id="post-v1apipgordersorderidsync"></a>

- 설명: 관리 목적의 주문 상태 강제 동기화를 수행한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/pg/orders/ORD_20260304_0001/sync"
```

### POST /v1/pg/webhook

<a id="post-v1apipgwebhook"></a>

- 설명: PG사가 호출하는 웹훅 엔드포인트로 결제 이벤트를 수신한다.
- 사용 예제:

```bash
# 일반 (토스페이먼츠 등)
curl -X POST "http://localhost:3000/v1/pg/webhook" \
	-H "Content-Type: application/json" \
	-d '{"eventType":"PAYMENT_STATUS_CHANGED","orderId":"ORD_20260304_0001"}'

# PayPal 웹훅 (헤더에 서명 정보 포함)
curl -X POST "http://localhost:3000/v1/pg/webhook" \
	-H "Content-Type: application/json" \
	-H "PAYPAL-AUTH-ALGO: SHA256withRSA" \
	-H "PAYPAL-CERT-URL: https://api.paypal.com/v1/notifications/xxx" \
	-H "PAYPAL-TRANSMISSION-ID: tx-id" \
	-H "PAYPAL-TRANSMISSION-SIG: sig" \
	-H "PAYPAL-TRANSMISSION-TIME: 2026-03-06T12:00:00Z" \
	-d '{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"cap_xxx"}}'
```

> **PayPal 웹훅 서명 헤더 조합**
>
> 게이트웨이에서 `signature` 값을 구성하는 방식:
>
> ```
> {PAYPAL-AUTH-ALGO}|{PAYPAL-CERT-URL}|{PAYPAL-TRANSMISSION-ID}|{PAYPAL-TRANSMISSION-SIG}|{PAYPAL-TRANSMISSION-TIME}
> ```
>
> `webhook_secret` 설정이 없으면 검증을 건너뜁니다.

### GET /v1/pg/config

<a id="get-v1apipgconfig"></a>

- 설명: 프런트엔드 결제 SDK 초기화용 설정값을 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/pg/config"
```

## 관련 문서

- [Account Routes](./account-routes.md)
- [Alimtalk Routes](./alimtalk-routes.md)
- [Email Verification](./email-verification.md)
- [Friendtalk Routes](./friendtalk-routes.md)
- [Holidays Routes](./holidays-routes.md)
- [Identity Routes](./identity-routes.md)
- [LLM Routes](./llm-routes.md)
- [OCR Routes](./ocr-routes.md)
- [Password Reset](./password-reset.md)
- [SMS Routes](./sms-routes.md)
- [SMTP Routes](./smtp-routes.md)
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
