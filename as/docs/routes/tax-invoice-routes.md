# Tax Invoice Routes

기준 파일: `src/app/plugins/taxinvoice/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [Tax Invoice Guide](../../plugins/taxinvoice.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                             | 설명                              |
| ------ | ---------------------------------------------------------------- | --------------------------------- |
| POST   | [/v1/taxinvoice](#post-v1apitaxinvoice)                      | 세금계산서 등록/발행 요청(레거시) |
| POST   | [/v1/taxinvoice/register](#post-v1apitaxinvoiceregister)     | 세금계산서 등록                   |
| POST   | [/v1/taxinvoice/:seq/issue](#post-v1apitaxinvoiceseqissue)   | 등록 건 발행                      |
| POST   | [/v1/taxinvoice/:seq/cancel](#post-v1apitaxinvoiceseqcancel) | 발행 취소                         |
| GET    | [/v1/taxinvoice/:seq/state](#get-v1apitaxinvoiceseqstate)    | 발행 상태 조회                    |
| GET    | [/v1/taxinvoice/:seq](#get-v1apitaxinvoiceseq)               | 상세 조회                         |

## 라우트 상세

### POST /v1/taxinvoice

<a id="post-v1apitaxinvoice"></a>

- 설명: 세금계산서 등록 및 발행 플로우를 단일 요청으로 처리한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/taxinvoice" \
	-H "Content-Type: application/json" \
	-d '{"supplier":{"corpNo":"1234567890"},"buyer":{"corpNo":"0987654321"}}'
```

### POST /v1/taxinvoice/register

<a id="post-v1apitaxinvoiceregister"></a>

- 설명: 발행 전 단계로 세금계산서 데이터를 등록한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/taxinvoice/register" \
	-H "Content-Type: application/json" \
	-d '{"writeDate":"2026-03-04","amount":110000}'
```

### POST /v1/taxinvoice/:seq/issue

<a id="post-v1apitaxinvoiceseqissue"></a>

- 설명: 등록된 문서(`seq`)를 실제 발행한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/taxinvoice/1001/issue"
```

### POST /v1/taxinvoice/:seq/cancel

<a id="post-v1apitaxinvoiceseqcancel"></a>

- 설명: 이미 발행된 세금계산서를 취소한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/taxinvoice/1001/cancel" \
	-H "Content-Type: application/json" \
	-d '{"reason":"오발행 정정"}'
```

### GET /v1/taxinvoice/:seq/state

<a id="get-v1apitaxinvoiceseqstate"></a>

- 설명: 발행 진행 상태(접수/성공/실패 등)를 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/taxinvoice/1001/state"
```

### GET /v1/taxinvoice/:seq

<a id="get-v1apitaxinvoiceseq"></a>

- 설명: 세금계산서 상세 데이터와 처리 결과를 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/taxinvoice/1001"
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
- [PG Routes](./pg-routes.md)
- [SMS Routes](./sms-routes.md)
- [SMTP Routes](./smtp-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
