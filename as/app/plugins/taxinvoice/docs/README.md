# TaxInvoice 플러그인

바로빌(Barobill) 연동을 통해 전자세금계산서를 등록·발행·취소하며,  
국세청(NTS) 자동 전송과 상태 동기화, 발행 큐 처리를 지원합니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [API](#api)
- [세금계산서 발행 흐름](#세금계산서-발행-흐름)
- [국세청 전송 설정](#국세청-전송-설정)
- [상태 동기화 스케줄](#상태-동기화-스케줄)
- [Entity 테이블](#entity-테이블)

---

## 개요

| 항목            | 내용                                  |
| --------------- | ------------------------------------- |
| 기본 경로       | `/v1/taxinvoice`                  |
| 설정 파일       | `config.json`                         |
| 기본 프로바이더 | `barobill`                            |
| 활성화 기본값   | `false` (명시적으로 `true` 설정 필요) |

---

## 설정

설정 파일: `src/app/plugins/taxinvoice/config.json`

### 기본 설정

| 키                      | 기본값       | 설명                 |
| ----------------------- | ------------ | -------------------- |
| `enabled`               | `false`      | 플러그인 활성화 여부 |
| `default`               | `"barobill"` | 기본 사용 프로바이더 |
| `workers`               | `2`          | 발행 처리 워커 수    |
| `queue_size`            | `100`        | 큐 최대 크기         |
| `dispatch_interval_sec` | `10`         | 큐 처리 간격 (초)    |
| `max_retries`           | `3`          | 최대 재시도 횟수     |

### 환경변수

| 환경변수              | 설명                 |
| --------------------- | -------------------- |
| `TAXINVOICE_CERT_KEY` | 바로빌 공인인증서 키 |
| `TAXINVOICE_CORP_NUM` | 사업자등록번호       |
| `TAXINVOICE_USER_ID`  | 바로빌 사용자 ID     |

### 바로빌 프로바이더 설정

```json
{
    "providers": {
        "barobill": {
            "driver": "barobill",
            "cert_key": "${TAXINVOICE_CERT_KEY}",
            "corp_num": "${TAXINVOICE_CORP_NUM}",
            "user_id": "${TAXINVOICE_USER_ID}",
            "api_endpoint": "https://barobill.co.kr/TAPI/TaxInvoiceService.asmx",
            "timeout_sec": 30
        }
    }
}
```

---

## API

기본 경로: `/v1/taxinvoice`

| 메서드 | 경로                              | 인증        | 설명                         |
| ------ | --------------------------------- | ----------- | ---------------------------- |
| `POST` | [`/`](#post-)                     | 로그인 필요 | 세금계산서 등록 및 즉시 발행 |
| `POST` | [`/register`](#post-register)     | 로그인 필요 | 세금계산서 임시 저장         |
| `POST` | [`/:seq/issue`](#post-seqissue)   | 로그인 필요 | 임시 저장 건 발행            |
| `POST` | [`/:seq/cancel`](#post-seqcancel) | 로그인 필요 | 발행 취소                    |
| `GET`  | [`/:seq/state`](#get-seqstate)    | 로그인 필요 | 발행 상태 조회               |
| `GET`  | [`/:seq`](#get-seq)               | 로그인 필요 | 세금계산서 상세 조회         |

---

### POST /

세금계산서를 등록하고 즉시 발행합니다.

**요청 Body**

세금계산서 전체 항목을 포함한 객체를 전달합니다.

| 필드 그룹       | 설명                                             |
| --------------- | ------------------------------------------------ |
| 공급자 정보     | `supplier_corp_num`, `supplier_name` 등          |
| 공급받는자 정보 | `buyer_corp_num`, `buyer_name`, `buyer_email` 등 |
| 품목 목록       | `items[]` — 품명, 수량, 단가, 공급가액, 세액     |
| 발행 옵션       | `memo`, `send_sms`, `send_email` 등              |

**응답 예시**

```json
{
    "success": true,
    "data": {
        "seq": 301,
        "state": "issued",
        "nts_confirm_num": "20250115-..."
    }
}
```

---

### POST /register

세금계산서를 임시 저장(등록)합니다. 발행은 별도 요청으로 진행합니다.

**응답 예시**

```json
{
    "success": true,
    "data": {
        "seq": 302,
        "state": "registered"
    }
}
```

---

### POST /:seq/issue

임시 저장된 세금계산서를 발행합니다.

**경로 파라미터**

| 파라미터 | 타입   | 설명           |
| -------- | ------ | -------------- |
| `seq`    | number | 세금계산서 SEQ |

**요청 Body (선택)**

| 필드          | 타입    | 설명             |
| ------------- | ------- | ---------------- |
| `force_issue` | boolean | 강제 발행 여부   |
| `memo`        | string  | 발행 메모        |
| `send_sms`    | boolean | SMS 발송 여부    |
| `send_email`  | boolean | 이메일 발송 여부 |

**응답 예시**

```json
{
    "success": true,
    "data": {
        "seq": 302,
        "state": "issued"
    }
}
```

---

### POST /:seq/cancel

발행된 세금계산서를 취소합니다.

**경로 파라미터**

| 파라미터 | 타입   | 설명           |
| -------- | ------ | -------------- |
| `seq`    | number | 세금계산서 SEQ |

**요청 Body (선택)**

| 필드   | 타입   | 설명      |
| ------ | ------ | --------- |
| `memo` | string | 취소 사유 |

**응답 예시**

```json
{
    "success": true,
    "data": {
        "seq": 302,
        "state": "issue_cancelled"
    }
}
```

---

### GET /:seq/state

세금계산서의 현재 발행 상태를 조회합니다.

**경로 파라미터**

| 파라미터 | 타입   | 설명           |
| -------- | ------ | -------------- |
| `seq`    | number | 세금계산서 SEQ |

**상태 코드표**

| 상태              | 설명             |
| ----------------- | ---------------- |
| `registered`      | 임시 저장        |
| `issued`          | 발행 완료        |
| `nts_sent`        | 국세청 전송 완료 |
| `issue_cancelled` | 발행 취소        |
| `send_failed`     | 발행 실패        |

---

### GET /:seq

세금계산서 상세 정보(엔티티 데이터)를 조회합니다.

**경로 파라미터**

| 파라미터 | 타입   | 설명           |
| -------- | ------ | -------------- |
| `seq`    | number | 세금계산서 SEQ |

**응답 예시**

```json
{
    "success": true,
    "data": {
        "seq": 302,
        "state": "issued",
        "supplier_name": "공급사(주)",
        "buyer_name": "공급받는자(주)",
        "supply_amount": 1000000,
        "tax_amount": 100000,
        "total_amount": 1100000,
        "items": [...]
    }
}
```

---

## 세금계산서 발행 흐름

```
POST /register      →  임시 저장 (state: registered)
    │
    ▼
POST /:seq/issue    →  발행 요청 → 바로빌 API 호출
    │                   성공 시 state: issued
    │                   실패 시 큐에서 max_retries까지 재시도
    ▼
국세청 자동 전송     →  auto_send: true 시 issued 직후 NTS 전송
    │                   state: nts_sent
    ▼
POST /:seq/cancel   →  발행 취소 (state: issue_cancelled)
```

또는 `POST /`로 등록+발행을 한 번에 처리할 수 있습니다.

---

## 국세청 전송 설정

```json
{
    "nts": {
        "auto_send": false,
        "taxation_option": 1,
        "taxation_add_tax_allow": 0,
        "tax_exemption_option": 1,
        "tax_exemption_add_tax_allow": 0
    }
}
```

| 키                     | 기본값  | 설명                          |
| ---------------------- | ------- | ----------------------------- |
| `auto_send`            | `false` | 발행 후 국세청 자동 전송 여부 |
| `taxation_option`      | `1`     | 과세 처리 옵션                |
| `tax_exemption_option` | `1`     | 면세 처리 옵션                |

---

## 상태 동기화 스케줄

```json
{
    "sync": {
        "enabled": false,
        "interval_sec": 600,
        "state_sync_interval_min": 10,
        "max_list_days": 200
    }
}
```

| 키                        | 기본값  | 설명                         |
| ------------------------- | ------- | ---------------------------- |
| `enabled`                 | `false` | 자동 상태 동기화 활성화 여부 |
| `interval_sec`            | `600`   | 동기화 주기 (초)             |
| `state_sync_interval_min` | `10`    | 상태 확인 간격 (분)          |
| `max_list_days`           | `200`   | 조회 대상 최대 기간 (일)     |

---

## Entity 테이블

| 테이블              | 설명                                               |
| ------------------- | -------------------------------------------------- |
| `tax_invoice`       | 세금계산서 헤더 정보 (공급자/공급받는자/금액/상태) |
| `tax_invoice_item`  | 세금계산서 품목 목록                               |
| `tax_invoice_log`   | 발행·취소·NTS 전송 이력                            |
| `tax_invoice_party` | 자주 사용하는 거래처 정보                          |
