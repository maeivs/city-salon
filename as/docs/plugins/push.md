# Push 알림 플러그인

앱서버에 내장된 Push 플러그인으로 FCM (Firebase Cloud Messaging) 및 APNs (Apple Push Notification) 발송을 처리합니다.

> **관련**: [전체 라우트 목록](../routes/README.md) · [흐름도](../flows.md)

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [Firebase 키 준비](#firebase-키-준비)
- [APNs 키 준비](#apns-키-준비)
- [엔티티 구조](#엔티티-구조)

---

## 개요

```
POST /v1/push/send
        │
        ▼
account_device 조회 (push_enabled=true, push_token 있는 것만)
        │
        ▼ (디바이스별)
push_log(status=pending) DB 저장
        │
        ▼ (dispatch_interval_sec 간격 loop)
push_log → processing (claim)
        │
      platform?
     /        \
  apns        fcm
    │           │
APNs HTTP/2  FCM HTTP v1
    │           │
    └─── push_log → sent / failed
         (토큰 만료 시 account_device.push_enabled = false 자동 처리)
```

- **비동기 처리**: `enqueueJob`은 큐에 넣기만 하고 즉시 반환 — API 응답 지연 없음
- **워커 풀**: `workers` 수만큼 고루틴(고루틴 대신 Promise.all)이 병렬 발송
- **Stale 복구**: 서버 시작 시 `processing` 상태로 남은 로그를 `pending`으로 복구

---

## 설정

`app/plugins/push/config.json`:

```json
{
    "enabled": true,
    "default": "main",
    "workers": 2,
    "queue_size": 50,
    "dispatch_interval_sec": 5,
    "max_retries": 3,
    "providers": {
        "main": {
            "driver": "fcm",
            "project_id": "my-firebase-project-id",
            "key_file": "configs/keys/fcm-service-account.json"
        },
        "ios": {
            "driver": "apns",
            "key_id": "XXXXXXXXXX",
            "team_id": "XXXXXXXXXX",
            "bundle_id": "com.example.app",
            "key_file": "configs/keys/apns-authkey.p8",
            "production": false
        }
    }
}
```

### 최상위 설정 필드

| 필드                    | 기본값  | 설명                         |
| ----------------------- | ------- | ---------------------------- |
| `enabled`               | `false` | 플러그인 활성화              |
| `default`               | —       | 기본 프로바이더 이름         |
| `workers`               | `2`     | 동시 발송 워커 수            |
| `queue_size`            | `50`    | dispatch당 한 번에 처리할 수 |
| `dispatch_interval_sec` | `5`     | 큐 폴링 주기 (초)            |
| `max_retries`           | `3`     | 발송 실패 최대 재시도 횟수   |

### FCM 프로바이더 필드

| 필드         | 설명                       |
| ------------ | -------------------------- |
| `driver`     | `"fcm"` 고정               |
| `project_id` | Firebase 프로젝트 ID       |
| `key_file`   | 서비스 계정 JSON 파일 경로 |

### APNs 프로바이더 필드

| 필드         | 설명                                                      |
| ------------ | --------------------------------------------------------- |
| `driver`     | `"apns"` 고정                                             |
| `key_id`     | `.p8` 키 파일 ID (`AuthKey_XXXXX.p8` → `XXXXX`)           |
| `team_id`    | Apple Developer 팀 ID                                     |
| `bundle_id`  | 앱 번들 ID (예: `com.example.app`)                        |
| `key_file`   | `.p8` 키 파일 경로                                        |
| `production` | `true` = 프로덕션 APNs, `false` = 샌드박스 (기본 `false`) |

> Android는 `main (fcm)` 프로바이더를, iOS는 `ios (apns)` 프로바이더를 사용합니다.
> `provider` 필드를 지정하지 않으면 `default` 프로바이더로 발송됩니다.

---

## Firebase 키 준비

1. [Firebase Console](https://console.firebase.google.com/) → 프로젝트 설정
2. **서비스 계정 → 새 비공개 키 생성** → JSON 파일 다운로드
3. 다운로드한 JSON 파일을 `configs/keys/fcm-service-account.json`으로 저장
4. `config.json`의 `providers.main.project_id`와 `key_file` 경로 설정

---

## APNs 키 준비

1. [Apple Developer Console](https://developer.apple.com/) → Certificates, Identifiers & Profiles → **Keys**
2. **"+" 버튼** → "Apple Push Notifications service (APNs)" 체크 → 생성
3. `.p8` 파일 다운로드 (`AuthKey_XXXXX.p8`) — **한 번만 다운로드 가능**
4. `configs/keys/apns-authkey.p8`으로 저장
5. `config.json`의 `providers.ios` 필드 설정:
    - `key_id`: 파일명의 ID 부분 (`AuthKey_ABCDE12345.p8` → `ABCDE12345`)
    - `team_id`: Apple Developer 계정 상단에 표시되는 팀 ID
    - `bundle_id`: 앱 번들 ID

---

## API 레퍼런스

> API 요청/응답/예제는 [Push Routes](../routes/push-routes.md) 문서를 참고하세요.

---

## 엔티티 구조

### account_device

디바이스 등록 및 FCM/APNs 토큰 관리 엔티티.

| 필드              | 타입   | 설명                                              |
| ----------------- | ------ | ------------------------------------------------- |
| `account_seq`     | int    | 연결된 계정 seq                                   |
| `device_id`       | string | 디바이스 고유 ID (upsert 키)                      |
| `push_token`      | string | FCM Registration Token 또는 APNs Device Token     |
| `push_enabled`    | bool   | 푸시 수신 활성화 여부 (토큰 만료 시 자동 `false`) |
| `platform`        | enum   | `android` `ios` `web` `windows` `macos` `linux`   |
| `device_type`     | string | `mobile` `tablet` `desktop` 등                    |
| `browser`         | string | 브라우저명 (web 플랫폼)                           |
| `browser_version` | string | 브라우저 버전                                     |

> `push_enabled=true`이고 `push_token`이 있는 디바이스에만 발송합니다.

### push_log

발송 이력 추적 엔티티.

| 필드            | 타입   | 설명                                   |
| --------------- | ------ | -------------------------------------- |
| `status`        | enum   | `pending` `processing` `sent` `failed` |
| `account_seq`   | int    | 수신자 계정 seq                        |
| `device_seq`    | int    | 대상 디바이스 seq                      |
| `platform`      | string | 발송 플랫폼                            |
| `device_token`  | string | 발송 당시 토큰 값                      |
| `title`         | string | 알림 제목                              |
| `body`          | string | 알림 본문                              |
| `provider`      | string | 사용된 프로바이더 이름                 |
| `retry_count`   | int    | 재시도 횟수                            |
| `error_message` | string | 실패 시 오류 메시지                    |
| `ref_entity`    | string | 참조 엔티티명                          |
| `sent_at`       | string | 발송 완료 시각                         |
