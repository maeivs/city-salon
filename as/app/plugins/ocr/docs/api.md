# OCR API 레퍼런스

기본 경로: `/v1/ocr`

---

## 엔드포인트 목록

| 메서드   | 경로                                        | 인증        | 설명                |
| -------- | ------------------------------------------- | ----------- | ------------------- |
| `POST`   | [`/recognize`](#post-recognize)             | 로그인 필요 | 동기 OCR 인식       |
| `POST`   | [`/recognize/async`](#post-recognizeasync)  | 로그인 필요 | 비동기 OCR 인식     |
| `POST`   | [`/:docType`](#post-doctype)                | 로그인 필요 | 문서 유형별 인식    |
| `GET`    | [`/results`](#get-results)                  | 로그인 필요 | 인식 결과 목록      |
| `GET`    | [`/results/:id`](#get-results-id)           | 로그인 필요 | 인식 결과 단건 조회 |
| `GET`    | [`/results/:id/text`](#get-results-id-text) | 로그인 필요 | 텍스트만 반환       |
| `DELETE` | [`/results/:id`](#delete-results-id)        | 로그인 필요 | 인식 결과 삭제      |
| `GET`    | [`/quota`](#get-quota)                      | 로그인 필요 | 사용량 및 쿼터 조회 |

---

## POST /recognize

파일을 업로드하여 즉시 OCR 결과를 반환합니다.

**Content-Type:** `multipart/form-data`

| 필드       | 타입   | 필수 | 설명                                  |
| ---------- | ------ | ---- | ------------------------------------- |
| `file`     | file   | ✅   | 인식할 이미지 또는 PDF                |
| `provider` | string |      | 사용할 프로바이더 (기본값: `default`) |
| `lang`     | string |      | 언어 힌트 (예: `ko`, `en`, `ko+en`)   |

**응답:**

```json
{
    "ok": true,
    "data": {
        "id": "ocr_uuid",
        "text": "인식된 전체 텍스트...",
        "provider": "naver",
        "confidence": 0.97,
        "created_at": "2026-03-22T06:00:00Z"
    }
}
```

---

## POST /recognize/async

대용량 파일을 비동기로 처리합니다. 요청 즉시 `id`를 반환하고, 완료 후 `GET /results/:id`로 조회합니다.

**Content-Type:** `multipart/form-data` (`/recognize`와 동일)

**응답:**

```json
{
    "ok": true,
    "data": {
        "id": "ocr_uuid",
        "status": "pending"
    }
}
```

**상태 값:**

| 상태         | 설명         |
| ------------ | ------------ |
| `pending`    | 처리 대기 중 |
| `processing` | 인식 진행 중 |
| `done`       | 인식 완료    |
| `failed`     | 인식 실패    |

---

## POST /:docType

문서 유형에 맞는 파싱 파이프라인을 적용합니다. 반환 결과가 구조화된 JSON입니다.

**docType 유효값:**

| docType         | 설명   |
| --------------- | ------ |
| `business_card` | 명함   |
| `id_card`       | 신분증 |
| `invoice`       | 청구서 |
| `receipt`       | 영수증 |

**응답 예시 (명함):**

```json
{
    "ok": true,
    "data": {
        "name": "홍길동",
        "company": "엔티티 주식회사",
        "position": "개발팀장",
        "email": "hong@example.com",
        "phone": "010-1234-5678"
    }
}
```

---

## GET /results

이전 인식 결과 목록을 조회합니다.

| 파라미터   | 타입   | 설명                            |
| ---------- | ------ | ------------------------------- |
| `provider` | string | 프로바이더 필터                 |
| `status`   | string | 상태 필터 (`done`, `failed` 등) |
| `limit`    | number | 최대 결과 수 (기본 20)          |
| `offset`   | number | 페이지 오프셋                   |

---

## GET /results/:id

특정 인식 결과를 조회합니다.

---

## GET /results/:id/text

인식된 텍스트만 `text/plain`으로 반환합니다.

---

## DELETE /results/:id

인식 결과를 삭제합니다.

---

## GET /quota

프로바이더별 사용량 및 남은 쿼터를 조회합니다.

**응답 예시:**

```json
{
    "ok": true,
    "data": {
        "naver": {
            "used_today": 42,
            "daily_limit": 1000,
            "used_this_month": 850,
            "monthly_limit": 10000
        }
    }
}
```
