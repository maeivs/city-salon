# Push Routes

기준 파일: `src/app/plugins/push/`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [Push Guide](../plugins/push.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                   | 인증 | 설명                    |
| ------ | ------------------------------------------------------ | ---- | ----------------------- |
| POST   | [/v1/push/device](#post-v1apipushdevice)           | JWT  | 디바이스 토큰 등록/갱신 |
| DELETE | [/v1/push/device/:seq](#delete-v1apipushdeviceseq) | JWT  | 디바이스 비활성화       |
| POST   | [/v1/push/send](#post-v1apipushsend)               | —    | 단일 계정 발송          |
| POST   | [/v1/push/broadcast](#post-v1apipushbroadcast)     | —    | 다중 계정 브로드캐스트  |
| GET    | [/v1/push/status/:seq](#get-v1apipushstatusseq)    | —    | 발송 상태 조회 안내     |

## 라우트 상세

### POST /v1/push/device

<a id="post-v1apipushdevice"></a>

- 설명: 클라이언트 FCM/APNs 토큰을 등록하거나 갱신한다. `device_id` 기준 upsert.
- **인증 필요** (JWT Bearer)
- 요청 파라미터:

| 위치 | 필드              | 타입   | 필수 | 설명                                            |
| ---- | ----------------- | ------ | ---- | ----------------------------------------------- |
| Body | `device_id`       | string | ✅   | 디바이스 고유 ID (클라이언트 생성 UUID)         |
| Body | `push_token`      | string | ✅   | FCM Registration Token 또는 APNs Device Token   |
| Body | `platform`        | string |      | `android` `ios` `web` `windows` `macos` `linux` |
| Body | `device_type`     | string |      | `mobile` `tablet` `desktop` 등                  |
| Body | `browser`         | string |      | 브라우저명 (web 플랫폼)                         |
| Body | `browser_version` | string |      | 브라우저 버전                                   |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/push/device" \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "unique-device-uuid",
    "push_token": "FCM-or-APNs-token...",
    "platform": "android",
    "device_type": "mobile"
  }'
```

- 응답 예제:

`200 OK`

```json
{ "ok": true, "data": { "seq": 12 } }
```

---

### DELETE /v1/push/device/:seq

<a id="delete-v1apipushdeviceseq"></a>

- 설명: `account_device.push_enabled = false`로 설정한다. 로그아웃 시 호출.
- **인증 필요** (JWT Bearer)
- 사용 예제:

```bash
curl -X DELETE "http://localhost:3000/v1/push/device/12" \
  -H "Authorization: Bearer {access_token}"
```

- 응답 예제:

`200 OK`

```json
{ "ok": true }
```

---

### POST /v1/push/send

<a id="post-v1apipushsend"></a>

- 설명: 특정 계정의 모든 활성 디바이스에 Push를 발송한다.
- 요청 파라미터:

| 위치 | 필드          | 타입   | 필수 | 설명                                   |
| ---- | ------------- | ------ | ---- | -------------------------------------- |
| Body | `account_seq` | int    | ✅   | 수신자 account seq                     |
| Body | `title`       | string | ✅   | 알림 제목                              |
| Body | `body`        | string | ✅   | 알림 본문                              |
| Body | `data`        | object |      | 커스텀 key-value 페이로드 (string map) |
| Body | `ref_entity`  | string |      | 참조 엔티티명                          |
| Body | `ref_seq`     | int    |      | 참조 레코드 seq                        |
| Body | `provider`    | string |      | 프로바이더 지정 (없으면 `default`)     |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/push/send" \
  -H "Content-Type: application/json" \
  -d '{
    "account_seq": 1,
    "title": "새로운 결재 요청",
    "body": "결재 요청이 도착했습니다",
    "data": { "type": "approval", "seq": "42" },
    "ref_entity": "approval",
    "ref_seq": 42
  }'
```

- 응답 예제:

`200 OK`

```json
{ "ok": true, "data": { "message": "Push notification queued for delivery" } }
```

---

### POST /v1/push/broadcast

<a id="post-v1apipushbroadcast"></a>

- 설명: 여러 계정의 모든 활성 디바이스에 Push를 일괄 발송한다.
- 요청 파라미터:

| 위치 | 필드           | 타입   | 필수 | 설명                                     |
| ---- | -------------- | ------ | ---- | ---------------------------------------- |
| Body | `account_seqs` | int[]  | ✅   | 수신자 account seq 배열 (비어있으면 400) |
| Body | `title`        | string | ✅   | 알림 제목                                |
| Body | `body`         | string | ✅   | 알림 본문                                |
| Body | `data`         | object |      | 커스텀 key-value 페이로드                |
| Body | `ref_entity`   | string |      | 참조 엔티티명                            |
| Body | `provider`     | string |      | 프로바이더 지정                          |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/push/broadcast" \
  -H "Content-Type: application/json" \
  -d '{
    "account_seqs": [1, 2, 3],
    "title": "시스템 점검 안내",
    "body": "오늘 오후 11시~12시 서비스 점검이 있습니다"
  }'
```

- 응답 예제:

`200 OK`

```json
{
    "ok": true,
    "data": {
        "message": "Push notifications queued for 3 accounts",
        "queued": 3
    }
}
```

---

### GET /v1/push/status/:seq

<a id="get-v1apipushstatusseq"></a>

- 설명: 발송 상태는 엔티티 API로 직접 조회한다.
- 사용 예제:

```bash
# push_log 단건 조회
curl "http://localhost:3000/v1/entity/push_log/get/{seq}"

# 특정 계정의 발송 이력
curl -X POST "http://localhost:3000/v1/entity/push_log/list" \
  -d '{ "conditions": { "account_seq": 1 }, "order_by": "seq desc", "limit": 20 }'
```

---

## 관련 문서

- [Push Guide](../plugins/push.md) — 설정·운영 가이드
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
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [← 전체 목록](./README.md)
