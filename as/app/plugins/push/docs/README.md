# FCM 푸시 알림 플러그인 (Push)

Firebase Cloud Messaging(FCM)을 통한 모바일 앱 푸시 알림 발송 플러그인입니다. 큐 기반 비동기 발송 및 디바이스 토큰 관리를 지원합니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [환경변수](#환경변수)
- [API](#api)
- [운영 팁](#운영-팁)

---

## 개요

| 항목         | 내용                                 |
| ------------ | ------------------------------------ |
| 프로바이더   | FCM (Firebase Cloud Messaging), APNs |
| 발송 방식    | 큐 기반 비동기 발송 (dispatch loop)  |
| 브로드캐스트 | 다중 계정 동시 발송 지원             |
| 토큰 관리    | 만료 토큰 자동 비활성화              |

> 기본 비활성화(`enabled: false`)입니다. Firebase 프로젝트 설정 후 활성화하세요.

---

## 설정

`config.json`:

```json
{
    "enabled": false,
    "default": "main",
    "workers": 2,
    "queue_size": 50,
    "dispatch_interval_sec": 5,
    "max_retries": 3,
    "providers": {
        "main": {
            "driver": "fcm",
            "project_id": "${FCM_PROJECT_ID}",
            "key_file": "${FCM_KEY_FILE}"
        }
    }
}
```

### 설정 항목

| 항목                        | 기본값  | 설명                              |
| --------------------------- | ------- | --------------------------------- |
| `enabled`                   | `false` | 플러그인 활성화                   |
| `default`                   | `main`  | 사용할 프로바이더 키              |
| `workers`                   | `2`     | 병렬 발송 워커 수                 |
| `queue_size`                | `50`    | 최대 메모리 큐 크기               |
| `dispatch_interval_sec`     | `5`     | 큐 처리 간격(초)                  |
| `max_retries`               | `3`     | 실패 시 최대 재시도 횟수          |
| `providers.main.project_id` | —       | Firebase 프로젝트 ID              |
| `providers.main.key_file`   | —       | Firebase 서비스 계정 키 파일 경로 |

---

## 환경변수

```env
FCM_PROJECT_ID=firebase-project-id
FCM_KEY_FILE=/path/to/firebase-service-account.json
```

### Firebase 서비스 계정 키 발급

1. [Firebase 콘솔](https://console.firebase.google.com) → 프로젝트 설정 → 서비스 계정
2. "새 비공개 키 생성" → JSON 다운로드
3. 서버에 파일 저장 후 `FCM_KEY_FILE` 경로 설정

---

## API

기본 경로: `/v1/push`

| 메서드   | 경로           | 인증        | 설명                        |
| -------- | -------------- | ----------- | --------------------------- |
| `POST`   | `/send`        | 로그인 필요 | 단일 계정 푸시 발송         |
| `POST`   | `/broadcast`   | 로그인 필요 | 다중 계정 브로드캐스트 발송 |
| `GET`    | `/status/:seq` |             | 발송 상태 조회              |
| `POST`   | `/device`      | JWT 선택    | 디바이스 토큰 등록/갱신     |
| `DELETE` | `/device/:seq` | JWT 선택    | 디바이스 비활성화           |

### POST /send 요청 바디

```json
{
    "account_seq": 1,
    "title": "새 메시지 도착",
    "body": "홍길동님에게 메시지가 왔습니다.",
    "data": {
        "type": "message",
        "target_seq": 42
    }
}
```

### POST /broadcast 요청 바디

```json
{
    "account_seqs": [1, 2, 3],
    "title": "공지사항",
    "body": "서비스 점검 안내입니다.",
    "data": { "type": "notice" }
}
```

### POST /device 요청 바디

```json
{
    "token": "FCM_디바이스_토큰",
    "platform": "android",
    "app_version": "1.2.0"
}
```

`platform` 값: `android`, `ios`, `web`

### 발송 상태 값

| 상태         | 설명                |
| ------------ | ------------------- |
| `pending`    | 큐 대기 중          |
| `processing` | 발송 시도 중        |
| `sent`       | 발송 완료           |
| `failed`     | 최대 재시도 후 실패 |

---

## 운영 팁

- 만료된 FCM 토큰은 발송 실패 후 자동 비활성화됨 → 클라이언트 앱 업데이트 시 토큰 재등록 필요
- `broadcast` 발송 시 대상 수에 비례하여 처리 시간 증가 — 대량 발송은 배치로 분리 권장
- Firebase 서비스 계정 키 파일은 git에 커밋하지 말고 별도 보안 저장소 관리
- iOS 발송 시 APNs 인증서 설정이 별도 필요 (Firebase 콘솔 → APNs 인증서 업로드)
