# 플러그인 추가 가이드

`holidays` 플러그인이 기준 샘플이다. 새 플러그인도 같은 패턴으로 구성한다.

기준 파일: `src/app/plugins/holidays/`

---

## 1) 폴더 구조

`{plugin}`은 새 플러그인 이름(예: `sms`, `push`)이다.

```text
src/app/plugins/{plugin}/
├── config.json          — 활성화 여부 + 설정값 (enabled: true/false)
├── config.example.json  — 설정 예시 (빌드 시 config.json 으로 배포)
├── config.ts            — config.json 로더 (enabled: false 이면 null 반환)
├── index.ts             — 플러그인 진입점 (fastify-plugin 래퍼)
├── routes.ts            — /v1/{plugin}/* 라우트 테이블 (선택)
├── handlers.ts          — 요청/응답 처리 (선택)
├── service.ts           — 비즈니스 로직
├── types/
│   └── index.ts         — 타입 정의 + re-export
└── providers/           — 외부 서비스 클라이언트 (여러 구현체가 있을 때)
    ├── index.ts         — 프로바이더 팩토리
    └── {name}.ts        — 개별 프로바이더 구현
```

---

## 2) 파일 역할

- `config.json`: `enabled: false` 이면 플러그인이 로드되지 않는다.
- `config.example.json`: 빌드 시 `config.json`으로 교체되어 배포된다. 실제 `config.json`은 Git에 커밋하지 않는다.
- `config.ts`: `config.json`을 읽어 타입이 적용된 설정 객체를 반환한다. `enabled: false` 또는 파일 없으면 `null` 반환.
- `index.ts`: `fastify-plugin`(`fp()`)으로 래핑된 플러그인 진입점. `config.ts`로 설정을 로드하고 `app.decorate()`로 서비스를 등록한다.
- `routes.ts`: URL 매핑 테이블. `index.ts`에서 `app.register()`로 등록한다. HTTP API가 필요없으면 생략한다.
- `service.ts`: 외부 API 호출·DB 쿼리 등 실제 비즈니스 로직.
- `providers/`: 동일 기능의 여러 구현체(예: OpenAI·Claude·Gemini)가 있을 때 분리한다.

---

## 3) `config.ts` 패턴

```ts
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@system/api";
import type { MyPluginConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

export function loadMyPluginConfig(): MyPluginConfig | null {
    if (!existsSync(CONFIG_PATH)) return null;

    try {
        let raw = readFileSync(CONFIG_PATH, "utf-8");
        // 환경변수 치환: ${VAR} → process.env.VAR
        raw = raw.replace(
            /\$\{([^}]+)\}/g,
            (_m, name) => process.env[name] ?? "",
        );
        const cfg = JSON.parse(raw) as MyPluginConfig;
        if (cfg.enabled === false) {
            logger.info("MyPlugin disabled in config");
            return null;
        }
        return cfg;
    } catch (err) {
        logger.error({ err }, "Failed to load MyPlugin config");
        return null;
    }
}
```

---

## 4) `index.ts` 패턴

```ts
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadMyPluginConfig } from "./config.ts";
import { MyService } from "./service.ts";

declare module "fastify" {
    interface FastifyInstance {
        myService: MyService | null;
    }
}

export default fp(
    async (app: FastifyInstance) => {
        const config = loadMyPluginConfig();
        if (!config) {
            app.decorate("myService", null);
            return;
        }

        const service = new MyService(config);
        app.decorate("myService", service);

        // HTTP 라우트가 있으면 등록
        const { default: routes } = await import("./routes.ts");
        await app.register(routes, { prefix: "/v1/my-plugin" });
    },
    { name: "my-plugin" },
);
```

> `fp()`로 래핑하지 않으면 `app.decorate()`가 자식 스코프에만 적용되어 다른 플러그인에서 접근할 수 없다.

---

## 5) `config.json` / `config.example.json`

`config.json` (실제 설정, Git 제외):

```json
{
    "enabled": false,
    "apiKey": "${MY_PLUGIN_API_KEY}"
}
```

`config.example.json` (빌드 배포용):

```json
{
    "enabled": false,
    "apiKey": "${MY_PLUGIN_API_KEY}"
}
```

`${ENV_VAR}` 형태로 환경변수를 참조하면 `config.ts`가 런타임에 치환한다.

---

## 6) 자동 로드 조건

`src/app/plugins/{plugin}/index.ts` 파일이 있으면 서버 시작 시 알파벳 순으로 자동 로드된다. 별도 등록 코드가 필요없다.

## 관련 문서

- [라우트 추가 가이드](../routes/how-to-create.md)
- [설정 파일 가이드](../configs.md)
