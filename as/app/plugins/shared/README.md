# Shared (공유 리소스)

플러그인 간 공유가 필요한 유틸리티나 타입을 두는 공용 폴더입니다.

---

## 포함 모듈

### `solapi-auth.ts` — Solapi HMAC 서명 생성

Solapi SMS·알림톡 API 요청 시 `Authorization` 헤더를 생성합니다.

**사용처:** SMS, Alimtalk 등 Solapi를 공통으로 사용하는 플러그인

**인증 방식:** HMAC-SHA256

```text
Authorization: HMAC-SHA256 apiKey={apiKey}, date={date}, salt={salt}, signature={signature}
```

**사용 예시:**

```typescript
import { buildSolapiAuthorization } from "@/app/plugins/shared/solapi-auth.ts";

const headers = buildSolapiAuthorization(apiKey, apiSecret);
```

---

공유 유틸리티가 필요할 경우 이 폴더에 추가하고 관련 플러그인에서 import합니다.
