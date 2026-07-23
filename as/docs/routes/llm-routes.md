# LLM Routes

기준 파일: `src/app/plugins/llm/routes.ts`

이 문서는 실제 API 호출 중심(라우트표/사용 예제/응답 예제)을 다룹니다.  
플러그인의 개요/설정/운영 가이드는 [LLM Guide](../../plugins/llm.md) 문서를 참고하세요.

## 라우트 목록

| Method | Path                                                                                            | 설명                            |
| ------ | ----------------------------------------------------------------------------------------------- | ------------------------------- |
| POST   | [/v1/llm/chat](#post-v1apillmchat)                                                          | 일반 채팅 응답 생성             |
| POST   | [/v1/llm/chat/stream](#post-v1apillmchatstream)                                             | 스트리밍 채팅 응답              |
| POST   | [/v1/llm/conversations](#post-v1apillmconversations)                                        | 대화 세션 생성                  |
| POST   | [/v1/llm/conversations/:seq/messages](#post-v1apillmconversationsseqmessages)               | 대화 메시지 전송                |
| GET    | [/v1/llm/conversations](#get-v1apillmconversations)                                         | 대화 세션 목록                  |
| GET    | [/v1/llm/conversations/:seq](#get-v1apillmconversationsseq)                                 | 대화 세션 상세                  |
| PATCH  | [/v1/llm/conversations/:seq](#patch-v1apillmconversationsseq)                               | 대화 세션 정보 수정             |
| DELETE | [/v1/llm/conversations/:seq](#delete-v1apillmconversationsseq)                              | 대화 세션 삭제                  |
| POST   | [/v1/llm/rag/documents](#post-v1apillmragdocuments)                                         | RAG 문서 업로드                 |
| GET    | [/v1/llm/rag/documents](#get-v1apillmragdocuments)                                          | RAG 문서 목록                   |
| DELETE | [/v1/llm/rag/documents/:id](#delete-v1apillmragdocumentsid)                                 | RAG 문서 삭제                   |
| POST   | [/v1/llm/rag/search](#post-v1apillmragsearch)                                               | RAG 검색                        |
| POST   | [/v1/llm/rag/chat](#post-v1apillmragchat)                                                   | RAG 기반 채팅                   |
| POST   | [/v1/llm/rag/chat/stream](#post-v1apillmragchatstream)                                      | RAG 스트리밍 채팅               |
| POST   | [/v1/llm/rag/rebuild-index](#post-v1apillmragrebuildindex)                                  | RAG 인덱스 재구성               |
| GET    | [/v1/llm/providers](#get-v1apillmproviders)                                                 | 사용 가능한 LLM 프로바이더 조회 |
| GET    | [/v1/llm/usage](#get-v1apillmusage)                                                         | LLM 사용량 상세                 |
| GET    | [/v1/llm/usage/summary](#get-v1apillmusagesummary)                                          | LLM 사용량 요약                 |
| GET    | [/v1/llm/cache/stats](#get-v1apillmcachestats)                                              | 캐시 통계 조회                  |
| DELETE | [/v1/llm/cache](#delete-v1apillmcache)                                                      | 캐시 비우기                     |
| GET    | [/v1/llm/templates](#get-v1apillmtemplates)                                                 | 프롬프트 템플릿 목록            |
| POST   | [/v1/llm/:name/chat](#post-v1apillmnamechat)                                                | 템플릿 기반 채팅                |
| POST   | [/v1/llm/:name/chat/stream](#post-v1apillmnamechatstream)                                   | 템플릿 기반 스트리밍 채팅       |
| GET    | [/v1/llm/chatbots](#get-v1apillmchatbots)                                                   | 챗봇 목록 조회                  |
| POST   | [/v1/llm/chatbots](#post-v1apillmchatbots)                                                  | 챗봇 생성                       |
| GET    | [/v1/llm/chatbots/:seq](#get-v1apillmchatbotsseq)                                           | 챗봇 상세 조회                  |
| PATCH  | [/v1/llm/chatbots/:seq](#patch-v1apillmchatbotsseq)                                         | 챗봇 수정                       |
| DELETE | [/v1/llm/chatbots/:seq](#delete-v1apillmchatbotsseq)                                        | 챗봇 삭제                       |
| POST   | [/v1/llm/chatbots/:seq/chat](#post-v1apillmchatbotsseqchat)                                 | 챗봇 채팅 (RAG + 히스토리)      |
| POST   | [/v1/llm/chatbots/:seq/chat/stream](#post-v1apillmchatbotsseqchatstream)                    | 챗봇 스트리밍 채팅              |
| GET    | [/v1/llm/chatbots/:seq/sessions](#get-v1apillmchatbotsseqsessions)                          | 챗봇 세션 목록                  |
| DELETE | [/v1/llm/chatbots/:seq/sessions/:sessionSeq](#delete-v1apillmchatbotsseqsessionssessionseq) | 챗봇 세션 삭제                  |
| GET    | [/v1/llm/profiles](#get-v1apillmprofiles)                                                   | Profile Memory 목록 조회        |
| POST   | [/v1/llm/profiles](#post-v1apillmprofiles)                                                  | Profile Memory 항목 추가/수정   |
| DELETE | [/v1/llm/profiles/:seq](#delete-v1apillmprofilesseq)                                        | Profile Memory 항목 삭제        |

## 라우트 상세

### POST /v1/llm/chat

<a id="post-v1apillmchat"></a>

- 설명: 단일 프롬프트로 일반 텍스트 응답을 생성한다.
- 요청 본문:

| 필드          | 타입        | 필수 | 설명                                  |
| ------------- | ----------- | ---- | ------------------------------------- |
| `messages`    | `Message[]` | ✅   | 대화 메시지 배열 (`role`+`content`)   |
| `system`      | string      | -    | 시스템 프롬프트                       |
| `provider`    | string      | -    | LLM 프로바이더 이름 (기본값: default) |
| `max_tokens`  | number      | -    | 최대 생성 토큰 수                     |
| `temperature` | number      | -    | 샘플링 온도 (0.0 ~ 2.0)               |
| `json_mode`   | boolean     | -    | JSON 응답 강제 (기본값: false)        |
| `stop`        | string[]    | -    | 생성 중단 문자열 목록                 |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/llm/chat" \
	-H "Content-Type: application/json" \
	-d '{
		"messages": [{"role": "user", "content": "오늘 회의 내용을 요약해줘"}],
		"system": "당신은 회의 요약 전문가입니다."
	}'
```

### POST /v1/llm/chat/stream

<a id="post-v1apillmchatstream"></a>

- 설명: 토큰 단위로 응답을 스트리밍한다.
- 요청 본문: `/chat`과 동일
- 사용 예제:

```bash
curl -N -X POST "http://localhost:3000/v1/llm/chat/stream" \
	-H "Content-Type: application/json" \
	-d '{
		"messages": [{"role": "user", "content": "스트리밍 테스트"}]
	}'
```

### POST /v1/llm/conversations

<a id="post-v1apillmconversations"></a>

- 설명: 새로운 대화 세션을 생성하고 첫 번째 응답을 반환한다.
- 요청 본문:

| 필드       | 타입   | 필수 | 설명                                         |
| ---------- | ------ | ---- | -------------------------------------------- |
| `message`  | string | ✅   | 첫 번째 사용자 메시지                        |
| `system`   | string | -    | 세션 전체에 적용할 시스템 프롬프트           |
| `provider` | string | -    | LLM 프로바이더 이름 (기본값: default)        |
| `user_seq` | number | -    | 사용자 seq. 지정 시 Profile Memory 자동 주입 |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/llm/conversations" \
	-H "Content-Type: application/json" \
	-d '{
		"message": "고객 환불 정책에 대해 알려줘",
		"system": "당신은 고객 응대 전문가입니다."
	}'
```

### POST /v1/llm/conversations/:seq/messages

<a id="post-v1apillmconversationsseqmessages"></a>

- 설명: 기존 대화 세션에 메시지를 추가하고 응답을 생성한다. 이전 대화 내용이 컨텍스트로 자동 포함된다.
- 요청 본문:

| 필드       | 타입   | 필수 | 설명                                         |
| ---------- | ------ | ---- | -------------------------------------------- |
| `message`  | string | ✅   | 사용자 메시지                                |
| `provider` | string | -    | LLM 프로바이더 이름 (기본값: default)        |
| `user_seq` | number | -    | 사용자 seq. 지정 시 Profile Memory 자동 주입 |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/llm/conversations/101/messages" \
	-H "Content-Type: application/json" \
	-d '{"message":"이전 답변을 표로 정리해줘"}'
```

### GET /v1/llm/conversations

<a id="get-v1apillmconversations"></a>

- 설명: 저장된 대화 세션 목록을 조회한다.
- 쿼리 파라미터:

| 파라미터   | 타입   | 설명                          |
| ---------- | ------ | ----------------------------- |
| `user_seq` | number | 특정 사용자의 세션만 필터링   |
| `provider` | string | 특정 프로바이더 세션만 필터링 |
| `limit`    | number | 반환 개수 (기본값: 20)        |
| `offset`   | number | 페이지 오프셋 (기본값: 0)     |

- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/conversations?user_seq=5&limit=10"
```

### GET /v1/llm/conversations/:seq

<a id="get-v1apillmconversationsseq"></a>

- 설명: 대화 세션 상세 및 메시지 이력을 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/conversations/101"
```

### PATCH /v1/llm/conversations/:seq

<a id="patch-v1apillmconversationsseq"></a>

- 설명: 세션 제목을 수정한다.
- 요청 본문:

| 필드    | 타입   | 필수 | 설명         |
| ------- | ------ | ---- | ------------ |
| `title` | string | ✅   | 새 세션 제목 |

- 사용 예제:

```bash
curl -X PATCH "http://localhost:3000/v1/llm/conversations/101" \
	-H "Content-Type: application/json" \
	-d '{"title":"수정된 제목"}'
```

### DELETE /v1/llm/conversations/:seq

<a id="delete-v1apillmconversationsseq"></a>

- 설명: 대화 세션과 관련 메시지를 삭제한다.
- 사용 예제:

```bash
curl -X DELETE "http://localhost:3000/v1/llm/conversations/101"
```

### POST /v1/llm/rag/documents

<a id="post-v1apillmragdocuments"></a>

- 설명: RAG 검색용 문서를 업로드/등록한다. 내부적으로 청킹·임베딩 처리된다.
- 요청 본문:

| 필드            | 타입                    | 필수 | 설명                               |
| --------------- | ----------------------- | ---- | ---------------------------------- |
| `document_id`   | string                  | ✅   | 문서 고유 식별자                   |
| `title`         | string                  | ✅   | 문서 제목                          |
| `content`       | string                  | ✅   | 문서 본문 텍스트                   |
| `content_type`  | string                  | -    | 문서 유형 (예: `text`, `markdown`) |
| `tenant_id`     | string                  | -    | 멀티테넌트 격리용 식별자           |
| `metadata`      | `Record<string,string>` | -    | 추가 메타데이터 (필터링에 활용)    |
| `provider_name` | string                  | -    | 임베딩에 사용할 프로바이더         |
| `chunk_size`    | number                  | -    | 청크 크기 (기본값: 설정 참조)      |
| `chunk_overlap` | number                  | -    | 청크 중첩 크기 (기본값: 설정 참조) |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/llm/rag/documents" \
	-H "Content-Type: application/json" \
	-d '{
		"document_id": "policy-refund-v1",
		"title": "환불 정책",
		"content": "배송이 3일 이상 지연될 경우 전액 환불이 가능합니다...",
		"tenant_id": "support-docs"
	}'
```

### GET /v1/llm/rag/documents

<a id="get-v1apillmragdocuments"></a>

- 설명: RAG 저장소의 문서 목록을 조회한다.
- 쿼리 파라미터:

| 파라미터       | 타입   | 설명                      |
| -------------- | ------ | ------------------------- |
| `tenant_id`    | string | 테넌트 필터               |
| `content_type` | string | 문서 유형 필터            |
| `limit`        | number | 반환 개수 (기본값: 50)    |
| `offset`       | number | 페이지 오프셋 (기본값: 0) |

- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/rag/documents?tenant_id=support-docs&limit=20"
```

### DELETE /v1/llm/rag/documents/:id

<a id="delete-v1apillmragdocumentsid"></a>

- 설명: 지정한 RAG 문서를 삭제한다.
- 사용 예제:

```bash
curl -X DELETE "http://localhost:3000/v1/llm/rag/documents/doc_001"
```

### POST /v1/llm/rag/search

<a id="post-v1apillmragsearch"></a>

- 설명: 질문과 유사한 RAG 문서 청크를 벡터 검색으로 반환한다.
- 요청 본문:

| 필드            | 타입                    | 필수 | 설명                            |
| --------------- | ----------------------- | ---- | ------------------------------- |
| `query`         | string                  | ✅   | 검색 질의문                     |
| `provider_name` | string                  | -    | 임베딩에 사용할 프로바이더      |
| `top_k`         | number                  | -    | 반환할 최대 결과 수 (기본값: 5) |
| `min_score`     | number                  | -    | 최소 유사도 점수 (기본값: 0.7)  |
| `tenant_id`     | string                  | -    | 테넌트 필터                     |
| `metadata`      | `Record<string,string>` | -    | 메타데이터 필터                 |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/llm/rag/search" \
	-H "Content-Type: application/json" \
	-d '{
		"query": "환불 규정은?",
		"tenant_id": "support-docs",
		"top_k": 3
	}'
```

### POST /v1/llm/rag/chat

<a id="post-v1apillmragchat"></a>

- 설명: RAG 검색 컨텍스트를 시스템 프롬프트에 주입해 채팅 응답을 생성한다. 대화 히스토리는 저장되지 않는다.
- 요청 본문:

| 필드             | 타입                    | 필수 | 설명                                        |
| ---------------- | ----------------------- | ---- | ------------------------------------------- |
| `message`        | string                  | ✅   | 사용자 질의                                 |
| `provider`       | string                  | -    | LLM 프로바이더 (기본값: default)            |
| `system_msg`     | string                  | -    | 커스텀 시스템 프롬프트 (기본 RAG 지침 대체) |
| `embed_provider` | string                  | -    | 임베딩용 프로바이더 (미지정 시 provider)    |
| `top_k`          | number                  | -    | 검색 결과 수 (기본값: 5)                    |
| `min_score`      | number                  | -    | 최소 유사도 점수 (기본값: 0.7)              |
| `tenant_id`      | string                  | -    | 테넌트 필터                                 |
| `metadata`       | `Record<string,string>` | -    | 메타데이터 필터                             |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/llm/rag/chat" \
	-H "Content-Type: application/json" \
	-d '{
		"message": "계약 해지 절차를 알려줘",
		"tenant_id": "support-docs",
		"top_k": 5
	}'
```

### POST /v1/llm/rag/chat/stream

<a id="post-v1apillmragchatstream"></a>

- 설명: RAG 기반 응답을 SSE 스트리밍으로 전송한다.
- 요청 본문: `/rag/chat`과 동일
- 사용 예제:

```bash
curl -N -X POST "http://localhost:3000/v1/llm/rag/chat/stream" \
	-H "Content-Type: application/json" \
	-d '{
		"message": "요약본 만들어줘",
		"tenant_id": "support-docs"
	}'
```

### POST /v1/llm/rag/rebuild-index

<a id="post-v1apillmragrebuildindex"></a>

- 설명: 업로드된 문서 기준으로 벡터 인덱스를 재생성한다.
- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/llm/rag/rebuild-index"
```

### GET /v1/llm/providers

<a id="get-v1apillmproviders"></a>

- 설명: 사용 가능한 LLM 프로바이더 목록과 상태를 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/providers"
```

### GET /v1/llm/usage

<a id="get-v1apillmusage"></a>

- 설명: 기간별 사용량 상세 데이터를 조회한다.
- 쿼리 파라미터:

| 파라미터    | 타입   | 설명                                     |
| ----------- | ------ | ---------------------------------------- |
| `provider`  | string | 특정 프로바이더만 필터링                 |
| `caller`    | string | 호출 서비스 필터                         |
| `date_from` | string | 조회 시작일 (ISO 8601, 예: `2026-03-01`) |
| `date_to`   | string | 조회 종료일 (ISO 8601, 예: `2026-03-31`) |

- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/usage?provider=openai&date_from=2026-03-01&date_to=2026-03-04"
```

### GET /v1/llm/usage/summary

<a id="get-v1apillmusagesummary"></a>

- 설명: 총합 기준 사용량 요약을 조회한다. 쿼리 파라미터는 `/usage`와 동일하다.
- 쿼리 파라미터: `/usage`와 동일 (`provider`, `caller`, `date_from`, `date_to`)
- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/usage/summary?provider=openai"
```

### GET /v1/llm/cache/stats

<a id="get-v1apillmcachestats"></a>

- 설명: 캐시 hit/miss, 항목 수 등 통계를 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/cache/stats"
```

### DELETE /v1/llm/cache

<a id="delete-v1apillmcache"></a>

- 설명: LLM 응답 캐시를 전체 비운다.
- 사용 예제:

```bash
curl -X DELETE "http://localhost:3000/v1/llm/cache"
```

---

## 프롬프트 템플릿 라우트

`templates/llm/prompts/*.json`에 정의된 템플릿을 로드해 `{{variable}}` 치환 후 LLM에 전달한다.  
`system_msg`는 자동으로 시스템 프롬프트로 주입되며, `user_msg`가 없으면 `message` 필드를 직접 전달한다.

### GET /v1/llm/templates

<a id="get-v1apillmtemplates"></a>

- 설명: 등록된 프롬프트 템플릿 목록과 변수 목록을 반환한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/templates"
```

- 응답 예시:

```json
{
    "ok": true,
    "data": [
        {
            "name": "summarize",
            "label": "텍스트 요약",
            "variables": ["text", "max_sentences"]
        },
        {
            "name": "translate",
            "label": "번역",
            "variables": ["text", "target_lang"]
        },
        {
            "name": "extract_json",
            "label": "JSON 추옵",
            "variables": ["schema", "text"]
        }
    ]
}
```

### POST /v1/llm/:name/chat

<a id="post-v1apillmnamechat"></a>

- 설명: 지정 템플릿에 변수를 주입해 LLM 응답을 생성한다.
- `:name`이 등록된 라우트(`chat`, `conversations`, `rag`, ...).와 충돌하지 않는다. Fastify는 정적 세그먼트를 파라미터보다 항상 우선 매칭한다.
- 요청 본문:

| 필드        | 타입                    | 설명                                                       |
| ----------- | ----------------------- | ---------------------------------------------------------- |
| `variables` | `Record<string,string>` | 템플릿 `{{var}}` 치환 변수. 기본값 예시: `defaults`에 정의 |
| `message`   | string                  | `user_msg`이 없는 템플릿일 때 직접 전달하는 사용자 메시지  |
| `provider`  | string                  | 프로바이더 이름 (생략 시 default)                          |

- 사용 예제 (요약 템플릿):

```bash
curl -X POST "http://localhost:3000/v1/llm/summarize/chat" \
    -H "Content-Type: application/json" \
    -d '{
        "variables": {
            "text": "오늘 회의에서 프로젝트 일정이 논의되었다...",
            "max_sentences": "2"
        }
    }'
```

- 응답 예시:

```json
{
    "ok": true,
    "data": {
        "template": "summarize",
        "model": "gpt-4o",
        "content": "프로젝트 일정이 2주 연장되었다. 개발 완료일은 4월 30일로 변경되었다."
    }
}
```

- 번역 템플릿 사용 예시:

```bash
curl -X POST "http://localhost:3000/v1/llm/translate/chat" \
    -H "Content-Type: application/json" \
    -d '{
        "variables": {
            "text": "Hello, how are you?",
            "target_lang": "한국어"
        }
    }'
```

### POST /v1/llm/:name/chat/stream

<a id="post-v1apillmnamechatstream"></a>

- 설명: 템플릿 기반 응답을 SSE 스트리밍으로 전송한다.
- 요청 본문: `/:name/chat`과 동일
- 사용 예제:

```bash
curl -N -X POST "http://localhost:3000/v1/llm/summarize/chat/stream" \
    -H "Content-Type: application/json" \
    -d '{
        "variables": {
            "text": "요약할 긴 텍스트...",
            "max_sentences": "3"
        }
    }'
```

---

## 챗봇

챗봇은 **RAG 검색 + 대화 히스토리**를 하나의 API 호출로 처리하는 고수준 인터페이스다.  
`llm_chatbot` 엔티티에 챗봇 설정(시스템 프롬프트·RAG 옵션)을 저장하고, 대화 세션은 `llm_conversation` 엔티티에 기록된다.

### GET /v1/llm/chatbots

<a id="get-v1apillmchatbots"></a>

- 설명: 등록된 챗봇 목록을 반환한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/chatbots"
```

- 응답 예시:

```json
{
    "ok": true,
    "data": [
        {
            "seq": 1,
            "name": "support",
            "label": "고객 지원 봇",
            "ragEnabled": true,
            "status": "active",
            "createdAt": "2026-01-15T09:00:00Z"
        }
    ]
}
```

### POST /v1/llm/chatbots

<a id="post-v1apillmchatbots"></a>

- 설명: 새 챗봇을 생성한다.
- 요청 필드:

| 필드              | 타입    | 필수 | 설명                                    |
| ----------------- | ------- | ---- | --------------------------------------- |
| `name`            | string  | ✅   | 챗봇 식별자 (고유)                      |
| `label`           | string  | -    | 표시 이름 (기본값: name)                |
| `system_msg`      | string  | -    | 시스템 프롬프트                         |
| `welcome_message` | string  | -    | 채팅창 시작 메시지                      |
| `provider_name`   | string  | -    | 사용할 LLM 프로바이더 (기본값: default) |
| `rag_enabled`     | boolean | -    | RAG 검색 활성화 (기본값: false)         |
| `rag_tenant_id`   | string  | -    | RAG 문서 테넌트 필터                    |
| `rag_top_k`       | number  | -    | 검색 결과 수 (기본값: 5)                |
| `rag_min_score`   | number  | -    | 최소 유사도 점수 (기본값: 0.7)          |
| `rag_metadata`    | object  | -    | RAG 메타데이터 필터                     |

- 사용 예제:

```bash
curl -X POST "http://localhost:3000/v1/llm/chatbots" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "support",
        "label": "고객 지원 봇",
        "system_msg": "당신은 친절한 고객 지원 담당자입니다. 제공된 자료를 기반으로 정확하게 답변하세요.",
        "welcome_message": "안녕하세요! 무엇을 도와드릴까요?",
        "rag_enabled": true,
        "rag_tenant_id": "support-docs",
        "rag_top_k": 5
    }'
```

- 응답 예시:

```json
{ "ok": true, "data": { "seq": 1 } }
```

### GET /v1/llm/chatbots/:seq

<a id="get-v1apillmchatbotsseq"></a>

- 설명: 챗봇 상세 설정을 조회한다.
- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/chatbots/1"
```

### PATCH /v1/llm/chatbots/:seq

<a id="patch-v1apillmchatbotsseq"></a>

- 설명: 챗봇 설정을 수정한다. 전달한 필드만 업데이트된다.
- 요청 본문 (모두 선택):

| 필드              | 타입    | 설명                     |
| ----------------- | ------- | ------------------------ |
| `label`           | string  | 표시 이름                |
| `system_msg`      | string  | 시스템 프롬프트          |
| `welcome_message` | string  | 채팅창 시작 메시지       |
| `provider_name`   | string  | 사용할 LLM 프로바이더    |
| `rag_enabled`     | boolean | RAG 검색 활성화 여부     |
| `rag_tenant_id`   | string  | RAG 문서 테넌트 필터     |
| `rag_top_k`       | number  | 검색 결과 수             |
| `rag_min_score`   | number  | 최소 유사도 점수         |
| `rag_metadata`    | object  | RAG 메타데이터 필터      |
| `status`          | string  | `active` 또는 `inactive` |

- 사용 예제:

```bash
curl -X PATCH "http://localhost:3000/v1/llm/chatbots/1" \
    -H "Content-Type: application/json" \
    -d '{ "status": "inactive" }'
```

### DELETE /v1/llm/chatbots/:seq

<a id="delete-v1apillmchatbotsseq"></a>

- 설명: 챗봇을 삭제한다.
- 사용 예제:

```bash
curl -X DELETE "http://localhost:3000/v1/llm/chatbots/1"
```

### POST /v1/llm/chatbots/:seq/chat

<a id="post-v1apillmchatbotsseqchat"></a>

- 설명: 챗봇과 대화한다. RAG 검색과 대화 히스토리를 자동으로 통합한다.
    - `session_seq = 0` (기본값): 새 세션을 생성한다.
    - `session_seq > 0`: 기존 세션의 히스토리를 이어서 대화한다.
- 요청 필드:

| 필드          | 타입   | 필수 | 설명                                       |
| ------------- | ------ | ---- | ------------------------------------------ |
| `message`     | string | ✅   | 사용자 메시지                              |
| `session_seq` | number | -    | 기존 세션 seq (0이면 신규 생성, 기본값: 0) |
| `session_id`  | string | -    | 비로그인 사용자 세션 추적용 임의 ID        |
| `user_seq`    | number | -    | 로그인 사용자 seq                          |

- 사용 예제 (새 세션):

```bash
curl -X POST "http://localhost:3000/v1/llm/chatbots/1/chat" \
    -H "Content-Type: application/json" \
    -d '{ "message": "배송 지연 시 환불 정책이 어떻게 되나요?" }'
```

- 응답 예시:

```json
{
    "ok": true,
    "data": {
        "sessionSeq": 42,
        "isNewSession": true,
        "content": "배송이 3일 이상 지연될 경우 전액 환불이 가능합니다...",
        "model": "gpt-4o",
        "usage": {
            "promptTokens": 312,
            "completionTokens": 87,
            "totalTokens": 399
        },
        "sources": [
            {
                "id": "doc-1",
                "title": "환불 정책",
                "score": 0.92,
                "content": "..."
            }
        ]
    }
}
```

- 이어서 대화 (기존 세션):

```bash
curl -X POST "http://localhost:3000/v1/llm/chatbots/1/chat" \
    -H "Content-Type: application/json" \
    -d '{ "message": "해외 주문도 동일하게 적용되나요?", "session_seq": 42 }'
```

### POST /v1/llm/chatbots/:seq/chat/stream

<a id="post-v1apillmchatbotsseqchatstream"></a>

- 설명: 챗봇 응답을 SSE 스트리밍으로 전송한다.
  응답 헤더 `X-Session-Seq`에 세션 seq가 포함된다.
- 요청 본문: `/chatbots/:seq/chat`과 동일
- 사용 예제:

```bash
curl -N -X POST "http://localhost:3000/v1/llm/chatbots/1/chat/stream" \
    -H "Content-Type: application/json" \
    -d '{ "message": "반품 절차를 알려주세요" }'
```

### GET /v1/llm/chatbots/:seq/sessions

<a id="get-v1apillmchatbotsseqsessions"></a>

- 설명: 챗봇에 귀속된 대화 세션 목록을 반환한다.
- 쿼리 파라미터:

| 파라미터     | 타입   | 설명                      |
| ------------ | ------ | ------------------------- |
| `user_seq`   | number | 로그인 사용자 seq 필터    |
| `session_id` | string | 비로그인 세션 ID 필터     |
| `limit`      | number | 반환 개수 (기본값: 20)    |
| `offset`     | number | 페이지 오프셋 (기본값: 0) |

- 사용 예제:

```bash
curl "http://localhost:3000/v1/llm/chatbots/1/sessions?user_seq=5&limit=10"
```

### DELETE /v1/llm/chatbots/:seq/sessions/:sessionSeq

<a id="delete-v1apillmchatbotsseqsessionssessionseq"></a>

- 설명: 챗봇 세션과 저장된 대화 내역을 삭제한다.
- 사용 예제:

```bash
curl -X DELETE "http://localhost:3000/v1/llm/chatbots/1/sessions/42"
```

---

### GET /v1/llm/profiles

<a id="get-v1apillmprofiles"></a>

- 설명: 사용자의 Profile Memory 항목 목록을 조회한다.
- 쿼리 파라미터:

| 파라미터           | 타입    | 필수 | 설명                                      |
| ------------------ | ------- | ---- | ----------------------------------------- |
| `user_seq`         | number  | ✅   | 조회할 사용자 seq                         |
| `scope`            | string  | -    | 범위 필터 (`global` 또는 `chatbot_<seq>`) |
| `chatbot_seq`      | number  | -    | 특정 챗봇 전용 메모리만 조회              |
| `include_inactive` | boolean | -    | `true` 시 비활성 항목 포함 (기본: false)  |

- 사용 예제:

```bash
# 전체 global 메모리 조회
curl "http://localhost:3000/v1/llm/profiles?user_seq=123"

# 특정 챗봇 전용 메모리 조회
curl "http://localhost:3000/v1/llm/profiles?user_seq=123&chatbot_seq=5"
```

- 응답 예:

```json
{
    "ok": true,
    "data": [
        {
            "seq": 1,
            "userSeq": 123,
            "scope": "global",
            "key": "name",
            "value": "홍길동",
            "source": "manual",
            "status": "active",
            "createdAt": "2026-03-06T10:00:00Z",
            "updatedAt": "2026-03-06T10:00:00Z"
        },
        {
            "seq": 2,
            "userSeq": 123,
            "scope": "global",
            "key": "preference",
            "value": "답변은 짧고 핵심만",
            "source": "manual",
            "status": "active",
            "createdAt": "2026-03-06T10:01:00Z",
            "updatedAt": "2026-03-06T10:01:00Z"
        }
    ]
}
```

---

### POST /v1/llm/profiles

<a id="post-v1apillmprofiles"></a>

- 설명: Profile Memory 항목을 추가하거나 수정한다 (`user_seq + scope + key` 기준 upsert).
- 요청 본문:

| 필드          | 타입   | 필수 | 설명                                         |
| ------------- | ------ | ---- | -------------------------------------------- |
| `user_seq`    | number | ✅   | 사용자 seq                                   |
| `key`         | string | ✅   | 메모리 키 (예: `name`, `preference`, `goal`) |
| `value`       | string | ✅   | 메모리 값 (자연어 문장 권장)                 |
| `scope`       | string | -    | 범위 (`global` 기본값, 또는 `chatbot_<seq>`) |
| `chatbot_seq` | number | -    | 챗봇 전용 메모리일 때 챗봇 seq               |
| `source`      | string | -    | 기록 출처: `manual`(기본) 또는 `extracted`   |

- 사용 예제:

```bash
# 사용자 이름 기록
curl -X POST "http://localhost:3000/v1/llm/profiles" \
    -H "Content-Type: application/json" \
    -d '{
        "user_seq": 123,
        "key": "name",
        "value": "홍길동"
    }'

# 선호도 기록
curl -X POST "http://localhost:3000/v1/llm/profiles" \
    -H "Content-Type: application/json" \
    -d '{
        "user_seq": 123,
        "key": "preference",
        "value": "기술적인 설명보다는 실제 예시 위주로 답해줘"
    }'
```

- 응답 예:

```json
{ "ok": true, "data": { "seq": 3 } }
```

---

### DELETE /v1/llm/profiles/:seq

<a id="delete-v1apillmprofilesseq"></a>

- 설명: Profile Memory 항목을 삭제한다. `user_seq` 쿼리 파라미터로 소유자를 검증한다.
- 쿼리 파라미터:

| 파라미터   | 타입   | 필수 | 설명                     |
| ---------- | ------ | ---- | ------------------------ |
| `user_seq` | number | ✅   | 소유자 확인용 사용자 seq |

- 사용 예제:

```bash
curl -X DELETE "http://localhost:3000/v1/llm/profiles/3?user_seq=123"
```

- 응답 예:

```json
{ "ok": true, "data": { "deleted": true, "seq": 3 } }
```

> **Profile Memory 동작 방식**
>
> `user_seq`가 포함된 대화 요청(`POST /conversations`, `POST /conversations/:seq/messages`)이나 챗봇 채팅(`POST /chatbots/:seq/chat`) 시, 해당 사용자의 활성 Profile Memory가 자동으로 시스템 프롬프트 끝에 주입됩니다.
>
> ```
> [사용자 메모리]
> - name: 홍길동
> - preference: 답변은 짧고 핵심만
> - goal: React 마스터하기
> ```
>
> 챗봇 채팅의 경우 `chatbot_<seq>` scope 메모리를 먼저 조회하고, 없으면 `global` scope를 조회합니다.

## 관련 문서

- [Account Routes](./account-routes.md)
- [Alimtalk Routes](./alimtalk-routes.md)
- [Email Verification](./email-verification.md)
- [Friendtalk Routes](./friendtalk-routes.md)
- [Holidays Routes](./holidays-routes.md)
- [Identity Routes](./identity-routes.md)
- [OCR Routes](./ocr-routes.md)
- [Password Reset](./password-reset.md)
- [PG Routes](./pg-routes.md)
- [SMS Routes](./sms-routes.md)
- [SMTP Routes](./smtp-routes.md)
- [Tax Invoice Routes](./tax-invoice-routes.md)
- [라우트 추가 가이드](./how-to-create.md)
- [Push Routes](./push-routes.md)
- [← 전체 목록](./README.md)
