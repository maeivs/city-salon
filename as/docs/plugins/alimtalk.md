# 알림톡(Alimtalk) 가이드

카카오 알림톡 발송 기능에 대한 설정·API·운영 가이드입니다.

이 문서는 플러그인의 개요/설정/운영 가이드를 중심으로 다룹니다.  
실제 라우트표, 호출 예제, 응답 예제는 [Alimtalk Routes](../routes/alimtalk-routes.md) 문서를 참고하세요.

---

## 목차

- [개요](#개요)
- [프로바이더 비교](#프로바이더-비교)
- [설정](#설정)
- [발송 흐름](#발송-흐름)
- [API 레퍼런스](#api-레퍼런스)
- [템플릿 등록](#템플릿-등록)
- [운영 팁](#운영-팁)

---

## 개요

카카오 알림톡은 **사전 검수된 템플릿** 기반으로 정보성 메시지를 발송합니다. 광고성 메시지는 불가하며, 카카오 비즈니스 채널이 필요합니다.

| 항목      | 알림톡          | SMS         |
| --------- | --------------- | ----------- |
| 채널      | 카카오톡        | 일반 문자   |
| 가격      | ~6.5원/건       | ~10원/건    |
| 템플릿    | 사전 검수 필수  | 자유        |
| 수신 조건 | 카카오톡 사용자 | 모든 휴대폰 |

---

## 프로바이더 비교

| 항목        | **aligo**         | **solapi**            | **ppurio**             | **nhn_cloud**        |
| ----------- | ----------------- | --------------------- | ---------------------- | -------------------- |
| 홈페이지    | aligo.in          | solapi.com            | ppurio.com             | nhncloud.com         |
| 알림톡 단가 | 6.5원             | 7원                   | 8원                    | 7.5원                |
| 인증 방식   | API Key + User ID | API Key + HMAC-SHA256 | Account + Bearer Token | App Key + Secret Key |
| SMS 폴백    | ✅                | ✅                    | ✅                     | ✅                   |

---

## 설정

`configs/notification/alimtalk.json`:

```json
{
    "enabled": true,
    "default": "aligo",
    "sender_key": "${ALIMTALK_SENDER_KEY}",
    "workers": 2,
    "dispatch_interval_sec": 5,
    "queue_size": 200,
    "max_retries": 3,
    "_template_file": "templates/notification/alimtalk.json",
    "providers": {
        "aligo": {
            "driver": "aligo",
            "api_key": "${ALIGO_API_KEY}",
            "user_id": "${ALIGO_USER_ID}",
            "sender_key": "${ALIMTALK_SENDER_KEY}"
        },
        "solapi": {
            "driver": "solapi",
            "api_key": "${SOLAPI_API_KEY}",
            "api_secret": "${SOLAPI_API_SECRET}",
            "sender_key": "${ALIMTALK_SENDER_KEY}",
            "pf_id": "${SOLAPI_PF_ID}"
        },
        "bizgo": {
            "driver": "bizgo",
            "biz_id": "${BIZGO_BIZ_ID}",
            "api_key": "${BIZGO_API_KEY}",
            "api_secret": "${BIZGO_API_SECRET}",
            "sender_key": "${ALIMTALK_SENDER_KEY}"
        },
        "nhncloud": {
            "driver": "nhncloud",
            "app_key": "${NHNCLOUD_APP_KEY}",
            "secret_key": "${NHNCLOUD_SECRET_KEY}",
            "sender_key": "${ALIMTALK_SENDER_KEY}"
        }
    }
}
```

### 주요 설정 항목

| 항목                    | 기본값 | 설명                             |
| ----------------------- | ------ | -------------------------------- |
| `enabled`               | `true` | 기능 활성화 여부                 |
| `default`               | -      | 기본 프로바이더 이름 (key, 필수) |
| `sender_key`            | -      | 카카오 발신프로필 키             |
| `workers`               | `2`    | 동시 발송 워커 수                |
| `dispatch_interval_sec` | `5`    | 디스패처 폴링 주기(초)           |
| `max_retries`           | `3`    | 최대 재시도 횟수                 |
| `_template_file`        | -      | 템플릿 정의 JSON 파일 경로       |

### 프로바이더별 드라이버 설정

| driver     | 필수 필드                                       |
| ---------- | ----------------------------------------------- |
| `aligo`    | `api_key`, `user_id`, `sender_key`              |
| `solapi`   | `api_key`, `api_secret`, `pf_id`, `sender_key`  |
| `ppurio`   | `account`, `api_key`, `sender_key`              |
| `bizgo`    | `biz_id`, `api_key`, `api_secret`, `sender_key` |
| `nhncloud` | `app_key`, `secret_key`, `sender_key`           |

### 환경변수 (.env)

```env
ALIMTALK_SENDER_KEY=your-sender-key
ALIGO_API_KEY=your-aligo-api-key
ALIGO_USER_ID=your-aligo-user-id
# SOLAPI_API_KEY=
# SOLAPI_API_SECRET=
# SOLAPI_PF_ID=
```

---

## 발송 흐름

```
POST /v1/alimtalk/send
         │
         ▼
     enqueueJob()
         │
         ▼
alimtalk_log (pending) INSERT
         │
         ▼
디스패처 (dispatch_interval_sec 주기)
         │
     ClaimPendingLogs() [CAS: pending→processing]
         │
         ▼
워커 (workers 수만큼 병렬)
         │
     ├─ 템플릿 캐시에서 #{변수} 바인딩
     ├─ 프로바이더 API 호출
     ├─ 성공 → status: sent, sent_at 기록
     └─ 실패 → status: failed, retry_count 증가
```

---

## API 레퍼런스

이 문서는 기능 소개/설정/운영 기준을 다룹니다.  
라우트별 파라미터 표, 요청/응답 예제, 상태코드는 아래 라우트 문서를 기준으로 확인합니다.

- 상세 API 레퍼런스: [Alimtalk Routes](../routes/alimtalk-routes.md)

기본 경로: `/v1/alimtalk`

| 메서드 | 경로                 | 설명                    |
| ------ | -------------------- | ----------------------- |
| `POST` | `/send`              | 알림톡 발송 요청        |
| `GET`  | `/templates`         | 템플릿 목록 조회        |
| `GET`  | `/status/:seq`       | 발송 상태 조회 (미구현) |
| `POST` | `/webhook/:provider` | 프로바이더 웹훅 수신    |

---

## 템플릿 등록

### templates/notification/alimtalk.json 형식

```json
[
    {
        "templateCode": "ORDER_001",
        "templateName": "주문 접수 알림",
        "variables": ["고객명", "주문번호", "결제금액"]
    }
]
```

> 서버 시작 시 인메모리 캐시에 로드됩니다. 변경 후 재시작 필요.

### 템플릿 작성 규칙

| 규칙      | 설명                          |
| --------- | ----------------------------- |
| 변수 형식 | `#{변수명}`                   |
| 최대 길이 | 1,000자                       |
| 버튼      | 최대 5개                      |
| 내용      | 정보성만 허용, 광고 문구 불가 |

---

## 운영 팁

- 새 템플릿 카카오 검수는 **1~3 영업일** 소요 — 운영 전 충분한 여유 확보
- 알림톡(~6.5원)이 SMS(~10원)보다 저렴 — 가능하면 우선 사용
- `#{변수명}`과 `variables` JSON 키가 **완전히 일치**해야 함
- 카카오 비즈니스 채널 차단 시 모든 발송 중단 → 채널 상태 모니터링 필요

---

## 관련 문서

- [Alimtalk Routes](../routes/alimtalk-routes.md)
- [친구톡 가이드](friendtalk.md)
- [설정 예제](../../configs-example/notification/alimtalk.json)
- [Entity Server 알림톡 가이드](../../../docs/notification/alimtalk-guide.md)
