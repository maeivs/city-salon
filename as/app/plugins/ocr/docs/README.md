# OCR 플러그인

Google Vision, Naver CLOVA, AWS Textract, Azure AI, Upstage, Tesseract를 지원하는 광학 문자 인식(OCR) 플러그인입니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [환경변수](#환경변수)
- [API 요약](#api-요약)
- [API 상세](api.md)
- [운영 팁](#운영-팁)

---

## 개요

| 항목            | 내용                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| 지원 프로바이더 | Google Vision, Naver CLOVA, AWS Textract, Azure AI, Upstage, Tesseract |
| 지원 형식       | 이미지 (JPEG, PNG, WebP, TIFF), PDF                                    |
| 비동기 처리     | 대용량 파일은 비동기 큐 방식으로 처리                                  |
| 캐싱            | 파일 해시 기반 중복 요청 방지                                          |
| 쿼터 관리       | 프로바이더별 일별/월별 사용량 제한                                     |
| LLM 폴백        | OCR 후 LLM으로 결과 정제 가능                                          |

> 기본 비활성화(`enabled: false`)입니다. 최소 1개 프로바이더 API 키 설정 후 활성화하세요.

---

## 설정

`config.json` 핵심 구조:

```json
{
    "enabled": false,
    "default": "naver",
    "providers": {
        "naver": {
            "driver": "naver",
            "api_url": "${NAVER_OCR_API_URL}",
            "secret_key": "${NAVER_OCR_SECRET_KEY}",
            "max_file_size_mb": 10,
            "supported_formats": ["image/jpeg", "image/png", "application/pdf"]
        },
        "google": {
            "driver": "google",
            "api_key": "${GOOGLE_VISION_API_KEY}",
            "max_file_size_mb": 20
        },
        "tesseract": {
            "driver": "tesseract",
            "lang": "kor+eng"
        }
    }
}
```

### 설정 항목

| 항목                           | 설명               |
| ------------------------------ | ------------------ |
| `default`                      | 기본 프로바이더 키 |
| `providers.*.driver`           | 프로바이더 식별자  |
| `providers.*.api_key`          | 프로바이더 API 키  |
| `providers.*.max_file_size_mb` | 최대 파일 크기(MB) |

---

## 환경변수

```env
# Naver CLOVA OCR
NAVER_OCR_API_URL=https://...clova.ai/custom/v1/...
NAVER_OCR_SECRET_KEY=...

# Google Vision
GOOGLE_VISION_API_KEY=AIza...

# AWS Textract
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Azure AI Vision
AZURE_OCR_ENDPOINT=https://...cognitiveservices.azure.com
AZURE_OCR_KEY=...

# Upstage
UPSTAGE_API_KEY=up_...
```

Tesseract는 별도 API 키 없이 서버에 `tesseract-ocr` 패키지 설치 필요.

---

## API 요약

기본 경로: `/v1/ocr`

| 메서드   | 경로                | 인증        | 설명                               |
| -------- | ------------------- | ----------- | ---------------------------------- |
| `POST`   | `/recognize`        | 로그인 필요 | 동기 OCR 인식                      |
| `POST`   | `/recognize/async`  | 로그인 필요 | 비동기 OCR 인식                    |
| `POST`   | `/:docType`         | 로그인 필요 | 문서 유형별 인식 (명함, 신분증 등) |
| `GET`    | `/results`          | 로그인 필요 | 인식 결과 목록                     |
| `GET`    | `/results/:id`      | 로그인 필요 | 인식 결과 단건 조회                |
| `GET`    | `/results/:id/text` | 로그인 필요 | 텍스트만 반환                      |
| `DELETE` | `/results/:id`      | 로그인 필요 | 인식 결과 삭제                     |
| `GET`    | `/quota`            | 로그인 필요 | 사용량 및 쿼터 조회                |

> 전체 요청/응답 형식은 [api.md](api.md)를 참조하세요.

---

## 운영 팁

- 동기 (`/recognize`)는 빠른 응답이 필요한 경우, 비동기 (`/recognize/async`)는 대용량 PDF에 사용
- Naver CLOVA는 한국어 인식 정확도가 높음, Google Vision은 다국어에 강함
- 파일 해시 캐싱으로 동일 파일 재인식 시 API 호출 없이 캐시 결과 반환
- Tesseract는 오프라인(무료)이지만 정확도가 상업용 대비 낮음 — 개발/테스트용으로 권장
- LLM 폴백 활성화 시 OCR 결과를 LLM으로 재가공하여 구조화된 JSON 출력 가능
