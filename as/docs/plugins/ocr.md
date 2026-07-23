# OCR(광학 문자 인식) 가이드

AWS Textract, Azure, Google Vision, NAVER Clova, Tesseract, Upstage 등을 통한 문서 인식 가이드입니다.

이 문서는 플러그인의 개요/설정/운영 가이드를 중심으로 다룹니다.  
실제 라우트표, 호출 예제, 응답 예제는 [OCR Routes](../routes/ocr-routes.md) 문서를 참고하세요.

---

## 목차

- [개요](#개요)
- [프로바이더 비교](#프로바이더-비교)
- [설정](#설정)
- [API 레퍼런스](#api-레퍼런스)
- [지원 문서 타입](#지원-문서-타입)
- [비동기 처리](#비동기-처리)
- [운영 팁](#운영-팁)

---

## 개요

Entity App Server의 OCR 플러그인은 여러 OCR 프로바이더를 단일 API로 추상화합니다.

- 이미지/PDF → 텍스트 추출
- 동기 및 비동기(polling) 인식
- 신분증, 운전면허증, 사업자등록증 등 문서 타입별 구조화 추출
- OCR 결과 저장 및 조회

---

## 프로바이더 비교

| provider                    | driver         | 특징                                  |
| --------------------------- | -------------- | ------------------------------------- |
| AWS Textract                | `aws_textract` | 테이블/폼 구조 추출 우수, 한국어 지원 |
| Azure Document Intelligence | `azure`        | Form Recognizer 기반, 정형 문서 강점  |
| Google Vision               | `google`       | 범용 OCR, 다국어 지원 우수            |
| NAVER Clova OCR             | `naver`        | 한국어 최적화, 신분증/영수증 특화     |
| Tesseract                   | `tesseract`    | 오픈소스, 자체 호스팅 가능, 무료      |
| Upstage Document AI         | `upstage`      | 한국어 문서 특화, 고정밀도            |

---

## 설정

`configs/plugins/ocr.json`:

```json
{
    "enabled": false,
    "default_provider": "naver",
    "providers": {
        "google": {
            "driver": "google",
            "api_key": "${OCR_GOOGLE_API_KEY}"
        },
        "naver": {
            "driver": "naver",
            "api_key": "${OCR_NAVER_SECRET}",
            "endpoint": "${OCR_NAVER_INVOKE_URL}"
        },
        "aws_textract": {
            "driver": "aws_textract",
            "api_key": "${OCR_AWS_ACCESS_KEY}",
            "api_secret": "${OCR_AWS_SECRET_KEY}",
            "region": "${OCR_AWS_REGION}"
        },
        "azure": {
            "driver": "azure",
            "api_key": "${OCR_AZURE_KEY}",
            "endpoint": "${OCR_AZURE_ENDPOINT}"
        },
        "upstage": {
            "driver": "upstage",
            "api_key": "${OCR_UPSTAGE_API_KEY}"
        },
        "tesseract": {
            "driver": "tesseract"
        }
    }
}
```

---

## API 레퍼런스

이 문서는 기능 소개/설정/운영 기준을 다룹니다.  
라우트별 파라미터 표, 요청/응답 예제, 상태코드는 아래 라우트 문서를 기준으로 확인합니다.

- 상세 API 레퍼런스: [OCR Routes](../routes/ocr-routes.md)

기본 경로: `/v1/ocr`

| 메서드   | 경로                | 설명                |
| -------- | ------------------- | ------------------- |
| `POST`   | `/recognize`        | 동기 OCR 인식       |
| `POST`   | `/recognize/async`  | 비동기 OCR 인식     |
| `POST`   | `/:docType`         | 문서 타입 지정 인식 |
| `GET`    | `/results`          | 결과 목록 조회      |
| `GET`    | `/results/:id`      | 결과 상세 조회      |
| `GET`    | `/results/:id/text` | 인식 텍스트만 조회  |
| `DELETE` | `/results/:id`      | 결과 삭제           |
| `GET`    | `/quota`            | 사용량 한도 조회    |

---

## 지원 문서 타입

| docType          | 설명         | 주요 추출 항목             |
| ---------------- | ------------ | -------------------------- |
| `id_card`        | 주민등록증   | 이름, 주민번호, 주소       |
| `driver_license` | 운전면허증   | 이름, 면허번호, 생년월일   |
| `business_reg`   | 사업자등록증 | 사업자번호, 상호, 대표자명 |
| `career_cert`    | 경력증명서   | 소속, 직위, 재직기간       |
| `facility_card`  | 시설관리카드 | 시설명, 주소, 관리번호     |
| `invoice`        | 청구서/송장  | 발행일, 금액, 품목         |
| `namecard`       | 명함         | 이름, 회사, 연락처         |
| `receipt`        | 영수증       | 가맹점, 결제금액, 일시     |

---

## 비동기 처리

```
1. POST /recognize/async   →  { job_id: "xxx", status: "pending" }
2. GET  /results/xxx       →  { status: "processing" }  (폴링)
3. GET  /results/xxx       →  { status: "done", text: "...", structured: {...} }
```

폴링 권장 간격: 1~2초, 최대 대기 시간: 30초

---

## 결과 텍스트만 가져오기

```
GET /v1/ocr/results/job_abc123/text
```

```json
{
    "id": "job_abc123",
    "text": "홍길동\n서울특별시 ..."
}
```

---

## 운영 팁

- 한국 신분증/영수증 → **NAVER Clova** 또는 **Upstage** 권장
- 비용 절감이 필요한 경우 **Tesseract** 자체 호스팅 활용
- `docType` 지정 시 프로바이더가 해당 문서에 최적화된 추출 수행
- 비동기 API는 PDF 다페이지 처리 시 유용
- 결과는 DB에 저장되므로 `/results` API로 이력 조회 가능

---

## 관련 문서

- [OCR Routes](../routes/ocr-routes.md)
- [설정 예제](../../src/app/plugins/ocr/config.example.json)
- [OCR 추출 템플릿](../../templates/ocr/)
- [OCR 프롬프트](../../templates/ocr/prompts/)
- [Entity Server OCR 가이드](../../../docs/plugins/ocr-guide.md)
