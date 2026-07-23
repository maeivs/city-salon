# Identity Routes

기준 파일: `src/app/plugins/identity/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.
플러그인의 개요/설정/운영 가이드는 [Identity Guide](../../plugins/identity.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                                      | 설명             |
| ------ | ------------------------------------------------------------------------- | ---------------- |
| POST   | [/v1/identity/request](#post-v1apiidentityrequest)                    | 인증 요청 생성   |
| POST   | [/v1/identity/callback](#post-v1apiidentitycallback)                  | 중계사 콜백 수신 |
| GET    | [/v1/identity/result/:request_id](#get-v1apiidentityresultrequest_id) | 인증 결과 조회   |
| POST   | [/v1/identity/verify-ci](#post-v1apiidentityverify-ci)                | CI 중복 확인     |

## 라우트 상세

### POST /v1/identity/request

<a id="post-v1apiidentityrequest"></a>

- 설명: 본인인증 요청을 생성하고 팝업 호출에 필요한 데이터를 반환한다.
- 인증: JWT 선택 (있으면 `account_seq` 자동 추출)
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/identity/request" \
     -H "Content-Type: application/json" \
     -d '{
       "purpose": "signup",
       "method": "popup",
       "provider": "nice"
     }'
```

- 요청 Body:

| 필드       | 타입   | 필수 | 설명                                                                                          |
| ---------- | ------ | ---- | --------------------------------------------------------------------------------------------- |
| `purpose`  | string | ✅   | 인증 목적 (`signup` / `find_account` / `password_reset` / `adult_verify` / `identity_change`) |
| `method`   | string |      | 인증 방식 (`popup` / `pass` / `sms`), 기본: `popup`                                           |
| `provider` | string |      | 프로바이더 지정 (`nice` / `kmc` / `danal`), 기본: 설정의 `default`                            |

- 성공 응답 (200):

```json
{
    "ok": true,
    "data": {
        "request_id": "a1b2c3d4...64자hex",
        "popup_url": "https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb",
        "enc_data": "ZW5jcnlwdGVk...",
        "token_version_id": "20250101...",
        "integrity_value": "hmac..."
    }
}
```

> **NICE**: `popup_url`, `enc_data`, `token_version_id`, `integrity_value` 반환
> **KMC**: `popup_url`, `enc_data` 반환
> **다날**: `popup_url`, `enc_data` 반환

- 에러 응답:

| 코드 | 조건                              |
| ---- | --------------------------------- |
| 400  | `purpose` 누락 또는 유효하지 않음 |
| 500  | 프로바이더 통신 실패              |
| 503  | Identity 플러그인 비활성화        |

---

### POST /v1/identity/callback

<a id="post-v1apiidentitycallback"></a>

- 설명: NICE/KMC/다날 중계사가 본인인증 완료 후 호출하는 콜백 엔드포인트.
- 인증: 없음 (중계사에서 직접 호출)
- Content-Type: `application/x-www-form-urlencoded` 또는 `application/json`
- 사용 예제:

```bash
# form-urlencoded (NICE/KMC 기본)
curl -X POST "http://localhost:3000/v1/identity/callback?provider=nice" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "enc_data=ZW5jcnlwdGVk...&token_version_id=20250101..."
```

- 요청 Body:

| 필드               | 타입   | 필수 | 설명                                  |
| ------------------ | ------ | ---- | ------------------------------------- |
| `enc_data`         | string | ✅   | 중계사 암호화된 콜백 데이터           |
| `token_version_id` | string |      | NICE 전용, 토큰 버전 ID               |
| `provider`         | string |      | 프로바이더 (body 또는 query 파라미터) |
| `rec_cert`         | string |      | KMC 전용, `enc_data` 대체 파라미터    |

- 성공 응답: HTML 페이지 (`text/html`)
    - `window.opener.postMessage`로 인증 결과를 부모 창에 전달
    - 자동으로 팝업 닫기

```js
// 부모 창에서 수신하는 메시지 형식
{
  type: "identity_verification",
  request_id: "a1b2c3d4...64자hex",
  status: "verified"  // 또는 "failed"
}
```

---

### GET /v1/identity/result/:request_id

<a id="get-v1apiidentityresultrequest_id"></a>

- 설명: 본인인증 결과를 마스킹하여 조회한다.
- 인증: JWT 선택
- 사용 예제:

```bash
curl "http://localhost:3000/v1/identity/result/a1b2c3d4...64자hex"
```

- 경로 파라미터:

| 필드         | 타입   | 설명                    |
| ------------ | ------ | ----------------------- |
| `request_id` | string | 인증 요청 ID (64자 hex) |

- 성공 응답 (200):

```json
{
    "ok": true,
    "data": {
        "status": "verified",
        "name": "홍*동",
        "birthDate": "1990****",
        "gender": "M",
        "phone": "010****5678",
        "verifiedAt": "2025-01-15T10:30:00+09:00",
        "isDuplicate": false,
        "accountLinked": true
    }
}
```

- 마스킹 규칙:

| 필드        | 규칙                                 |
| ----------- | ------------------------------------ |
| `name`      | 첫/끝 글자 유지, 중간 `*` ("홍\*동") |
| `birthDate` | 앞 4자리(연도) 유지, 뒤 `****`       |
| `phone`     | 앞 3자리 + `****` + 뒤 4자리         |

- 에러 응답:

| 코드 | 조건                             |
| ---- | -------------------------------- |
| 400  | `request_id` 누락 또는 형식 오류 |
| 404  | 요청 없음                        |
| 503  | Identity 플러그인 비활성화       |

---

### POST /v1/identity/verify-ci

<a id="post-v1apiidentityverify-ci"></a>

- 설명: CI 해시로 이미 가입된 계정이 있는지 확인한다.
- 인증: JWT 필수
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/identity/verify-ci" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer eyJhbGci..." \
     -d '{"ci_hash": "e3b0c44298fc..."}'
```

- 요청 Body:

| 필드      | 타입   | 필수 | 설명                         |
| --------- | ------ | ---- | ---------------------------- |
| `ci_hash` | string | ✅   | CI의 SHA-256 해시 (64자 hex) |

- 성공 응답 (200):

```json
{
    "ok": true,
    "data": {
        "exists": true,
        "account_seq": 12345
    }
}
```

- 에러 응답:

| 코드 | 조건                       |
| ---- | -------------------------- |
| 400  | `ci_hash` 누락             |
| 500  | 조회 실패                  |
| 503  | Identity 플러그인 비활성화 |

---

## 프론트엔드 연동 예제

```html
<script>
    async function startVerification() {
        // 1. 인증 요청 생성
        const res = await fetch("/v1/identity/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ purpose: "signup", method: "popup" }),
        });
        const { data } = await res.json();

        // 2. 인증 팝업 열기
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.popup_url;
        form.target = "identity_popup";

        const fields = { enc_data: data.enc_data };
        if (data.token_version_id)
            fields.token_version_id = data.token_version_id;
        if (data.integrity_value) fields.integrity_value = data.integrity_value;

        for (const [k, v] of Object.entries(fields)) {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = k;
            input.value = v;
            form.appendChild(input);
        }

        document.body.appendChild(form);
        window.open("", "identity_popup", "width=500,height=600");
        form.submit();
        form.remove();

        // 3. 결과 수신
        window.addEventListener("message", async (e) => {
            if (e.data?.type === "identity_verification") {
                if (e.data.status === "verified") {
                    const result = await fetch(
                        `/v1/identity/result/${e.data.request_id}`,
                    );
                    const { data } = await result.json();
                    console.log("인증 결과:", data);
                }
            }
        });
    }
</script>
```

## 정규화 규칙

### 성별 (gender)

| 입력 값                         | 정규화 결과 |
| ------------------------------- | ----------- |
| `"0"`, `"M"`, `"m"`, `"male"`   | `"M"`       |
| `"1"`, `"F"`, `"f"`, `"female"` | `"F"`       |
| 기타                            | 원본 반환   |

### 통신사 (carrier)

| 입력 값       | 정규화 결과  |
| ------------- | ------------ |
| `"1"`, `"01"` | `"SKT"`      |
| `"2"`, `"02"` | `"KT"`       |
| `"3"`, `"03"` | `"LGU"`      |
| `"4"`, `"04"` | `"MVNO_SKT"` |
| `"5"`, `"05"` | `"MVNO_KT"`  |
| `"6"`, `"06"` | `"MVNO_LGU"` |
| 기타          | 원본 반환    |

### 국적 (nationality)

| 입력 값                | 정규화 결과 |
| ---------------------- | ----------- |
| `"0"`, `"local"`, `""` | `"local"`   |
| `"1"`, `"foreign"`     | `"foreign"` |
| 기타                   | 원본 반환   |

## 관련 문서

- [Account Routes](./account-routes.md)
- [Alimtalk Routes](./alimtalk-routes.md)
- [Email Verification](./email-verification.md)
- [Friendtalk Routes](./friendtalk-routes.md)
- [Holidays Routes](./holidays-routes.md)
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
