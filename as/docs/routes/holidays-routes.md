# Holidays Routes

기준 파일: `src/app/plugins/holidays/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [Holidays Guide](../../plugins/holidays.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                   | 설명                        |
| ------ | ------------------------------------------------------ | --------------------------- |
| GET    | [/v1/holidays](#get-v1apiholidays)                 | 공휴일 목록 조회            |
| GET    | [/v1/holidays/:locdate](#get-v1apiholidayslocdate) | 특정 날짜 공휴일 단건 조회  |
| POST   | [/v1/holidays/sync](#post-v1apiholidayssync)       | 수동 동기화 트리거 (관리자) |

## 라우트 상세

### GET /v1/holidays

<a id="get-v1apiholidays"></a>

- 설명: 공휴일 목록을 조회한다. 쿼리 파라미터로 연도·월·공휴일 여부 등을 필터링할 수 있다.

**쿼리 파라미터**

| 파라미터     | 타입   | 필수 | 설명                                  |
| ------------ | ------ | ---- | ------------------------------------- |
| `year`       | number | -    | 연도 (예: `2025`)                     |
| `month`      | number | -    | 월 `1`~`12` (예: `5`)                 |
| `is_holiday` | string | -    | 공휴일 여부 `Y` 또는 `N`              |
| `date_kind`  | string | -    | 날짜 분류 코드                        |
| `page`       | number | -    | 페이지 번호 (기본 `1`)                |
| `limit`      | number | -    | 페이지당 건수 (기본 `50`, 최대 `500`) |

- 사용 예제:

```bash
# 2025년 5월 공휴일 전체 조회
curl "http://localhost:3000/v1/holidays?year=2025&month=5&is_holiday=Y"

# 2025년 전체 공휴일 조회
curl "http://localhost:3000/v1/holidays?year=2025&is_holiday=Y"

# 페이지네이션
curl "http://localhost:3000/v1/holidays?year=2025&page=1&limit=20"
```

- 응답 예제:

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "locdate": 20250505,
                "dateName": "어린이날",
                "is_holiday": "Y",
                "date_kind": "01"
            }
        ],
        "total": 1,
        "page": 1,
        "limit": 50
    }
}
```

---

### GET /v1/holidays/:locdate

<a id="get-v1apiholidayslocdate"></a>

- 설명: `YYYYMMDD` 형식의 날짜로 해당 날짜의 공휴일 정보를 단건 조회한다.

**경로 파라미터**

| 파라미터  | 타입   | 설명                              |
| --------- | ------ | --------------------------------- |
| `locdate` | string | 날짜 (8자리 숫자, 예: `20250505`) |

- 사용 예제:

```bash
curl "http://localhost:3000/v1/holidays/20250505"
```

- 응답 예제 (공휴일인 경우):

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "locdate": 20250505,
                "dateName": "어린이날",
                "is_holiday": "Y",
                "date_kind": "01"
            }
        ],
        "total": 1
    }
}
```

- 응답 예제 (해당 날짜 없음):

```json
{
    "ok": false,
    "error": "no holidays on that date"
}
```

---

### POST /v1/holidays/sync

<a id="post-v1apiholidayssync"></a>

- 설명: 공휴일 데이터를 즉시 수동으로 동기화한다. 관리자 전용.
- 주의: 플러그인이 비활성화(`enabled: false`)되어 있거나 `DATAGOKR_API_KEY`가 없으면 `503`을 반환한다.

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/holidays/sync"
```

- 응답 예제:

```json
{
    "ok": true,
    "data": {
        "message": "Holiday sync completed"
    }
}
```

- 오류 응답 (플러그인 비활성화):

```json
{
    "ok": false,
    "error": "Holidays plugin not enabled"
}
```

---

## 관련 문서

- [Account Routes](./account-routes.md)
- [Alimtalk Routes](./alimtalk-routes.md)
- [Email Verification](./email-verification.md)
- [Friendtalk Routes](./friendtalk-routes.md)
- [Identity Routes](./identity-routes.md)
- [LLM Routes](./llm-routes.md)
- [OCR Routes](./ocr-routes.md)
- [Password Reset](./password-reset.md)
- [PG Routes](./pg-routes.md)
- [SMS Routes](./sms-routes.md)
- [SMTP Routes](./smtp-routes.md)
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
