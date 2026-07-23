# 친구톡(FriendTalk) 가이드

카카오톡 채널을 추가한 친구에게 자유 형식 브랜드 메시지를 발송하는 기능입니다.

이 문서는 플러그인의 개요/설정/운영 가이드를 중심으로 다룹니다.  
실제 라우트표, 호출 예제, 응답 예제는 [Friendtalk Routes](../routes/friendtalk-routes.md) 문서를 참고하세요.

---

## 목차

- [개요](#개요)
- [알림톡과의 차이점](#알림톡과의-차이점)
- [설정](#설정)
- [API 레퍼런스](#api-레퍼런스)
- [msg_type별 발송 예시](#msg_type별-발송-예시)
- [광고 메시지 규칙](#광고-메시지-규칙)
- [운영 팁](#운영-팁)

---

## 개요

친구톡은 카카오톡 채널을 **추가한 사용자에게만** 발송 가능한 마케팅형 메시지입니다.

- 사전 검수 템플릿 **불필요** — 자유 텍스트 즉시 발송
- 이미지·와이드·캐러셀 등 다양한 메시지 유형 지원
- 광고성 메시지 수신 동의 및 광고 표기 **의무**

---

## 알림톡과의 차이점

| 항목        | 알림톡              | 친구톡                                         |
| ----------- | ------------------- | ---------------------------------------------- |
| 템플릿      | ✅ 필수 (사전 검수) | ❌ 불필요                                      |
| 수신 대상   | 채널 미추가 포함    | **채널 추가 친구만**                           |
| 메시지 유형 | 텍스트 (변수 치환)  | 텍스트·이미지·와이드·캐러셀                    |
| 광고 표기   | 비광고 허용         | 광고 여부 명시 필수                            |
| 설정 파일   | `alimtalk.json`     | `friendtalk.json` (프로바이더는 alimtalk 공유) |

---

## 설정

`configs/notification/friendtalk.json`:

```json
{
    "enabled": false,
    "default": "solapi",
    "workers": 2,
    "ad_prefix": "(광고)",
    "default_ad": true,
    "_template_file": "templates/notification/friendtalk.json",
    "providers": {
        "solapi": {
            "driver": "solapi",
            "api_key": "${SOLAPI_API_KEY}",
            "api_secret": "${SOLAPI_API_SECRET}",
            "pf_id": "${SOLAPI_PF_ID}",
            "api_url": "https://api.solapi.com"
        },
        "aligo": {
            "driver": "aligo",
            "api_key": "${ALIGO_API_KEY}",
            "user_id": "${ALIGO_USER_ID}",
            "sender_key": "${ALIMTALK_SENDER_KEY}"
        },
        "nhncloud": {
            "driver": "nhncloud",
            "app_key": "${NHNCLOUD_APP_KEY}",
            "secret_key": "${NHNCLOUD_SECRET_KEY}",
            "plus_friend_id": "${KAKAO_PLUS_FRIEND_ID}"
        }
    }
}
```

### 설정 항목

| 항목             | 기본값     | 설명                                    |
| ---------------- | ---------- | --------------------------------------- |
| `enabled`        | `false`    | 기능 활성화 여부 (`false`이면 503 반환) |
| `default`        | -          | 기본 프로바이더 이름 (key, 필수)        |
| `workers`        | `2`        | 백그라운드 발송 워커 수                 |
| `ad_prefix`      | `"(광고)"` | `is_ad: true`일 때 본문 앞 자동 삽입    |
| `default_ad`     | `true`     | `is_ad` 미지정 시 기본값                |
| `_template_file` | -          | 본문 패턴 템플릿 파일 경로              |

---

## API 레퍼런스

이 문서는 기능 소개/설정/운영 기준을 다룹니다.  
라우트별 파라미터 표, 요청/응답 예제, 상태코드는 아래 라우트 문서를 기준으로 확인합니다.

- 상세 API 레퍼런스: [Friendtalk Routes](../routes/friendtalk-routes.md)

기본 경로: `/v1/friendtalk`

| 메서드 | 경로    | 설명                |
| ------ | ------- | ------------------- |
| `POST` | `/send` | 친구톡 발송 큐 등록 |

---

## msg_type별 발송 예시

### 이미지형 (image)

```json
{
    "receiver": "01012345678",
    "content": "이번 주 특가 상품을 확인하세요!",
    "msg_type": "image",
    "image_url": "https://cdn.example.com/promo.jpg",
    "image_link": "https://example.com/promo",
    "is_ad": true
}
```

### 와이드 이미지형 (wide_image)

```json
{
    "receiver": "01012345678",
    "content": "신상품 출시",
    "msg_type": "wide_image",
    "image_url": "https://cdn.example.com/wide.jpg",
    "image_link": "https://example.com/new"
}
```

---

## 광고 메시지 규칙

- `is_ad: true`이면 `ad_prefix`(기본: `(광고)`)가 본문 앞에 **자동 삽입**됩니다
- 광고 메시지는 수신 동의를 받은 사용자에게만 발송해야 합니다
- 카카오 정책 위반 시 채널 차단 위험이 있습니다

---

## 운영 팁

- `enabled: false`이면 API 호출 시 **503** 반환 — 운영 전 반드시 `true`로 변경
- 채널 추가 친구가 아닌 번호로 발송하면 프로바이더에서 오류 반환
- 솔라피(`solapi`) 권장 — SDK 지원 및 통합 메시징 편리

---

## 관련 문서

- [Friendtalk Routes](../routes/friendtalk-routes.md)
- [알림톡 가이드](alimtalk.md)
- [설정 예제](../../configs-example/notification/friendtalk.json)
- [템플릿 예제](../../templates/notification/friendtalk.json)
