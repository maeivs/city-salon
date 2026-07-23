# 앱서버 내부 구조

---

## 부트스트랩 순서

```
node system.js
    │
    ▼
system/app.ts
    ├─  1. Fastify 인스턴스 생성
    ├─  2. 보안 기본 — CORS, Helmet, Rate Limit
    ├─  3. 시스템 미들웨어 (middleware/)
    │     requestId → requestSupersede → accessLog → errorHandler → cache
    │     → realtime → auth (JWT verify) → csrf → packetEncrypt → database (Kysely)
    ├─  4. loadHooks() — app/hooks/registry.ts 로드 → 훅 매핑 등록
    ├─  5. loadExtensionPlugins() — app/plugins/** 자동 로드
    │     └─ alimtalk, llm, ocr, pg, identity, taxinvoice 등
    ├─  6. registerEntityInterceptor() — 엔티티 CRUD 인터셉터 등록
    ├─  7. registerRoutes() — app/routes/** 자동 로드
    │     └─ 각 route.ts Fastify 플러그인으로 등록
    ├─  8. registerProxyRoutes() — Entity Server 패스스루 프록시
    │     └─ 위에서 처리되지 않은 /v1/* 경로만 전달
    ├─  9. loadSchedules() — app/schedules/** 자동 로드
    ├─ 10. /v1/health 헬스체크 등록
    └─ 11. 서버 시작 (listen) → 스타트업 배너 출력
```

---

## 요청 처리 흐름 (비즈니스 라우트)

```
HTTP 요청
    │
    ▼
시스템 미들웨어 체인 (middleware/)
    ├─ Helmet (보안 헤더)
    ├─ CORS (origin 검증)
    ├─ Rate Limit
    ├─ Request ID 부여
    ├─ Request Supersede 등록
    ├─ Access Log 기록
    ├─ JWT decode → req.user
    ├─ CSRF (state-changing 요청)
    └─ 패킷 복호화 (설정된 경우)
    │
    ▼
라우트 핸들러
    ├─ preHandler: authRequired (JWT verify, 필요한 라우트만)
    ├─ 비즈니스 로직 실행
    │   ├─ entityServer.* 호출 (SDK)
    │   ├─ dbConn() (Kysely 직접 쿼리)
    │   └─ sendEmail / 외부 API 호출
    └─ 응답 반환
    │
    ▼
HTTP 응답
    └─ 패킷 암호화 (설정된 경우)
```

### 헤더 기반 요청 supersede

- 클라이언트가 `X-Supersede-Key`를 보내면 같은 `ip + user-agent + method + path + header value` 기준으로 이전 in-flight 요청을 중단합니다.
- 이전 요청은 응답 전송 중이어도 스트림을 종료하고, 새 요청은 자신의 `AbortSignal`을 `req.supersedeSignal`로 전달받습니다.
- 비즈니스 라우트는 `req.supersedeSignal`을 자체 `AbortSignal`과 합쳐서 외부 API 호출, 대량 필터링, 캐시 재계산 같은 긴 작업을 빠르게 중단해야 합니다.
- CPU를 오래 점유하는 hot path는 supersede 등록 직후 이벤트 루프에 한 틱 양보해야 거의 동시에 들어온 최신 요청이 이전 요청을 먼저 끊을 수 있습니다.
