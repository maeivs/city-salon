# nts-businessman 플러그인

국세청 사업자등록정보 진위확인 및 상태조회 공공데이터 API를 AS 라우트로 제공합니다.

## 설정

`config.json`의 `apiKey`는 기본적으로 `.env`의 `DATAGOKR_API_KEY`를 참조합니다.

```json
{
    "enabled": true,
    "apiKey": "${DATAGOKR_API_KEY}",
    "apiBaseUrl": "https://api.odcloud.kr/api/nts-businessman/v1",
    "timeoutMs": 10000,
    "returnType": "JSON"
}
```

## 라우트

### POST /v1/nts-businessman/status

사업자등록 상태를 조회합니다. `b_no`는 최대 100개까지 받을 수 있으며, 하이픈은 AS에서 제거합니다.

```json
{
    "b_no": ["123-45-67890"]
}
```

### POST /v1/nts-businessman/barobill/status

taxinvoice 플러그인의 바로빌 provider 설정을 사용해 `GetCorpStateEx` 또는 `GetCorpStatesEx`로 사업자등록 상태를 조회합니다. `b_no`는 최대 1,000개까지 받을 수 있으며, 하이픈은 AS에서 제거합니다.

```json
{
    "b_no": ["123-45-67890"]
}
```

### POST /v1/nts-businessman/validate

사업자등록 정보를 진위확인합니다. `b_no`, `start_dt`, `p_nm`은 필수입니다.

```json
{
    "businesses": [
        {
            "b_no": "123-45-67890",
            "start_dt": "20200101",
            "p_nm": "홍길동",
            "b_nm": "상호명",
            "b_adr": "서울특별시 강남구"
        }
    ]
}
```
