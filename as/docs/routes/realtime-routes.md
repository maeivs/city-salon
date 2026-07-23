# Realtime Routes

기준 파일: `src/system/realtime/`

이 문서는 앱서버 WebSocket 엔드포인트, 인증 방식, 메시지 프로토콜, 서버 발송 API 사용법을 다룹니다.
브라우저 클라이언트에서의 권장 사용법은 `entity-client`의 realtime API를 이용하는 것입니다.

## 라우트 목록

| Method | Path                               | 인증 | 설명                              |
| ------ | ---------------------------------- | ---- | --------------------------------- |
| GET    | [/v1/realtime](#get-v1realtime) | JWT  | 인증된 계정 realtime 채널 연결    |

## 라우트 상세

### GET /v1/realtime

<a id="get-v1realtime"></a>

- 설명: HTTP Upgrade 후 WebSocket 세션을 연다. 연결 성공 직후 서버가 `hello` 프레임을 먼저 보낸다.
- **인증 필요**: `access_token`을 query string으로 전달해야 한다.
- 연결 URL 예시:

```text
ws://localhost:3000/v1/realtime?access_token={jwt}
wss://api.example.com/v1/realtime?access_token={jwt}
```

- 연결 직후 서버 응답 예제:

```json
{
  "v": 1,
  "id": "msg_hello_01",
  "ts": "2025-01-01T00:00:00.000Z",
  "type": "hello",
  "channel": "session",
  "event": "session.ready",
  "data": {
    "connection_id": "rt_8c6b9d",
    "account_seq": 1,
    "subscriptions": []
  }
}
```

## 인증 / 연결 규칙

- 인증 토큰은 현재 앱서버가 발급한 access token을 그대로 사용한다.
- 토큰이 없거나 유효하지 않으면 Upgrade 단계에서 연결이 거부된다.
- 한 계정은 여러 브라우저 탭, 여러 디바이스에서 동시에 연결될 수 있다.
- 서버는 계정 단위 발송과 connection 단위 발송을 모두 지원한다.
- 브라우저 세션 연장과 refresh-cookie 관리는 기존 health 흐름이 담당한다. realtime 연결이 이를 대체하지는 않는다.

## 메시지 프로토콜

모든 메시지는 아래 공통 envelope 구조를 사용한다.

| 필드       | 타입                    | 필수 | 설명 |
| ---------- | ----------------------- | ---- | ---- |
| `v`        | number                  | ✅   | 프로토콜 버전. 현재 `1` |
| `id`       | string                  | ✅   | 메시지 고유 ID |
| `ts`       | string                  | ✅   | ISO timestamp |
| `type`     | string                  | ✅   | 메시지 타입 |
| `channel`  | string                  | ✅   | 논리 채널명 |
| `event`    | string                  | ✅   | 이벤트명 |
| `data`     | unknown                 |      | 실제 payload |
| `meta`     | object                  |      | 부가 메타데이터 |
| `reply_to` | string                  |      | 응답 대상 메시지 ID |
| `error`    | object                  |      | 오류 정보 |

### 메시지 타입

| 타입            | 방향 | 설명 |
| --------------- | ---- | ---- |
| `hello`         | 서버 → 클라이언트 | 연결 직후 세션 준비 완료 알림 |
| `event`         | 서버 → 클라이언트 | 일반 도메인 이벤트 |
| `notification`  | 서버 → 클라이언트 | 알림 성격 이벤트 |
| `message`       | 서버 → 클라이언트 | 일반 메시지 |
| `chat`          | 서버 → 클라이언트 | 채팅 메시지 |
| `ack`           | 서버 → 클라이언트 | 명령 수신 확인 |
| `error`         | 서버 → 클라이언트 | 명령 처리 실패 |
| `ping`          | 양방향 | heartbeat 또는 상태 확인 |
| `pong`          | 양방향 | ping 응답 |
| `subscribe`     | 클라이언트 → 서버 | 채널 구독 등록 |
| `unsubscribe`   | 클라이언트 → 서버 | 채널 구독 해제 |

## 클라이언트 명령

현재 클라이언트가 서버에 보내는 명령은 `ping`, `subscribe`, `unsubscribe` 세 가지다.

### subscribe

```json
{
  "v": 1,
  "id": "msg_sub_01",
  "ts": "2025-01-01T00:00:05.000Z",
  "type": "subscribe",
  "channel": "inventory",
  "event": "subscribe",
  "data": {
    "subscriptions": ["inventory", "order"]
  }
}
```

성공 시 서버는 `ack` 프레임으로 현재 구독 목록을 돌려준다.

### unsubscribe

```json
{
  "v": 1,
  "id": "msg_unsub_01",
  "ts": "2025-01-01T00:00:10.000Z",
  "type": "unsubscribe",
  "channel": "inventory",
  "event": "unsubscribe",
  "data": {
    "subscriptions": ["inventory"]
  }
}
```

## 브라우저 사용 예제

### Native WebSocket

```typescript
const socket = new WebSocket(
    `wss://api.example.com/v1/realtime?access_token=${accessToken}`,
);

socket.addEventListener("message", (event) => {
    const envelope = JSON.parse(event.data);
    console.log(envelope.type, envelope.channel, envelope.event, envelope.data);
});

socket.addEventListener("open", () => {
    socket.send(
        JSON.stringify({
            v: 1,
            id: crypto.randomUUID(),
            ts: new Date().toISOString(),
            type: "subscribe",
            channel: "order",
            event: "subscribe",
            data: { subscriptions: ["order"] },
        }),
    );
});
```

### entity-client 권장 사용법

```typescript
import { entityAppServer } from "@ehfuse/entity-client";

entityAppServer.configure({
    baseUrl: import.meta.env.VITE_API_URL,
    realtime: {
        enabled: true,
        autoConnect: true,
        autoReconnect: true,
        reconnectDelayMs: 3000,
    },
});

entityAppServer.addRealtimeStatusListener((change) => {
    console.log("realtime", change.status, change.reason);
});

entityAppServer.addRealtimeEventListener("order.created", (envelope) => {
    console.log("new order", envelope.data);
});

entityAppServer.subscribeRealtime(["order"]);
```

- 로그인 성공 후 access token이 설정되면 자동 연결된다.
- 로그아웃, 토큰 제거, 세션 만료 시 자동으로 연결을 끊는다.
- 수동 제어가 필요하면 `connectRealtime()`, `disconnectRealtime()`, `sendRealtime()`를 직접 호출할 수 있다.

## 서버 발송 API

앱서버 내부 코드에서는 `@system/api`를 통해 realtime 이벤트를 발송한다.

```typescript
import { sendRealtimeToAccount, broadcastRealtime } from "@system/api";

sendRealtimeToAccount(1, {
    type: "event",
    channel: "order",
    event: "order.created",
    data: {
        order_seq: 42,
        status: "pending",
    },
});

broadcastRealtime({
    type: "notification",
    channel: "system",
    event: "system.notice",
    data: {
        message: "오늘 23시에 점검이 시작됩니다.",
    },
});
```

### 제공 함수

| API | 설명 |
| --- | ---- |
| `sendRealtimeToAccount(accountSeq, input)` | 특정 계정의 모든 연결로 전송 |
| `sendRealtimeToConnection(connectionId, input)` | 특정 연결 하나로 전송 |
| `broadcastRealtime(input)` | 전체 연결로 브로드캐스트 |
| `getRealtimeStats()` | 현재 연결 수, 계정 수 조회 |

## 운영 메모

- 이 엔드포인트는 앱서버가 직접 처리하며 Go 서버로 패스스루되지 않는다.
- 인증 주체는 브라우저가 아니라 앱서버다. 프런트는 ES가 아니라 AS의 `/v1/realtime`에 연결해야 한다.
- 서버 푸시 payload는 작고 idempotent하게 유지하는 편이 안전하다. 상세 데이터 조회가 필요하면 이벤트 수신 후 기존 HTTP API를 다시 호출한다.

## 관련 문서

- [system-api.md](../system-api.md) — 서버 발송 API 레퍼런스
- [Push Routes](./push-routes.md)
- [Account Routes](./account-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [← 전체 목록](./README.md)