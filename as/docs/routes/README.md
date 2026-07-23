# 앱서버 담당 엔드포인트 전체 목록

> **라우트 우선순위**: `plugins/*/routes.ts` 및 `routes/*/route.ts`에 등록된 경로는
> Go 서버 패스스루보다 **항상 먼저 처리**됩니다.
> Go 서버가 제공하는 API 경로와 동일한 경로를 앱 서버에 정의하면 앱 서버가 우선 처리합니다.
> 자세한 내용: [라우트 추가 가이드 §6](how-to-create.md#6-go-서버-패스스루-오버라이드)

---

## 계정

> 상세: [account-routes.md](account-routes.md)

| 앱서버 경로                     | 설명                                               |
| ------------------------------- | -------------------------------------------------- |
| `POST /v1/account/register` | 회원가입 + 이메일 인증 발송                        |
| `POST /v1/account/withdraw` | 이메일 확보 → Go 익명화 내부 호출 → 완료 메일 발송 |

---

## 2FA (TOTP)

> 상세: [account-routes.md](account-routes.md)

| 앱서버 경로                                    | 설명                 |
| ---------------------------------------------- | -------------------- |
| `POST /v1/account/2fa/setup`               | TOTP 설정            |
| `POST /v1/account/2fa/setup/verify`        | TOTP 활성화 확인     |
| `DELETE /v1/account/2fa`                   | 2FA 비활성화         |
| `GET /v1/account/2fa/status`               | 2FA 상태 조회        |
| `POST /v1/account/2fa/verify`              | TOTP 검증 (2단계)    |
| `POST /v1/account/2fa/recovery`            | 리커버리 코드 로그인 |
| `POST /v1/account/2fa/recovery/regenerate` | 리커버리 코드 재생성 |

---

## OAuth 소셜 로그인

> 상세: [account-routes.md](account-routes.md)

| 앱서버 경로                                 | 설명                  |
| ------------------------------------------- | --------------------- |
| `GET /v1/oauth/:provider`               | OAuth 리다이렉트      |
| `GET/POST /v1/oauth/:provider/callback` | OAuth 콜백 → JWT 발급 |

---

## OAuth 계정 연동

> 상세: [account-routes.md](account-routes.md)

| 앱서버 경로                                    | 설명                   |
| ---------------------------------------------- | ---------------------- |
| `POST /v1/account/oauth/link`              | OAuth 프로바이더 연동  |
| `DELETE /v1/account/oauth/link/:provider`  | OAuth 연동 해제        |
| `GET /v1/account/oauth/providers`          | 연동된 프로바이더 목록 |
| `POST /v1/account/oauth/refresh/:provider` | OAuth 토큰 갱신        |

---

## 이메일 인증

> 상세: [email-verification.md](email-verification.md)

| 앱서버 경로                         | 설명                |
| ----------------------------------- | ------------------- |
| `POST /v1/email-verify/send`    | 인증 코드/링크 발송 |
| `POST /v1/email-verify/confirm` | 인증 코드 확인      |
| `GET /v1/email-verify/activate` | 링크 클릭 인증      |
| `GET /v1/email-verify/status`   | 인증 상태 조회      |
| `POST /v1/email-verify/change`  | 이메일 변경         |

---

## 비밀번호 재설정

> 상세: [password-reset.md](password-reset.md)

| 앱서버 경로                           | 설명             |
| ------------------------------------- | ---------------- |
| `POST /v1/password-reset/request` | 재설정 메일 발송 |
| `GET /v1/password-reset/validate` | 토큰 유효성 확인 |
| `POST /v1/password-reset/verify`  | 새 비밀번호 설정 |

---

## Push 알림

> 상세: [push-routes.md](push-routes.md) · 설정/운영: [../plugins/push.md](../plugins/push.md)

| 앱서버 경로                       | 설명                          |
| --------------------------------- | ----------------------------- |
| `POST /v1/push/device`        | 디바이스 토큰 등록/갱신       |
| `DELETE /v1/push/device/:seq` | 디바이스 푸시 수신 비활성화   |
| `POST /v1/push/send`          | Push 발송 (단일 계정)         |
| `POST /v1/push/broadcast`     | Push 브로드캐스트 (다중 계정) |
| `GET /v1/push/status/:seq`    | 발송 상태 조회 안내           |

---

## Realtime / WebSocket

> 상세: [realtime-routes.md](realtime-routes.md)

| 앱서버 경로          | 설명                           |
| -------------------- | ------------------------------ |
| `GET /v1/realtime` | 인증된 계정 realtime 채널 연결 |

---

## SMS

> 상세: [sms-routes.md](sms-routes.md) · 설정/운영: [../plugins/sms.md](../plugins/sms.md)

| Method | 앱서버 경로                       | 설명           |
| ------ | --------------------------------- | -------------- |
| POST   | `/v1/sms/send`                | SMS 발송       |
| GET    | `/v1/sms/status/:seq`         | 발송 상태 조회 |
| POST   | `/v1/sms/verification/send`   | 인증번호 발송  |
| POST   | `/v1/sms/verification/verify` | 인증번호 검증  |

---

## SMTP 메일

> 상세: [smtp-routes.md](smtp-routes.md) · 설정/운영: [../plugins/smtp.md](../plugins/smtp.md)

| Method | 앱서버 경로                | 설명                            |
| ------ | -------------------------- | ------------------------------- |
| POST   | `/v1/smtp/send`        | 로컬 템플릿 렌더링 후 메일 발송 |
| GET    | `/v1/smtp/status/:seq` | 발송 상태 조회                  |

> 위 경로 외의 `/v1/smtp/*` 는 Go 서버로 패스스루됩니다.

---

## 알림톡 (Alimtalk)

> 상세: [alimtalk-routes.md](alimtalk-routes.md) · 설정/운영: [../plugins/alimtalk.md](../plugins/alimtalk.md)

| Method | 앱서버 경로                          | 설명             |
| ------ | ------------------------------------ | ---------------- |
| POST   | `/v1/alimtalk/send`              | 알림톡 발송      |
| GET    | `/v1/alimtalk/status/:seq`       | 발송 상태 조회   |
| GET    | `/v1/alimtalk/templates`         | 템플릿 목록 조회 |
| POST   | `/v1/alimtalk/webhook/:provider` | 공급사 웹훅 수신 |

---

## 친구톡 (Friendtalk)

> 상세: [friendtalk-routes.md](friendtalk-routes.md) · 설정/운영: [../plugins/friendtalk.md](../plugins/friendtalk.md)

| Method | 앱서버 경로               | 설명        |
| ------ | ------------------------- | ----------- |
| POST   | `/v1/friendtalk/send` | 친구톡 발송 |

---

## PG 결제

> 상세: [pg-routes.md](pg-routes.md) · 설정/운영: [../plugins/pg.md](../plugins/pg.md)

| Method | 앱서버 경로                         | 설명                      |
| ------ | ----------------------------------- | ------------------------- |
| POST   | `/v1/pg/orders`                 | 주문 생성                 |
| GET    | `/v1/pg/orders/:orderId`        | 주문 단건 조회            |
| POST   | `/v1/pg/confirm`                | 결제 승인                 |
| POST   | `/v1/pg/orders/:orderId/cancel` | 결제 취소                 |
| POST   | `/v1/pg/orders/:orderId/sync`   | 결제 상태 동기화          |
| POST   | `/v1/pg/webhook`                | PG 웹훅 수신              |
| GET    | `/v1/pg/config`                 | 클라이언트 결제 설정 조회 |

---

## 세금계산서 (Tax Invoice)

> 상세: [tax-invoice-routes.md](tax-invoice-routes.md) · 설정/운영: [../plugins/taxinvoice.md](../plugins/taxinvoice.md)

| Method | 앱서버 경로                      | 설명                              |
| ------ | -------------------------------- | --------------------------------- |
| POST   | `/v1/taxinvoice`             | 세금계산서 등록/발행 요청(레거시) |
| POST   | `/v1/taxinvoice/register`    | 세금계산서 등록                   |
| POST   | `/v1/taxinvoice/:seq/issue`  | 등록 건 발행                      |
| POST   | `/v1/taxinvoice/:seq/cancel` | 발행 취소                         |
| GET    | `/v1/taxinvoice/:seq/state`  | 발행 상태 조회                    |
| GET    | `/v1/taxinvoice/:seq`        | 상세 조회                         |

---

## LLM

> 상세: [llm-routes.md](llm-routes.md) · 설정/운영: [../plugins/llm.md](../plugins/llm.md)

| Method | 앱서버 경로                               | 설명                            |
| ------ | ----------------------------------------- | ------------------------------- |
| POST   | `/v1/llm/chat`                        | 일반 채팅 응답 생성             |
| POST   | `/v1/llm/chat/stream`                 | 스트리밍 채팅 응답              |
| POST   | `/v1/llm/conversations`               | 대화 세션 생성                  |
| POST   | `/v1/llm/conversations/:seq/messages` | 대화 메시지 전송                |
| GET    | `/v1/llm/conversations`               | 대화 세션 목록                  |
| GET    | `/v1/llm/conversations/:seq`          | 대화 세션 상세                  |
| PATCH  | `/v1/llm/conversations/:seq`          | 대화 세션 정보 수정             |
| DELETE | `/v1/llm/conversations/:seq`          | 대화 세션 삭제                  |
| POST   | `/v1/llm/rag/documents`               | RAG 문서 업로드                 |
| GET    | `/v1/llm/rag/documents`               | RAG 문서 목록                   |
| DELETE | `/v1/llm/rag/documents/:id`           | RAG 문서 삭제                   |
| POST   | `/v1/llm/rag/search`                  | RAG 검색                        |
| POST   | `/v1/llm/rag/chat`                    | RAG 기반 채팅                   |
| POST   | `/v1/llm/rag/chat/stream`             | RAG 스트리밍 채팅               |
| POST   | `/v1/llm/rag/rebuild-index`           | RAG 인덱스 재구성               |
| GET    | `/v1/llm/providers`                   | 사용 가능한 LLM 프로바이더 조회 |
| GET    | `/v1/llm/usage`                       | LLM 사용량 상세                 |
| GET    | `/v1/llm/usage/summary`               | LLM 사용량 요약                 |
| GET    | `/v1/llm/cache/stats`                 | 캐시 통계 조회                  |

---

## OCR

> 상세: [ocr-routes.md](ocr-routes.md) · 설정/운영: [../plugins/ocr.md](../plugins/ocr.md)

| Method | 앱서버 경로                    | 설명                 |
| ------ | ------------------------------ | -------------------- |
| POST   | `/v1/ocr/recognize`        | OCR 동기 인식        |
| POST   | `/v1/ocr/recognize/async`  | OCR 비동기 인식      |
| POST   | `/v1/ocr/:docType`         | 문서 유형별 OCR 인식 |
| GET    | `/v1/ocr/results`          | OCR 결과 목록 조회   |
| GET    | `/v1/ocr/results/:id`      | OCR 결과 단건 조회   |
| GET    | `/v1/ocr/results/:id/text` | OCR 텍스트 추출 조회 |
| DELETE | `/v1/ocr/results/:id`      | OCR 결과 삭제        |
| GET    | `/v1/ocr/quota`            | OCR 사용량/쿼터 조회 |

---

## 본인인증 (Identity)

> 상세: [identity-routes.md](identity-routes.md) · 설정/운영: [../plugins/identity.md](../plugins/identity.md)

| Method | 앱서버 경로                           | 설명             |
| ------ | ------------------------------------- | ---------------- |
| POST   | `/v1/identity/request`            | 인증 요청 생성   |
| POST   | `/v1/identity/callback`           | 중계사 콜백 수신 |
| GET    | `/v1/identity/result/:request_id` | 인증 결과 조회   |
| POST   | `/v1/identity/verify-ci`          | CI 중복 확인     |

---

## 공휴일 (Holidays)

> 상세: [holidays-routes.md](holidays-routes.md) · 설정/운영: [../plugins/holidays.md](../plugins/holidays.md)

| Method | 앱서버 경로                 | 설명                        |
| ------ | --------------------------- | --------------------------- |
| GET    | `/v1/holidays`          | 공휴일 목록 조회            |
| GET    | `/v1/holidays/:locdate` | 특정 날짜 공휴일 단건 조회  |
| POST   | `/v1/holidays/sync`     | 수동 동기화 트리거 (관리자) |
