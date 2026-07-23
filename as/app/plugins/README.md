# app/plugins/

Fastify 플러그인 모음. 서버 시작 시 알파벳 순으로 자동 로드됩니다.

## 구조

```
{plugin}/
├── config.json          — 플러그인 활성화 여부 + 설정값 (enabled: true/false, minify: false)
├── config.example.json  — 설정 예시 (빌드 시 config.json 으로 배포)
├── config.ts            — config.json 로더 (enabled: false 이면 null 반환)
├── index.ts             — Fastify 플러그인 진입점 (fastify-plugin 래퍼)
├── routes.ts            — /v1/{plugin}/* 라우트 테이블
├── handlers.ts          — 요청/응답 처리
├── service.ts           — 비즈니스 로직
├── entity-adapter.ts    — Go 엔티티 서버 쿼리 어댑터 (entityServer 래퍼)
├── types/               — TypeScript 타입 정의
│   └── index.ts
├── entities/            — 플러그인이 사용하는 엔티티 설정 JSON
│   └── {entity_name}.json
└── providers/           — 외부 서비스 클라이언트 (pg·llm·ocr·alimtalk·identity)
    ├── index.ts         — 프로바이더 팩토리
    └── {name}.ts        — 개별 프로바이더 구현
```

## 핵심 규칙

- `config.json`의 `enabled: false` 이면 플러그인이 로드되지 않습니다.
- `index.ts`는 반드시 `fastify-plugin` (`fp()`)으로 래핑해야 합니다.
- `config.example.json`은 빌드 시 `config.json`으로 교체되어 배포됩니다.
- 실제 `config.json`은 Git에 커밋하지 않습니다 (`.gitignore` 적용).

## models/ 폴더 (계획)

> **현재 미구현.** 향후 엔티티 타입 선언을 `models/` 폴더로 통합할 계획입니다.  
> 현재는 타입이 각 플러그인의 `types/` 혹은 `entity-adapter.ts` 에 직접 선언됩니다.

도입 시 아래 구조를 사용할 예정:

| 파일 패턴          | 용도                                                                               | 예시               |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------ |
| `{entity_name}.ts` | **단독 소유** — 플러그인이 생성·관리하는 테이블 전체 타입 (`Table`, `Data`, `Row`) | `account_oauth.ts` |

## entities/ 폴더

플러그인이 의존하는 엔티티 JSON을 `entities/` 폴더에 배치하면,
서버 시작 시 `ensurePluginEntities()`가 자동으로 Go 엔티티 서버에 등록합니다.
이미 등록된 엔티티는 `already_exists`로 스킵되어 덮어씌워지지 않습니다.

```ts
import { ensurePluginEntities } from "@system/api";
import { fileURLToPath } from "url";
import path from "path";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
await ensurePluginEntities(pluginDir);
```

## Go 서버 패스스루 오버라이드

`plugins/{name}/routes.ts` 에 등록된 라우트는 **항상 Go 서버 패스스루보다 먼저 처리**됩니다.

앱 서버의 라우트 로딩 순서:

```
loadExtensionPlugins()  ← plugins/*/index.ts (Fastify 플러그인)
registerRoutes()        ← plugins/*/routes.ts + routes/*/route.ts  ← 여기서 처리되면 Go 서버로 전달되지 않음
registerProxyRoutes()   ← /v1/{prefix}/* 를 Go 서버로 패스스루 (나머지만)
```

예를 들어 `plugins/smtp/routes.ts`에 `POST /send`를 등록하면,
`/v1/smtp/send`는 앱 서버가 직접 처리하고 Go 서버로 전달되지 않습니다.
`/v1/smtp/`의 그 외 경로는 계속 패스스루됩니다.

이 우선순위는 `plugins/`와 `routes/` 모두 동일하게 적용됩니다.

## 배포 제외 (deploy)

`config.json`에 `"deploy": false`를 설정하면 빌드 시 해당 플러그인이 dist에 포함되지 않습니다.
기본값은 `true`입니다. 개발 중이거나 특정 환경에서만 쓰는 플러그인을 배포 빌드에서 제외할 때 사용합니다.

```json
{ "enabled": true, "deploy": false }
```

## 난독화 (minify)

`config.json`에 `"minify": true`를 설정하면 빌드 시 해당 플러그인의 JS 파일만
esbuild로 난독화됩니다. `npm run build:minify-plugins`로 적용됩니다.

```json
{ "enabled": true, "minify": true }
```

## 플러그인 목록

| 플러그인   | 설명                      | 문서                                        |
| ---------- | ------------------------- | ------------------------------------------- |
| 2fa        | TOTP 2단계 인증           | [docs](../../../docs/plugins/2fa.md)        |
| alimtalk   | 카카오 알림톡             | [docs](../../../docs/plugins/alimtalk.md)   |
| example    | 플러그인 개발 템플릿      | —                                           |
| friendtalk | 카카오 친구톡             | [docs](../../../docs/plugins/friendtalk.md) |
| holidays   | 공휴일 자동 동기화        | [docs](../../../docs/plugins/holidays.md)   |
| identity   | 본인인증 (NICE·KMC·Danal) | [docs](../../../docs/plugins/identity.md)   |
| llm        | LLM 연동 (OpenAI 등)      | [docs](../../../docs/plugins/llm.md)        |
| oauth      | 소셜 로그인 + 계정 연동   | [docs](../../../docs/plugins/oauth.md)      |
| ocr        | OCR 문서 인식             | [docs](../../../docs/plugins/ocr.md)        |
| pg         | 결제 PG                   | [docs](../../../docs/plugins/pg.md)         |
| push       | 푸시 알림                 | [docs](../../../docs/plugins/push.md)       |
| sms        | SMS 발송                  | [docs](../../../docs/plugins/sms.md)        |
| taxinvoice | 전자세금계산서            | [docs](../../../docs/plugins/taxinvoice.md) |

## 상세 문서

- [플러그인 추가 가이드](../../../docs/plugins/how-to-create.md)
- [플러그인 구조 가이드](../../../docs/plugins/how-to-create.md)
- [라우트 레퍼런스](../../../docs/routes/README.md)
- [설정 파일 가이드](../../../docs/configs.md)
