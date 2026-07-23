# SMS 플러그인

알리고(Aligo) 등 외부 프로바이더를 통해 SMS/LMS/MMS를 발송합니다.  
메시지 길이에 따라 자동으로 LMS/MMS로 전환하고, 발송 큐·레이트 리밋·인증번호 기능을 제공합니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [API](#api)
- [프로바이더](#프로바이더)
- [인증번호 기능](#인증번호-기능)
- [레이트 리밋](#레이트-리밋)
- [Entity 테이블](#entity-테이블)

---

## 개요

| 항목            | 내용                                  |
| --------------- | ------------------------------------- |
| 기본 경로       | `/v1/sms`                         |
| 설정 파일       | `config.json`                         |
| 기본 프로바이더 | `aligo`                               |
| 활성화 기본값   | `false` (명시적으로 `true` 설정 필요) |

### 메시지 타입 자동 전환

| 타입 | 조건                                            |
| ---- | ----------------------------------------------- |
| SMS  | 본문 ≤ 80바이트                                 |
| LMS  | 본문 > 80바이트 (`auto_lms: true` 시 자동 전환) |
| MMS  | `image_url`이 지정된 경우                       |

---

## 설정

설정 파일: `src/app/plugins/sms/config.json`

### 기본 설정

| 키                      | 기본값                 | 설명                           |
| ----------------------- | ---------------------- | ------------------------------ |
| `enabled`               | `false`                | 플러그인 활성화 여부           |
| `default`               | `"aligo"`              | 기본 사용 프로바이더           |
| `sender`                | `${SMS_SENDER_NUMBER}` | 발신번호                       |
| `workers`               | `2`                    | 발송 워커 수                   |
| `queue_size`            | `200`                  | 큐 최대 크기                   |
| `dispatch_interval_sec` | `5`                    | 큐 처리 간격 (초)              |
| `max_retries`           | `3`                    | 최대 재시도 횟수               |
| `auto_lms`              | `true`                 | 80바이트 초과 시 자동 LMS 전환 |
| `lms_threshold_bytes`   | `80`                   | LMS 전환 기준 (바이트)         |

### 환경변수

| 환경변수            | 설명                   | 예시            |
| ------------------- | ---------------------- | --------------- |
| `ALIGO_API_KEY`     | 알리고 API 키          | `"abc123..."`   |
| `ALIGO_USER_ID`     | 알리고 사용자 ID       | `"mycompany"`   |
| `SMS_SENDER_NUMBER` | 발신번호 (등록된 번호) | `"01012345678"` |

---

## API

기본 경로: `/v1/sms`

| 메서드 | 경로                                               | 인증 | 설명                |
| ------ | -------------------------------------------------- | ---- | ------------------- |
| `POST` | [`/send`](#post-send)                              |      | SMS/LMS/MMS 발송    |
| `GET`  | [`/status/:seq`](#get-status-seq)                  |      | 발송 기록 조회 안내 |
| `POST` | [`/verification/send`](#post-verificationsend)     |      | 인증번호 발송       |
| `POST` | [`/verification/verify`](#post-verificationverify) |      | 인증번호 검증       |

---

### POST /send

SMS, LMS, MMS 발송 요청을 큐에 등록합니다.

**요청 Body**

| 필드         | 타입   | 필수 | 설명                              |
| ------------ | ------ | ---- | --------------------------------- |
| `receiver`   | string | ✅   | 수신번호 (`01012345678`)          |
| `content`    | string | ✅   | 메시지 본문                       |
| `subject`    | string |      | LMS/MMS 제목                      |
| `image_url`  | string |      | 이미지 URL (MMS 전환)             |
| `sender`     | string |      | 발신번호 (기본: config `sender`)  |
| `provider`   | string |      | 사용 프로바이더 (기본: `default`) |
| `ref_entity` | string |      | 연관 엔티티 이름                  |
| `ref_seq`    | number |      | 연관 엔티티 SEQ                   |

**응답 예시**

```json
{
    "success": true,
    "data": {
        "message": "SMS queued for delivery"
    }
}
```

> 실제 발송 결과는 `sms_log` 엔티티에서 확인합니다.

---

### GET /status/:seq

엔티티 API를 통한 발송 상태 조회를 안내합니다.

> `GET /v1/entity/sms_log/{seq}` 를 직접 사용하세요.

---

### POST /verification/send

인증번호를 생성하여 지정 번호로 SMS 발송합니다.

**요청 Body**

| 필드      | 타입   | 필수 | 설명                         |
| --------- | ------ | ---- | ---------------------------- |
| `phone`   | string | ✅   | 수신 전화번호                |
| `purpose` | string |      | 인증 목적 (기본: `"signup"`) |

**응답 예시**

```json
{
    "success": true,
    "data": {
        "expires_in": 180
    }
}
```

---

### POST /verification/verify

발송된 인증번호를 검증합니다.

**요청 Body**

| 필드      | 타입   | 필수 | 설명                         |
| --------- | ------ | ---- | ---------------------------- |
| `phone`   | string | ✅   | 검증할 전화번호              |
| `code`    | string | ✅   | 인증번호 (6자리)             |
| `purpose` | string |      | 인증 목적 (기본: `"signup"`) |

**응답 예시**

```json
{
    "success": true,
    "data": {
        "verified": true
    }
}
```

**오류 응답**

| 상태  | 설명                              |
| ----- | --------------------------------- |
| `400` | 코드 불일치, 만료, 최대 시도 초과 |
| `503` | SMS 서비스 비활성화               |

---

## 프로바이더

현재 사용 가능한 드라이버:

| 드라이버  | 파일                   | 설명           |
| --------- | ---------------------- | -------------- |
| `aligo`   | `providers/aligo.ts`   | 알리고 SMS API |
| `solapi`  | `providers/solapi.ts`  | 솔라피         |
| `ppurio`  | `providers/ppurio.ts`  | 뿌리오         |
| `nhn`     | `providers/nhn.ts`     | NHN Cloud SMS  |
| `aws-sns` | `providers/aws-sns.ts` | Amazon SNS     |

### 알리고 프로바이더 설정

```json
{
    "providers": {
        "aligo": {
            "driver": "aligo",
            "api_key": "${ALIGO_API_KEY}",
            "user_id": "${ALIGO_USER_ID}",
            "sender": "${SMS_SENDER_NUMBER}"
        }
    }
}
```

---

## 인증번호 기능

| 설정 키        | 기본값 | 설명                  |
| -------------- | ------ | --------------------- |
| `code_length`  | `6`    | 인증번호 자릿수       |
| `ttl_sec`      | `180`  | 유효 시간 (초)        |
| `max_attempts` | `5`    | 최대 검증 시도 횟수   |
| `cooldown_sec` | `60`   | 재발송 대기 시간 (초) |

인증번호는 `sms_verification` 테이블에 저장됩니다.

---

## 레이트 리밋

동일 번호로 과도한 발송을 방지합니다.

| 설정 키                 | 기본값 | 설명                     |
| ----------------------- | ------ | ------------------------ |
| `per_number_per_minute` | `5`    | 동일 번호 분당 최대 발송 |
| `per_minute`            | `60`   | 전체 분당 최대 발송      |
| `per_hour`              | `500`  | 전체 시간당 최대 발송    |

---

## Entity 테이블

| 테이블             | 설명                                      |
| ------------------ | ----------------------------------------- |
| `sms_msg`          | 발송 메시지 원문                          |
| `sms_log`          | 발송 이력 및 결과 (성공/실패/재시도 횟수) |
| `sms_verification` | 인증번호 발송 및 검증 기록                |
