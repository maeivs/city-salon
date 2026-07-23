# 스케줄 추가 가이드

`dormancy`는 `app/schedules`에 새 스케줄을 추가할 때의 기준 샘플이다.

기준 파일: `src/app/schedules/dormancy/index.ts`

---

## 1) 폴더 구조

`{name}`은 새 스케줄 이름이다 (예: `subscription-reminder`, `stats-aggregator`).

```text
src/app/schedules/{name}/
├── config.json          — 런타임 설정 (Git에서 제외, .gitignore 추가 권장)
├── config.example.json  — 기본값 예시 (Git에 포함)
└── index.ts             — 진입점, start() / stop() export 필수
```

복잡한 배치 로직은 파일을 분리할 수 있다.

```text
src/app/schedules/{name}/
├── config.json
├── config.example.json
├── index.ts     — 스케줄 등록, start() / stop()
├── service.ts   — 실제 배치 로직 (페이징 조회, 처리, 이메일 등)
└── types.ts     — Config 인터페이스, Row 타입
```

---

## 2) 파일 역할

| 파일                  | 역할                                                         |
| --------------------- | ------------------------------------------------------------ |
| `config.json`         | `enabled`, `cron`, 기타 파라미터. 없으면 코드 내 기본값 사용 |
| `config.example.json` | config.json의 샘플. 코드에서 읽지 않음, 문서용               |
| `index.ts`            | `start()` / `stop()` 구현. 크론 등록, 락 획득, 배치 호출     |
| `service.ts` (선택)   | 비즈니스 배치 로직 (entityServer 호출, DB 쿼리, 이메일 등)   |
| `types.ts` (선택)     | Config 인터페이스, DB Row 타입                               |

---

## 3) `config.json` 규칙

필드는 스케줄마다 자유롭게 정의한다. `enabled`와 `cron` 만 공통 관례이며
나머지는 비즈니스 요구에 따라 추가한다.

```json
{
    "enabled": false,
    "cron": "0 3 * * *"
}
```

`enabled: false` 이면 `start()` 내부에서 즉시 반환해 크론을 등록하지 않는다.  
`config.json`이 없으면 코드 내 기본값으로 동작한다.

---

## 4) `index.ts` 최소 구현 (dormancy 패턴)

```ts
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCron, logger, type CronHandle } from "@system/api";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface MyConfig {
    enabled: boolean;
    cron: string;
    // ...비즈니스 파라미터
}

function loadConfig(): MyConfig {
    const configPath = resolve(__dirname, "config.json");
    let raw: Record<string, unknown> = {};
    if (existsSync(configPath)) {
        raw = JSON.parse(readFileSync(configPath, "utf-8"));
    }
    return {
        enabled: raw.enabled === true,
        cron: String(raw.cron || "0 3 * * *"),
    };
}

let cronHandle: CronHandle | null = null;

export function start(): void {
    const cfg = loadConfig();
    if (!cfg.enabled) {
        logger.info("{name} scheduler disabled");
        return;
    }

    cronHandle = createCron({
        expression: cfg.cron,
        onTick: async () => {
            try {
                // 배치 로직
            } catch (err) {
                logger.error({ err }, "{name} batch failed");
            }
        },
    });

    logger.info(
        { cron: cfg.cron, next: cronHandle.nextRun },
        "{name} scheduler started",
    );
}

export function stop(): void {
    cronHandle?.stop();
    cronHandle = null;
}
```

---

## 5) 분산 락 (멀티인스턴스 중복 방지)

여러 인스턴스가 동시에 실행될 수 있는 환경이라면 `acquireLock` / `releaseLock`을
사용한다. `privacy_cron_lock` 엔티티의 unique constraint를 이용한 슬롯 기반 락이다.

```ts
import { acquireLock, releaseLock } from "@system/api";

const LOCK_TTL_SEC = 86_400; // 24시간 슬롯 (일 1회 배치)

const execute = async () => {
    const locked = await acquireLock("my-schedule:job-name", LOCK_TTL_SEC);
    if (!locked) return; // 다른 인스턴스에서 이미 실행 중

    try {
        await runBatch(cfg);
    } catch (err) {
        logger.error({ err }, "Batch failed");
    } finally {
        await releaseLock("my-schedule:job-name", LOCK_TTL_SEC);
    }
};
```

> **락 키 규칙**: `{도메인}:{job-name}` 형태로 지정한다.  
> 예: `"privacy:password_expiry"`, `"stats:daily"`, `"subscription:reminder"`

단일 인스턴스 환경이거나 중복 실행이 무해한 배치는 락을 생략해도 된다.

---

## 6) 페이징 배치 패턴

대량 데이터를 처리할 때는 페이징으로 처리한다. `entityServer.list()`의 기본 limit은 서버 설정에 따라 다르므로 명시적으로 지정한다.

```ts
import { entityServer } from "@system/api";

async function processBatch(): Promise<number> {
    let page = 1;
    const limit = 500;
    let processed = 0;

    while (true) {
        const result = await entityServer.list<MyRow>("my_entity", {
            conditions: { status: "active" },
            page,
            limit,
        });

        const items = result?.data?.items;
        if (!items || items.length === 0) break;

        for (const item of items) {
            // 항목별 처리
            processed++;
        }

        const total = result?.data?.total ?? 0;
        if (page * limit >= total) break;
        page++;
    }

    return processed;
}
```

---

## 7) 이메일 발송

이메일 템플릿을 사용하는 스케줄은 `sendEmail` 과 `setTemplateDir`을 함께 사용한다.

```ts
import { sendEmail, setTemplateDir } from "@system/api";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function ensureTemplateDir(): void {
    const appServerRoot = resolve(__dirname, "..", "..", "..", "..");
    setTemplateDir(join(appServerRoot, "templates", "email"));
}

// start() 내에서 호출
ensureTemplateDir();

// 발송
await sendEmail({
    to: [account.email],
    subject: "제목",
    templateName: "account/my_template", // templates/email/account/my_template.html
    templateData: {
        name: account.name,
        action_url: "https://example.com/action",
    },
});
```

템플릿 파일 위치: `templates/email/{templateName}.html`

---

## 8) 등록 경로 규칙

`src/app/schedules/{name}/index.ts`에 파일이 있으면 서버 시작 시 자동으로 로드된다.

- `start()` / `stop()` 둘 다 없으면 경고 로그를 남기고 스킵된다.
- 로드 순서: 알파벳(폴더명) 순.
- `start()`는 `onReady` 시점에, `stop()`은 `onClose` 시점에 호출된다.

---

## 9) 문서 업데이트 규칙

새 스케줄을 추가하면 다음을 업데이트한다.

1. `docs/schedules/{name}.md` — 스케줄 동작·설정·이메일 템플릿 변수 설명
2. `src/app/schedules/README.md` 스케줄 목록 테이블에 행 추가

---

## 기존 스케줄 참고

| 스케줄           | 분산 락 | 페이징 | 이메일 | 설명                      |
| ---------------- | ------- | ------ | ------ | ------------------------- |
| `dormancy`       | ✓       | ✓      | ✓      | 휴면 전환·경고            |
| `data-retention` | ✓       | ✓      | ✗      | 데이터 삭제 (이메일 없음) |
