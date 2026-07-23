# Friendtalk Routes

기준 파일: `src/app/plugins/friendtalk/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [Friendtalk Guide](../../plugins/friendtalk.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                 | 설명        |
| ------ | ---------------------------------------------------- | ----------- |
| POST   | [/v1/friendtalk/send](#post-v1apifriendtalksend) | 친구톡 발송 |

## 라우트 상세

### POST /v1/friendtalk/send

<a id="post-v1apifriendtalksend"></a>

- 설명: 친구톡 메시지를 수신자에게 발송한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/friendtalk/send" \
	-H "Content-Type: application/json" \
	-d '{"to":"01012345678","message":"친구톡 테스트 메시지"}'
```

## 관련 문서

- [Account Routes](./account-routes.md)
- [Alimtalk Routes](./alimtalk-routes.md)
- [Email Verification](./email-verification.md)
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
