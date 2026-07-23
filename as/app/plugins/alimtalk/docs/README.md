# 알림톡 플러그인 (Alimtalk)

카카오 알림톡을 큐 기반으로 발송합니다. 사전 등록된 템플릿 코드를 사용하며, 알리고(Aligo) 프로바이더를 통해 발송합니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [환경변수](#환경변수)
- [API](#api)
- [운영 팁](#운영-팁)

---

## 개요

| 항목       | 내용                                |
| ---------- | ----------------------------------- |
| 발송 방식  | 큐 기반 비동기 발송 (dispatch loop) |
| 프로바이더 | aligo (알리고)                      |
| 템플릿     | 카카오 사전 등록 템플릿 코드 필요   |
| 변수 치환  | `#{변수명}` 패턴                    |

> 알림톡 플러그인은 기본적으로 비활성화(`enabled: false`) 상태입니다. 카카오 비즈니스 채널 및 알리고 계정 설정 후 활성화하세요.

---

## 설정

`config.json`:

```json
{
    "enabled": false,
    "default": "aligo",
    "sender_key": "${ALIMTALK_SENDER_KEY}",
    "workers": 2,
    "dispatch_interval_sec": 5,
    "queue_size": 200,
    "max_retries": 3,
    "providers": {
        "aligo": {
            "driver": "aligo",
            "api_key": "${ALIGO_API_KEY}",
            "user_id": "${ALIGO_USER_ID}",
            "sender_key": "${ALIMTALK_SENDER_KEY}"
        }
    }
}
```

### 설정 항목

| 항목                    | 기본값  | 설명                       |
| ----------------------- | ------- | -------------------------- |
| `enabled`               | `false` | 플러그인 활성화 여부       |
| `default`               | `aligo` | 사용할 프로바이더 키       |
| `sender_key`            | —       | 카카오 채널 발신 프로필 키 |
| `workers`               | `2`     | 병렬 발송 워커 수          |
| `dispatch_interval_sec` | `5`     | 큐 처리 간격(초)           |
| `queue_size`            | `200`   | 최대 메모리 큐 크기        |
| `max_retries`           | `3`     | 실패 시 최대 재시도 횟수   |

---

## 환경변수

```env
ALIMTALK_SENDER_KEY=카카오_채널_발신프로필_키
ALIGO_API_KEY=알리고_API_키
ALIGO_USER_ID=알리고_사용자_아이디
```

### 발신 프로필 키 발급

1. [카카오 비즈니스](https://business.kakao.com) → 채널 등록 및 비즈니스 인증
2. [알리고 알림톡](https://aligo.biz/talk) → 채널 연동 → 발신 프로필 키 발급
3. 카카오 채널 검수 완료 후 `ALIMTALK_SENDER_KEY` 설정

---

## API

기본 경로: `/v1/alimtalk`

| 메서드 | 경로                 | 인증        | 설명                      |
| ------ | -------------------- | ----------- | ------------------------- |
| `POST` | `/send`              | 로그인 필요 | 알림톡 발송 (큐 등록)     |
| `GET`  | `/status/:seq`       |             | 발송 상태 조회            |
| `GET`  | `/templates`         |             | 등록 템플릿 목록          |
| `POST` | `/webhook/:provider` |             | 프로바이더 발송 결과 웹훅 |

### POST /send 요청 바디

```json
{
    "template_code": "TM_WELCOME_01",
    "receiver": "01012345678",
    "variables": {
        "name": "홍길동",
        "order_id": "ORD-2026-001"
    }
}
```

### GET /status/:seq 응답 예시

```json
{
    "ok": true,
    "data": {
        "seq": 1,
        "template_code": "TM_WELCOME_01",
        "receiver": "01012345678",
        "status": "sent",
        "sent_at": "2026-03-22T06:00:00.000Z"
    }
}
```

### 발송 상태 값

| 상태         | 설명                |
| ------------ | ------------------- |
| `pending`    | 큐 대기 중          |
| `processing` | 발송 시도 중        |
| `sent`       | 발송 완료           |
| `failed`     | 최대 재시도 후 실패 |

---

## 운영 팁

- `#{변수명}`과 `variables` JSON의 키가 정확히 일치해야 함
- 카카오 검수 반려 시 본문 수정 후 재신청 필요 (1~3 영업일 소요)
- 알림톡 발송 실패 시 SMS 폴백(fallback) 설정 가능 (알리고 설정 참고)
- 채널 차단 계정에는 발송 불가 → `failed` 상태로 기록됨
- 광고성 내용 포함 시 카카오 검수에서 반려됨 (정보성 메시지만 허용)
