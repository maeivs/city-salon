# SMTP Routes

기준 파일: `src/app/plugins/smtp/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [SMTP Guide](../plugins/smtp.md) 문서를 참고하세요.

## 라우트 우선순위 안내

`/v1/smtp/*` 경로는 기본적으로 Go 서버로 패스스루됩니다.  
단, 이 플러그인에 등록된 아래 라우트는 **앱 서버가 먼저 처리**하며 Go 서버로는 전달되지 않습니다.  
앱 서버에서 로컬 템플릿을 렌더링한 뒤 완성된 HTML을 Go 서버 내부 API(`/v1/smtp/send`)로 전달합니다.

## 라우트 목록

| Method | Path                                                | 설명                            |
| ------ | --------------------------------------------------- | ------------------------------- |
| POST   | [/v1/smtp/send](#post-v1apismtpsend)            | 로컬 템플릿 렌더링 후 메일 발송 |
| GET    | [/v1/smtp/status/:seq](#get-v1apismtpstatusseq) | 발송 상태 조회                  |

## 라우트 상세

### POST /v1/smtp/send

<a id="post-v1apismtpsend"></a>

- 설명: 이메일을 발송한다. `templateName`이 지정되면 `plugins/smtp/templates/*.html`을 렌더링하여 `body_html`로 완성 후 Go 서버에 전달한다. `templateName` 없이 `body_html`/`body_text`만 지정하면 그대로 전달한다.
- 요청 파라미터:

| 위치 | 필드           | 타입     | 필수 | 설명                                                |
| ---- | -------------- | -------- | ---- | --------------------------------------------------- |
| Body | `to`           | string[] | ✅   | 수신자 이메일 (1개 이상)                            |
| Body | `subject`      | string   |      | 제목                                                |
| Body | `templateName` | string   |      | 로컬 템플릿명 (확장자 제외, 예: `"password_reset"`) |
| Body | `templateDir`  | string   |      | 템플릿 디렉토리 절대경로 (미지정 시 기본값 사용)    |
| Body | `templateData` | object   |      | 템플릿 변수 맵                                      |
| Body | `bodyHtml`     | string   |      | 직접 HTML 본문 (`templateName` 대신 사용)           |
| Body | `bodyText`     | string   |      | 텍스트 본문                                         |
| Body | `cc`           | string[] |      | 참조                                                |
| Body | `bcc`          | string[] |      | 숨은 참조                                           |
| Body | `from`         | string   |      | 발신자                                              |
| Body | `replyTo`      | string   |      | Reply-To                                            |
| Body | `refEntity`    | string   |      | 참조 엔티티명                                       |
| Body | `refSeq`       | number   |      | 참조 엔티티 seq                                     |

- 사용 예제 (로컬 템플릿 사용):

```bash
curl -X POST "http://localhost:3000/v1/smtp/send" \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["user@example.com"],
    "subject": "비밀번호 재설정",
    "templateName": "password_reset",
    "templateData": { "reset_link": "https://example.com/reset?token=abc123" }
  }'
```

- 사용 예제 (직접 HTML):

```bash
curl -X POST "http://localhost:3000/v1/smtp/send" \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["user@example.com"],
    "subject": "안내 메일",
    "bodyHtml": "<p>안녕하세요.</p>"
  }'
```

- 응답 예제:

`200 OK`

```json
{
    "success": true,
    "data": { "seq": 42 }
}
```

`400 Bad Request` (`to` 누락)

```json
{
    "success": false,
    "error": "to is required"
}
```

↑ [목록으로 이동](#라우트-목록)

---

### GET /v1/smtp/status/:seq

<a id="get-v1apismtpstatusseq"></a>

- 설명: 이메일 발송 요청 건의 상태를 Go 서버에 조회한다.
- 요청 파라미터:

| 위치 | 필드  | 타입   | 필수 | 설명             |
| ---- | ----- | ------ | ---- | ---------------- |
| Path | `seq` | number | ✅   | 발송 로그 시퀀스 |

- 사용 예제:

```bash
curl "http://localhost:3000/v1/smtp/status/42"
```

- 응답 예제:

`200 OK`

```json
{
    "success": true,
    "data": {
        "ok": true,
        "status": "sent"
    }
}
```

`400 Bad Request` (잘못된 seq)

```json
{
    "success": false,
    "error": "Invalid seq"
}
```

↑ [목록으로 이동](#라우트-목록)

---

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
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [Push Routes](./push-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [← 전체 목록](./README.md)
