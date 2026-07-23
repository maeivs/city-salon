# SMS Routes

기준 파일: `src/app/plugins/sms/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [SMS Guide](../../plugins/sms.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                                | 설명           |
| ------ | ------------------------------------------------------------------- | -------------- |
| POST   | [/v1/sms/send](#post-v1apismssend)                              | SMS 발송       |
| GET    | [/v1/sms/status/:seq](#get-v1apismsstatusseq)                   | 발송 상태 조회 |
| POST   | [/v1/sms/verification/send](#post-v1apismsverificationsend)     | 인증번호 발송  |
| POST   | [/v1/sms/verification/verify](#post-v1apismsverificationverify) | 인증번호 검증  |

## 라우트 상세

### POST /v1/sms/send

<a id="post-v1apismssend"></a>

- 설명: SMS/LMS/MMS 문자를 발송 큐에 등록한다.
- 요청 파라미터:

| 위치 | 필드         | 타입   | 필수 | 설명                               |
| ---- | ------------ | ------ | ---- | ---------------------------------- |
| Body | `receiver`   | string | ✅   | 수신자 전화번호                    |
| Body | `content`    | string | ✅   | 메시지 본문                        |
| Body | `provider`   | string |      | 드라이버명 (비어 있으면 `default`) |
| Body | `sender`     | string |      | 발신번호 (비어 있으면 설정값 사용) |
| Body | `subject`    | string |      | 제목 (LMS/MMS 전용)                |
| Body | `image_url`  | string |      | 이미지 URL (MMS 전용)              |
| Body | `ref_entity` | string |      | 참조 엔티티명                      |
| Body | `ref_seq`    | number |      | 참조 엔티티 seq                    |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/sms/send" \
  -H "Content-Type: application/json" \
  -d '{"receiver":"01012345678","content":"안녕하세요. 테스트 메시지입니다."}'
```

- 응답 예제:

`200 OK`

```json
{
    "success": true,
    "data": { "message": "SMS queued for delivery" }
}
```

`400 Bad Request` (`receiver` 또는 `content` 누락)

```json
{
    "success": false,
    "error": "receiver is required"
}
```

`503 Service Unavailable` (서비스 비활성)

```json
{
    "success": false,
    "error": "SMS service not available"
}
```

↑ [목록으로 이동](#라우트-목록)

---

### GET /v1/sms/status/:seq

<a id="get-v1apismsstatusseq"></a>

- 설명: 발송 요청 건의 상태를 조회한다. 엔티티 API 사용을 안내한다.
- 요청 파라미터:

| 위치 | 필드  | 타입   | 필수 | 설명            |
| ---- | ----- | ------ | ---- | --------------- |
| Path | `seq` | string | ✅   | SMS 로그 시퀀스 |

- 사용 예제:

```bash
curl "http://localhost:3000/v1/sms/status/42"
```

- 응답 예제:

`200 OK`

```json
{
    "success": true,
    "data": {
        "message": "Use entity API: GET /v1/entity/sms_log/{seq} to check SMS delivery status"
    }
}
```

↑ [목록으로 이동](#라우트-목록)

---

### POST /v1/sms/verification/send

<a id="post-v1apismsverificationsend"></a>

- 설명: 인증번호를 생성하여 SMS로 발송한다.
- 요청 파라미터:

| 위치 | 필드      | 타입   | 필수 | 설명                    |
| ---- | --------- | ------ | ---- | ----------------------- |
| Body | `phone`   | string | ✅   | 수신 전화번호           |
| Body | `purpose` | string |      | 용도 (기본: `"signup"`) |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/sms/verification/send" \
  -H "Content-Type: application/json" \
  -d '{"phone":"01012345678","purpose":"signup"}'
```

- 응답 예제:

`200 OK`

```json
{
    "success": true,
    "data": { "expires_in": 180 }
}
```

`400 Bad Request` (`phone` 누락)

```json
{
    "success": false,
    "error": "phone is required"
}
```

`503 Service Unavailable` (인증번호 서비스 비활성)

```json
{
    "success": false,
    "error": "SMS verification service not available"
}
```

↑ [목록으로 이동](#라우트-목록)

---

### POST /v1/sms/verification/verify

<a id="post-v1apismsverificationverify"></a>

- 설명: 발송된 인증번호를 검증한다.
- 요청 파라미터:

| 위치 | 필드      | 타입   | 필수 | 설명                    |
| ---- | --------- | ------ | ---- | ----------------------- |
| Body | `phone`   | string | ✅   | 전화번호                |
| Body | `code`    | string | ✅   | 인증번호                |
| Body | `purpose` | string |      | 용도 (기본: `"signup"`) |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/sms/verification/verify" \
  -H "Content-Type: application/json" \
  -d '{"phone":"01012345678","code":"482901","purpose":"signup"}'
```

- 응답 예제:

`200 OK` (검증 성공)

```json
{
    "success": true,
    "data": { "verified": true }
}
```

`401 Unauthorized` (인증번호 불일치)

```json
{
    "success": false,
    "error": "invalid verification code"
}
```

`400 Bad Request` (만료 또는 최대 시도 초과)

```json
{
    "success": false,
    "error": "code expired"
}
```

```json
{
    "success": false,
    "error": "max attempts exceeded"
}
```

↑ [목록으로 이동](#라우트-목록)

---

## 관련 문서

- [SMS Guide](../../plugins/sms.md) — 설정·운영 가이드
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
- [SMTP Routes](./smtp-routes.md)
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
