# SMS 가이드

SMS/LMS/MMS 문자 발송 및 본인인증(인증번호) 기능에 대한 설정·운영 가이드입니다.

이 문서는 플러그인의 개요/설정/운영 가이드를 중심으로 다룹니다.  
실제 라우트표, 호출 예제, 응답 예제는 [SMS Routes](../routes/sms-routes.md) 문서를 참고하세요.

---

## 목차

- [개요](#개요)
- [프로바이더 비교](#프로바이더-비교)
- [설정](#설정)
- [발송 흐름](#발송-흐름)
- [인증번호(본인인증)](#인증번호본인인증)
- [엔티티 구조](#엔티티-구조)
- [운영 팁](#운영-팁)

---

## 개요

SMS 플러그인은 **DB 큐 패턴**으로 문자를 발송합니다. 클라이언트가 발송 요청을 하면
`sms_log` 엔티티에 `pending` 상태로 저장 → 디스패치 루프가 주기적으로 조회 → 프로바이더 API 호출 → 결과에 따라 `sent`/`failed` 갱신.

| 메시지 타입 | 설명                           |
| ----------- | ------------------------------ |
| SMS         | 80byte 이하 단문               |
| LMS         | 80byte 초과 장문 (2,000byte)   |
| MMS         | 이미지 첨부 멀티미디어 (300KB) |

`auto_lms: true`(기본) 설정 시, 본문 바이트 수에 따라 자동으로 SMS/LMS 판정합니다.

---

## 프로바이더 비교

| 항목      | **aligo**         | **solapi**            | **ppurio**             | **nhn_cloud**        | **aws_sns**          |
| --------- | ----------------- | --------------------- | ---------------------- | -------------------- | -------------------- |
| 홈페이지  | aligo.in          | solapi.com            | ppurio.com             | nhncloud.com         | aws.amazon.com/sns   |
| SMS 단가  | ~9원              | ~10원                 | ~10원                  | ~9원                 | 종량(건당 ~$0.00645) |
| 인증 방식 | API Key + User ID | API Key + HMAC-SHA256 | Account + Bearer Token | App Key + Secret Key | AWS Sig V4           |
| LMS/MMS   | ✅                | ✅                    | ✅                     | ✅                   | ❌ (SMS만 지원)      |
| 해외 발송 | ✅                | ✅                    | ✅                     | ✅                   | ✅ (글로벌)          |

---

## 설정

플러그인 디렉토리에 위치한 `config.json`:

```json
{
    "enabled": true,
    "default": "aligo",
    "sender": "${SMS_SENDER}",
    "workers": 2,
    "queue_size": 200,
    "dispatch_interval_sec": 5,
    "max_retries": 3,
    "auto_lms": true,
    "lms_threshold_bytes": 80,
    "providers": {
        "aligo": {
            "driver": "aligo",
            "api_key": "${ALIGO_API_KEY}",
            "user_id": "${ALIGO_USER_ID}",
            "sender": "${SMS_SENDER}"
        }
    },
    "verification": {
        "code_length": 6,
        "ttl_sec": 180,
        "max_attempts": 5,
        "cooldown_sec": 60
    }
}
```

### 주요 설정 항목

| 항목                    | 기본값 | 설명                             |
| ----------------------- | ------ | -------------------------------- |
| `enabled`               | `true` | 기능 활성화 여부                 |
| `default`               | —      | 기본 프로바이더 이름 (key, 필수) |
| `sender`                | —      | 글로벌 발신번호                  |
| `workers`               | `2`    | 동시 발송 워커 수                |
| `queue_size`            | `200`  | dispatch당 최대 claim 수         |
| `dispatch_interval_sec` | `5`    | 디스패처 폴링 주기(초)           |
| `max_retries`           | `3`    | 최대 재시도 횟수                 |
| `auto_lms`              | `true` | 자동 LMS 판정 활성화             |
| `lms_threshold_bytes`   | `80`   | LMS 전환 바이트 임계값           |

### 인증번호 설정

| 항목           | 기본값 | 설명                  |
| -------------- | ------ | --------------------- |
| `code_length`  | `6`    | 인증번호 자릿수       |
| `ttl_sec`      | `180`  | 인증번호 유효시간(초) |
| `max_attempts` | `5`    | 최대 인증 시도 횟수   |
| `cooldown_sec` | `60`   | 재발송 대기시간(초)   |

### 드라이버별 필수 필드

| Driver      | 필수 필드                            |
| ----------- | ------------------------------------ |
| `aligo`     | `api_key`, `user_id`                 |
| `solapi`    | `api_key`, `api_secret`              |
| `ppurio`    | `account`, `api_key`                 |
| `nhn_cloud` | `app_key`, `secret_key`              |
| `aws_sns`   | `region`, `access_key`, `secret_key` |

### 환경변수 치환

설정 파일에서 `${VAR}` 패턴은 `process.env.VAR` 값으로 자동 치환됩니다.

---

## 발송 흐름

```
클라이언트 → POST /v1/sms/send
                ↓
         sms_log(pending) DB 저장
                ↓
         dispatch loop (N초 주기)
                ↓
         pending 조회 → processing 갱신
                ↓
         프로바이더 API 호출 (N workers 병렬)
                ↓
         sent / failed 상태 갱신
```

1. **enqueue**: `handleSend` → `SmsService.enqueueJob()` → `sms_log` 엔티티에 `pending` 저장
2. **dispatch**: `setInterval`로 주기적 실행 → `claimPendingSmsLogs()` (pending → processing)
3. **process**: 워커가 프로바이더 `send()` 호출 → 결과에 따라 `finalize()`
4. **finalize**: `sent` 또는 `failed` 갱신 + 참조 `sms_msg` 상태 연동
5. **stale recovery**: 서버 시작 시 `processing` 상태 로그를 `pending`으로 복구 (max_retries 초과 시 `failed`)

---

## 인증번호(본인인증)

SMS 본인인증은 `verification` 설정이 존재할 때 활성화됩니다.

### 흐름

1. `POST /v1/sms/verification/send` → 이전 pending 만료 → 코드 생성 → SHA-256 해시 저장 → SMS 발송
2. `POST /v1/sms/verification/verify` → pending 조회 → 만료/시도횟수 확인 → constant-time 비교

### 보안

- 인증번호는 **SHA-256 해시**로만 저장 (평문 미저장)
- 검증 시 **constant-time comparison** (`timingSafeEqual`) 사용
- 코드 생성은 `crypto.randomInt()` (암호학적 난수)
- 불일치 시에만 시도 횟수 증가 (timing attack 방지)

---

## 엔티티 구조

### sms_log

| 필드              | 타입     | 설명                           |
| ----------------- | -------- | ------------------------------ |
| `seq`             | integer  | PK                             |
| `status`          | string   | pending/processing/sent/failed |
| `provider`        | string   | 프로바이더 driver              |
| `sender`          | string   | 발신번호                       |
| `receiver`        | string   | 수신번호                       |
| `content`         | text     | 본문                           |
| `subject`         | string   | 제목 (LMS/MMS)                 |
| `msg_type`        | string   | sms/lms/mms                    |
| `image_url`       | string   | MMS 이미지 URL                 |
| `provider_msg_id` | string   | 프로바이더 메시지 ID           |
| `error_message`   | text     | 실패 사유                      |
| `retry_count`     | integer  | 재시도 횟수                    |
| `sent_at`         | datetime | 발송 완료 시각                 |

### sms_verification

| 필드         | 타입     | 설명                     |
| ------------ | -------- | ------------------------ |
| `seq`        | integer  | PK                       |
| `phone`      | string   | 전화번호                 |
| `purpose`    | string   | 용도 (signup, reset 등)  |
| `status`     | string   | pending/verified/expired |
| `code_hash`  | string   | SHA-256 해시             |
| `expires_at` | datetime | 만료 시각                |
| `attempts`   | integer  | 시도 횟수                |

---

## 운영 팁

### 발신번호 사전등록

국내 SMS 서비스는 **발신번호 사전등록**이 필수입니다. 아래 각 프로바이더 콘솔에서 등록 후 `sender` 필드에 설정하세요.

| 프로바이더 | 발신번호 등록 페이지                                              |
| ---------- | ----------------------------------------------------------------- |
| aligo      | https://smartsms.aligo.in/admin/sendnumber/sendnumber_manage.html |
| solapi     | https://console.solapi.com/credentials                            |
| ppurio     | https://www.ppurio.com/mypage/callbackList                        |
| nhn_cloud  | https://console.nhncloud.com/SMS                                  |
| aws_sns    | AWS Console → Amazon SNS → Origination numbers                    |

### 프로바이더 fallback

`providers` 객체에 여러 프로바이더를 등록하고, 발송 시 `provider` 필드로 교체 가능합니다. 기본은 `default` 프로바이더가 사용됩니다.

### 모니터링

- `sms_log` 엔티티에서 `status=failed` 필터로 실패 건 확인
- 로그에서 `SMS:` 접두사로 필터링
- stale recovery 로그: `SMS: reset N stale processing logs`

### Graceful Shutdown

서비스 종료 시 진행 중인 dispatch 작업이 완료될 때까지 대기합니다.

---

## 관련 문서

- [SMS Routes](../routes/sms-routes.md) — API 라우트 레퍼런스
