# Alimtalk Routes

기준 파일: `src/app/plugins/alimtalk/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [Alimtalk Guide](../../plugins/alimtalk.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                                     | 설명             |
| ------ | ------------------------------------------------------------------------ | ---------------- |
| POST   | [/v1/alimtalk/send](#post-v1apialimtalksend)                         | 알림톡 발송      |
| GET    | [/v1/alimtalk/status/:seq](#get-v1apialimtalkstatusseq)              | 발송 상태 조회   |
| GET    | [/v1/alimtalk/templates](#get-v1apialimtalktemplates)                | 템플릿 목록 조회 |
| POST   | [/v1/alimtalk/webhook/:provider](#post-v1apialimtalkwebhookprovider) | 공급사 웹훅 수신 |

## 라우트 상세

### POST /v1/alimtalk/send

<a id="post-v1apialimtalksend"></a>

- 설명: 수신자/템플릿 정보를 기반으로 알림톡을 발송한다.
- 요청 파라미터:

| 위치 | 필드            | 타입   | 필수 | 설명                               |
| ---- | --------------- | ------ | ---- | ---------------------------------- |
| Body | `template_code` | string | ✅   | 카카오 알림톡 템플릿 코드          |
| Body | `receiver`      | string | ✅   | 수신자 전화번호                    |
| Body | `variables`     | object |      | 템플릿 `#{변수명}` 치환 값         |
| Body | `provider`      | string |      | 드라이버명 (비어 있으면 `default`) |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/alimtalk/send" \
	-H "Content-Type: application/json" \
	-d '{"template_code":"ORDER_001","receiver":"01012345678","variables":{"고객명":"홍길동","주문번호":"ORD-2025-001","결제금액":"35,000"}}'
```

- 응답 예제:

`202 Accepted`

```json
{
    "ok": true,
    "message": "alimtalk queued"
}
```

`400 Bad Request` (`template_code`, `receiver` 누락)

```json
{
    "ok": false,
    "message": "template_code and receiver are required"
}
```

`503 Service Unavailable` (서비스 비활성/미주입)

```json
{
    "ok": false,
    "message": "Alimtalk service not available"
}
```

### GET /v1/alimtalk/status/:seq

<a id="get-v1apialimtalkstatusseq"></a>

- 설명: 발송 요청 건(`seq`)의 상태를 조회한다.
- 요청 파라미터:

| 위치 | 필드  | 타입   | 필수 | 설명               |
| ---- | ----- | ------ | ---- | ------------------ |
| Path | `seq` | string | ✅   | 알림톡 로그 시퀀스 |

- 사용 예제:

```bash
curl "http://localhost:3000/v1/alimtalk/status/501"
```

- 응답 예제:

`501 Not Implemented`

```json
{
    "ok": false,
    "message": "not implemented yet"
}
```

### GET /v1/alimtalk/templates

<a id="get-v1apialimtalktemplates"></a>

- 설명: 사용 가능한 알림톡 템플릿 목록을 조회한다.
- 요청 파라미터: 없음
- 사용 예제:

```bash
curl "http://localhost:3000/v1/alimtalk/templates"
```

- 응답 예제:

`200 OK`

```json
{
    "ok": true,
    "templates": [
        {
            "code": "ORDER_001",
            "name": "주문 접수 알림",
            "variables": ["고객명", "주문번호", "결제금액"]
        }
    ],
    "count": 1
}
```

`503 Service Unavailable`

```json
{
    "ok": false,
    "message": "Alimtalk service not available"
}
```

### POST /v1/alimtalk/webhook/:provider

<a id="post-v1apialimtalkwebhookprovider"></a>

- 설명: 알림톡 공급사에서 전달한 상태 변경 이벤트를 수신한다.
- 요청 파라미터:

| 위치 | 필드         | 타입          | 필수 | 설명                      |
| ---- | ------------ | ------------- | ---- | ------------------------- |
| Path | `provider`   | string        | ✅   | 웹훅 발신 공급사 식별자   |
| Body | `(raw json)` | object/string |      | 공급사 웹훅 페이로드 원문 |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/alimtalk/webhook/provider-a" \
	-H "Content-Type: application/json" \
	-d '{"messageId":"msg-001","status":"DELIVERED"}'
```

- 응답 예제:

`200 OK` (정상 처리/내부 오류 모두 재시도 방지 목적)

```text
OK
```

`400 Bad Request` (`provider` 누락)

```text
provider required
```

## 관련 문서

- [Account Routes](./account-routes.md)
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
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
