# 세금계산서 가이드

바로빌, 이세로, 팝빌, 스마트빌, 볼타 등을 통한 전자세금계산서 발급 가이드입니다.

이 문서는 플러그인의 개요/설정/운영 가이드를 중심으로 다룹니다.  
실제 라우트표, 호출 예제, 응답 예제는 [Tax Invoice Routes](../routes/tax-invoice-routes.md) 문서를 참고하세요.

---

## 목차

- [개요](#개요)
- [프로바이더 비교](#프로바이더-비교)
- [설정](#설정)
- [발급 흐름](#발급-흐름)
- [API 레퍼런스](#api-레퍼런스)
- [상태 흐름](#상태-흐름)
- [국세청 전송](#국세청-전송)
- [운영 팁](#운영-팁)

---

## 개요

Entity App Server의 세금계산서 플러그인은 여러 세금계산서 발급 대행 프로바이더를 단일 API로 추상화합니다.

- 즉시 발급 (등록 + 발행 일괄 처리)
- 단계별 발급 (draft 저장 → 검토 → 발행)
- 발행 취소
- 국세청(NTS) 전송 상태 추적

---

## 프로바이더 비교

| provider | driver     | 특징                              |
| -------- | ---------- | --------------------------------- |
| 바로빌   | `barobill` | 국내 점유율 1위, 다양한 연동 방식 |
| 이지로   | `ezero`    | 이지로 전자세금계산서             |
| 팝빌     | `popbill`  | API 문서 풍부, 중소기업 많이 사용 |
| KT-NET   | `ktnet`    | KT-NET 세금계산서 서비스          |

---

## 설정

`configs/plugins/tax-invoice.json`:

```json
{
    "enabled": false,
    "default": "barobill",
    "providers": {
        "barobill": {
            "driver": "barobill",
            "cert_key": "${TAXINVOICE_CERT_KEY}",
            "corp_num": "${TAXINVOICE_CORP_NUM}",
            "user_id": "${TAXINVOICE_USER_ID}",
            "api_endpoint": "https://barobill.co.kr/TAPI/TaxInvoiceService.asmx"
        },
        "ezero": {
            "driver": "ezero",
            "cert_key": "${EZERO_CERT_KEY}",
            "corp_num": "${EZERO_CORP_NUM}",
            "user_id": "${EZERO_USER_ID}",
            "api_endpoint": "https://www.ezero.co.kr/tax-invoice/api"
        },
        "popbill": {
            "driver": "popbill",
            "link_id": "${POPBILL_LINK_ID}",
            "secret_key": "${POPBILL_SECRET_KEY}",
            "corp_num": "${POPBILL_CORP_NUM}",
            "api_url": "https://www.popbill.com"
        },
        "ktnet": {
            "driver": "ktnet",
            "cert_key": "${KTNET_CERT_KEY}",
            "corp_num": "${KTNET_CORP_NUM}",
            "user_id": "${KTNET_USER_ID}",
            "api_endpoint": "https://www.b2b.kt.com/einvoice"
        }
    }
}
```

### 환경변수 (.env)

```env
TAXINVOICE_CERT_KEY=your_cert_key
TAXINVOICE_CORP_NUM=1234567890
TAXINVOICE_USER_ID=your_user_id

EZERO_CERT_KEY=your_cert_key
EZERO_CORP_NUM=1234567890
EZERO_USER_ID=your_user_id

POPBILL_LINK_ID=your_link_id
POPBILL_SECRET_KEY=your_secret_key
POPBILL_CORP_NUM=1234567890

KTNET_CERT_KEY=your_cert_key
KTNET_CORP_NUM=1234567890
KTNET_USER_ID=your_user_id
```

---

## 발급 흐름

### 즉시 발급 (추천)

```
POST /v1/taxinvoice     →  등록 + 발행 일괄 처리  →  issued
```

### 단계별 발급

```
1. POST /v1/taxinvoice/register    →  draft (임시 저장)
2. POST /v1/taxinvoice/:seq/issue  →  issued (발행 처리)
3. (선택) GET /v1/taxinvoice/:seq/state  →  NTS 전송 상태 확인
```

---

## API 레퍼런스

이 문서는 기능 소개/설정/운영 기준을 다룹니다.  
라우트별 파라미터 표, 요청/응답 예제, 상태코드는 아래 라우트 문서를 기준으로 확인합니다.

- 상세 API 레퍼런스: [Tax Invoice Routes](../routes/tax-invoice-routes.md)

기본 경로: `/v1/taxinvoice`

| 메서드 | 경로           | 설명                       |
| ------ | -------------- | -------------------------- |
| `POST` | `/`            | 즉시 발급 (등록+발행 일괄) |
| `POST` | `/register`    | 세금계산서 등록 (draft)    |
| `POST` | `/:seq/issue`  | 발행 처리                  |
| `POST` | `/:seq/cancel` | 발행 취소                  |
| `GET`  | `/:seq/state`  | 처리 상태 조회             |
| `GET`  | `/:seq`        | 세금계산서 상세 조회       |

---

## 상태 흐름

```
draft
  │
  ├─ 발행 실패 → pre_issue_waiting (재시도 대기)
  │
  └─ 발행 성공 → issued
                   │
                   └─ 국세청 전송 대기 → accepted
                                          │
                                          └─ 전송 완료 (nts_state: completed)
```

| status              | 설명                |
| ------------------- | ------------------- |
| `draft`             | 임시 저장           |
| `pre_issue_waiting` | 발행 재시도 대기 중 |
| `issued`            | 발행 완료           |
| `cancelled`         | 취소됨              |

| nts_state   | 설명                 |
| ----------- | -------------------- |
| `pending`   | 국세청 전송 전       |
| `accepted`  | 국세청 수신 완료     |
| `completed` | 국세청 처리 완료     |
| `rejected`  | 국세청에서 오류 반려 |

---

## 국세청 전송

- 발행된 세금계산서는 **익일 오전까지** 국세청에 자동 전송됩니다.
- `nts_state: rejected` 시 사유를 확인 후 수정 재발행 필요합니다.
- 재전송은 프로바이더 어드민 또는 `/state` 폴링으로 확인 가능합니다.

---

## 운영 팁

- 발행 전 `register`로 초안 저장 후 담당자 검토 → `issue` 권장 (오류 방지)
- `supply_value + tax_value = total_value` 를 반드시 확인 (검증 오류 가장 많음)
- 테스트 환경에서는 각 프로바이더의 샌드박스 API URL 사용
- 발행 취소는 국세청 전송 전에만 가능 → 이후에는 수정세금계산서 발행 필요

---

## 관련 문서

- [Tax Invoice Routes](../routes/tax-invoice-routes.md)
- [설정 예제](../../src/app/plugins/taxinvoice/config.example.json)
- [Entity Server 세금계산서 가이드](../../../docs/plugins/tax-invoice-guide.md)
