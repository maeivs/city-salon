# app/schedules/

백그라운드 크론 스케줄 모음. 서버 시작 시 폴더명 알파벳 순으로 자동 로드됩니다.

## 구조

```
{name}/
├── config.json          — 스케줄러 활성화 여부·cron 표현식 등
├── config.example.json  — 설정 예시 (config.json 없을 때 복사해 사용)
└── index.ts             — start() / stop() export 필수
```

복잡한 스케줄은 단일 `index.ts` 대신 분할할 수 있습니다.

```
{name}/
├── config.json
├── config.example.json
├── index.ts     — 진입점·스케줄 등록
├── service.ts   — 핵심 배치 로직
└── types.ts     — 설정·Row 타입 정의
```

## 핵심 규칙

- `index.ts`는 반드시 `start()` / `stop()` 함수를 named export해야 합니다.
- `config.json`의 `enabled: false` 이면 `start()` 내부에서 early return합니다.
- 분산 환경(멀티인스턴스)에서 중복 실행 방지가 필요하면 `acquireLock` / `releaseLock`을 사용합니다.
- Fastify `onReady` 훅(start) / `onClose` 훅(stop) 이 자동으로 호출됩니다.

## index.ts 최소 패턴

```ts
import { createCron, logger, type CronHandle } from "@system/api";

let cronHandle: CronHandle | null = null;

export function start(): void {
    const cfg = loadConfig();
    if (!cfg.enabled) return;

    cronHandle = createCron({
        expression: cfg.cron,
        onTick: async () => {
            // 배치 로직
        },
    });

    logger.info({ cron: cfg.cron }, "{name} scheduler started");
}

export function stop(): void {
    cronHandle?.stop();
    cronHandle = null;
}
```

## 스케줄 목록

| 스케줄              | 기본 cron      | 설명                                     | 문서                                                      |
| ------------------- | -------------- | ---------------------------------------- | --------------------------------------------------------- |
| `dormancy`          | `0 2 * * *`    | 장기 미접속 계정 휴면 전환·경고          | [docs](../../../docs/schedules/dormancy-and-retention.md) |
| `data-retention`    | `30 2 * * *`   | 개인정보 보유 기간 만료 데이터 삭제      | [docs](../../../docs/schedules/dormancy-and-retention.md) |
| `ais_sync`          | `*/10 * * * *` | 전세계 AIS 선박 위치 수집 (aisstream.io) | —                                                         |
| `kobc_freight_sync` | `0 6 * * *`    | KOBC 해운 운임지수 수집                  | —                                                         |
| `vessel_kr_sync`    | `0 3 * * *`    | 해양수산부 선박 입항 정보 수집           | —                                                         |

## cron 표현식

```
┌─────── 분 (0-59)
│ ┌───── 시 (0-23)
│ │ ┌─── 일 (1-31)
│ │ │ ┌─ 월 (1-12)
│ │ │ │ ┌ 요일 (0-7, 0·7=일요일)
│ │ │ │ │
0 2 * * *
```

### 자주 쓰는 패턴

| 표현식           | 실행 시점                    |
| ---------------- | ---------------------------- |
| `0 2 * * *`      | 매일 02:00                   |
| `0 3 * * *`      | 매일 03:00                   |
| `0 */6 * * *`    | 6시간마다 (00:00, 06:00 ...) |
| `*/30 * * * *`   | 30분마다                     |
| `0 9 * * 1`      | 매주 월요일 09:00            |
| `0 9 1 * *`      | 매월 1일 09:00               |
| `0 9 1,15 * *`   | 매월 1일·15일 09:00          |
| `0 9-18 * * 1-5` | 평일 09:00~18:00 매시 정각   |

### 주의사항

- 시간은 **서버 로컬 타임** 기준이다. 서버 타임존을 확인하고 cron을 설정한다.
- 멀티인스턴스 환경에서는 `acquireLock`을 사용해 중복 실행을 방지한다.
- cron 표현식은 서버 재시작 없이 `config.json`만 수정하면 변경된다.

---

## 상세 문서

- [스케줄 추가 가이드](../../../docs/schedules/how-to-create.md)
- [휴면·데이터 보존 스케줄](../../../docs/schedules/dormancy-and-retention.md)
