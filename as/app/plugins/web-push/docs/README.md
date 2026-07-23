# Web Push Plugin

브라우저 Web Push 구독을 저장하고 VAPID 기반 push 발송을 지원합니다.

## Routes

| Method | Path                            | Description                           |
| ------ | ------------------------------- | ------------------------------------- |
| GET    | `/v1/web-push/vapid-public-key` | VAPID public key 조회                 |
| POST   | `/v1/web-push/subscriptions`    | 현재 계정의 PushSubscription 저장     |
| DELETE | `/v1/web-push/subscriptions`    | 현재 계정의 PushSubscription 비활성화 |

## Env

```dotenv
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_VAPID_SUBJECT=mailto:admin@example.com
```

서버 발송 로직에서는 `sendWebPushToCurrentLicense()`를 import 해서 현재 요청 license의 활성 구독자에게 전송할 수 있습니다.
