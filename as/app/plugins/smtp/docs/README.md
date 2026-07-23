# SMTP 플러그인

이메일 발송 기능을 제공합니다.  
앱 서버에서 로컬 HTML 템플릿을 렌더링한 뒤 Go 엔티티서버로 전달합니다.  
라우트에 등록되지 않은 `/v1/smtp/*` 경로는 Go 서버로 자동 패스스루됩니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [동작 방식](#동작-방식)
- [API](#api)
- [이메일 템플릿](#이메일-템플릿)

---

## 개요

| 항목             | 내용                                           |
| ---------------- | ---------------------------------------------- |
| 기본 경로        | `/v1/smtp`                                 |
| 설정 파일        | `config.json`                                  |
| 활성화 기본값    | `true`                                         |
| 이메일 발송 주체 | Go 엔티티서버 (앱 서버는 템플릿 렌더링만 처리) |

---

## 설정

설정 파일: `src/app/plugins/smtp/config.json`

| 키        | 기본값 | 설명                   |
| --------- | ------ | ---------------------- |
| `enabled` | `true` | 플러그인 활성화 여부   |
| `deploy`  | `true` | 빌드 배포 포함 여부    |
| `minify`  | `true` | 빌드 시 코드 압축 여부 |

> SMTP 서버 주소·계정 등 실제 메일 발송 설정은 Go 엔티티서버의 `configs/smtp.json`에서 관리합니다.  
> 앱 서버에는 별도의 SMTP 환경변수가 없습니다.

---

## 동작 방식

```
클라이언트
    │
    ▼
POST /v1/smtp/send (앱 서버)
    │  templateName 지정 시 로컬 templates/ 에서 HTML 렌더링
    │  body_html/body_text 직접 지정 시 그대로 전달
    ▼
Go 엔티티서버 (실제 SMTP 발송)
    │
    ▼
이메일 발송 결과 → sms_log / mail_log 기록
```

**직접 패스스루 경로**

라우트에 등록되어 있지 않은 `/v1/smtp/*` 경로(예: `/v1/smtp/templates`, `/v1/smtp/logs` 등)는 `system/proxy/register.ts`에 의해 Go 서버로 그대로 전달됩니다.

---

## API

기본 경로: `/v1/smtp`

| 메서드 | 경로                              | 인증 | 설명               |
| ------ | --------------------------------- | ---- | ------------------ |
| `POST` | [`/send`](#post-send)             |      | 이메일 발송        |
| `GET`  | [`/status/:seq`](#get-status-seq) |      | 발송 상태 조회     |
| 기타   | `/v1/smtp/*`                  |      | Go 서버로 패스스루 |

---

### POST /send

로컬 템플릿 렌더링 후 Go 서버 경유로 이메일을 발송합니다.

**요청 Body**

| 필드           | 타입     | 필수 | 설명                               |
| -------------- | -------- | ---- | ---------------------------------- |
| `to`           | string[] | ✅   | 수신자 이메일 주소 목록            |
| `subject`      | string   | ✅   | 메일 제목                          |
| `templateName` | string   |      | 로컬 템플릿 이름 (확장자 제외)     |
| `templateData` | object   |      | 템플릿에 주입할 데이터             |
| `body_html`    | string   |      | HTML 본문 (templateName 미사용 시) |
| `body_text`    | string   |      | 텍스트 본문                        |
| `cc`           | string[] |      | 참조                               |
| `bcc`          | string[] |      | 숨은 참조                          |
| `reply_to`     | string   |      | 회신 주소                          |

**templateName 동작**

`templateName`이 지정되면 `templates/{templateName}.html`을 불러와 `templateData`로 렌더링한 결과를 `body_html`로 사용합니다.

**응답 예시**

```json
{
    "success": true,
    "data": {
        "seq": 1042
    }
}
```

---

### GET /status/:seq

Go 엔티티서버에서 이메일 발송 상태를 조회합니다.

**경로 파라미터**

| 파라미터 | 타입   | 설명          |
| -------- | ------ | ------------- |
| `seq`    | number | 발송 기록 SEQ |

**응답 예시**

```json
{
    "success": true,
    "data": {
        "seq": 1042,
        "state": "sent",
        "sent_at": "2025-01-15T09:00:00Z"
    }
}
```

---

## 이메일 템플릿

템플릿 파일 위치: `src/app/plugins/smtp/templates/`

| 파일          | 설명                                    |
| ------------- | --------------------------------------- |
| `layout.html` | 공통 레이아웃 (모든 템플릿의 기본 구조) |

### 템플릿 추가 방법

1. `templates/` 폴더에 `.html` 파일 생성
2. `POST /send` 요청 시 `templateName`에 파일명(확장자 제외) 지정
3. `templateData`로 변수 데이터 주입

**예시**

```json
{
    "to": ["user@example.com"],
    "subject": "회원가입 완료",
    "templateName": "welcome",
    "templateData": {
        "name": "홍길동",
        "loginUrl": "https://example.com/login"
    }
}
```
