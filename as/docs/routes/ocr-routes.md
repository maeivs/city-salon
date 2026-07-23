# OCR Routes

기준 파일: `src/app/plugins/ocr/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [OCR Guide](../../plugins/ocr.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                        | 설명                 |
| ------ | ----------------------------------------------------------- | -------------------- |
| POST   | [/v1/ocr/recognize](#post-v1apiocrrecognize)            | OCR 동기 인식        |
| POST   | [/v1/ocr/recognize/async](#post-v1apiocrrecognizeasync) | OCR 비동기 인식      |
| POST   | [/v1/ocr/:docType](#post-v1apiocrdoctype)               | 문서 유형별 OCR 인식 |
| GET    | [/v1/ocr/results](#get-v1apiocrresults)                 | OCR 결과 목록 조회   |
| GET    | [/v1/ocr/results/:id](#get-v1apiocrresultsid)           | OCR 결과 단건 조회   |
| GET    | [/v1/ocr/results/:id/text](#get-v1apiocrresultsidtext)  | OCR 텍스트 추출 조회 |
| DELETE | [/v1/ocr/results/:id](#delete-v1apiocrresultsid)        | OCR 결과 삭제        |
| GET    | [/v1/ocr/quota](#get-v1apiocrquota)                     | OCR 사용량/쿼터 조회 |

## 라우트 상세

### POST /v1/ocr/recognize

<a id="post-v1apiocrrecognize"></a>

- 설명: OCR 인식을 동기 방식으로 수행하고 즉시 결과를 반환한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/ocr/recognize" \
	-H "Content-Type: application/json" \
	-d '{"imageUrl":"https://example.com/receipt.jpg"}'
```

### POST /v1/ocr/recognize/async

<a id="post-v1apiocrrecognizeasync"></a>

- 설명: OCR 작업을 비동기로 등록하고 추적 가능한 작업 ID를 반환한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/ocr/recognize/async" \
	-H "Content-Type: application/json" \
	-d '{"imageUrl":"https://example.com/invoice.jpg"}'
```

### POST /v1/ocr/:docType

<a id="post-v1apiocrdoctype"></a>

- 설명: `docType`(예: receipt, invoice) 기반 템플릿으로 OCR 인식을 수행한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/ocr/receipt" \
	-H "Content-Type: application/json" \
	-d '{"imageUrl":"https://example.com/receipt.jpg"}'
```

### GET /v1/ocr/results

<a id="get-v1apiocrresults"></a>

- 설명: 저장된 OCR 결과를 목록 형태로 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/ocr/results"
```

### GET /v1/ocr/results/:id

<a id="get-v1apiocrresultsid"></a>

- 설명: OCR 결과 ID 단건의 원본/메타 정보를 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/ocr/results/98765"
```

### GET /v1/ocr/results/:id/text

<a id="get-v1apiocrresultsidtext"></a>

- 설명: OCR 결과에서 텍스트 추출 결과만 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/ocr/results/98765/text"
```

### DELETE /v1/ocr/results/:id

<a id="delete-v1apiocrresultsid"></a>

- 설명: 저장된 OCR 결과를 삭제한다.
- 사용 예제:

```bash
curl -X DELETE "http://localhost:3000/v1/ocr/results/98765"
```

### GET /v1/ocr/quota

<a id="get-v1apiocrquota"></a>

- 설명: OCR 호출량, 잔여량 등 사용량 정보를 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/ocr/quota"
```

## 관련 문서

- [Account Routes](./account-routes.md)
- [Alimtalk Routes](./alimtalk-routes.md)
- [Email Verification](./email-verification.md)
- [Friendtalk Routes](./friendtalk-routes.md)
- [Holidays Routes](./holidays-routes.md)
- [Identity Routes](./identity-routes.md)
- [LLM Routes](./llm-routes.md)
- [Password Reset](./password-reset.md)
- [PG Routes](./pg-routes.md)
- [SMS Routes](./sms-routes.md)
- [SMTP Routes](./smtp-routes.md)
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
