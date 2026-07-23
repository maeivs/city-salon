# LLM API 레퍼런스

기본 경로: `/v1/llm`

---

## 엔드포인트 목록

| 메서드   | 경로                                               | 인증        | 설명                        |
| -------- | -------------------------------------------------- | ----------- | --------------------------- |
| `POST`   | [`/chat`](#post-chat)                              |             | 채팅                        |
| `POST`   | [`/chat/stream`](#post-chatstream)                 |             | SSE 스트리밍 채팅           |
| `POST`   | [`/conversations`](#post-conversations)            | 로그인 필요 | 대화 세션 생성              |
| `GET`    | [`/conversations/:seq`](#get-conversations-seq)    | 로그인 필요 | 대화 세션 조회              |
| `PATCH`  | [`/conversations/:seq`](#patch-conversations-seq)  | 로그인 필요 | 대화 세션 수정              |
| `DELETE` | [`/conversations/:seq`](#delete-conversations-seq) | 로그인 필요 | 대화 세션 삭제              |
| `POST`   | [`/rag/documents`](#post-ragdocuments)             | 로그인 필요 | 문서 업로드 및 임베딩       |
| `GET`    | [`/rag/documents`](#get-ragdocuments)              | 로그인 필요 | 업로드된 문서 목록          |
| `POST`   | [`/rag/search`](#post-ragsearch)                   | 로그인 필요 | 시맨틱 검색                 |
| `POST`   | [`/rag/chat`](#post-ragchat)                       | 로그인 필요 | RAG 기반 채팅               |
| `GET`    | [`/chatbots`](#get-chatbots)                       | 로그인 필요 | 챗봇 목록                   |
| `POST`   | [`/chatbots`](#post-chatbots)                      | 로그인 필요 | 챗봇 생성                   |
| `GET`    | [`/chatbots/:seq`](#get-chatbots-seq)              | 로그인 필요 | 챗봇 상세                   |
| `PATCH`  | [`/chatbots/:seq`](#patch-chatbots-seq)            | 로그인 필요 | 챗봇 수정                   |
| `DELETE` | [`/chatbots/:seq`](#delete-chatbots-seq)           | 로그인 필요 | 챗봇 삭제                   |
| `POST`   | [`/chatbots/:seq/chat`](#post-chatbots-seq-chat)   |             | 챗봇과 대화                 |
| `GET`    | [`/providers`](#get-providers)                     | 로그인 필요 | 프로바이더 목록             |
| `GET`    | [`/usage`](#get-usage)                             | 로그인 필요 | 사용량 내역                 |
| `GET`    | [`/usage/summary`](#get-usagesummary)              | 로그인 필요 | 프로바이더별 사용량 및 비용 |
| `GET`    | [`/cache/stats`](#get-cachestats)                  | 로그인 필요 | 캐시 상태 조회              |
| `DELETE` | [`/cache`](#delete-cache)                          | 로그인 필요 | 캐시 전체 초기화            |
| `GET`    | [`/templates`](#get-templates)                     | 로그인 필요 | 시스템 프롬프트 템플릿 목록 |

---

## 채팅

### POST /chat

단일 요청/응답 형식으로 채팅합니다.

**요청:**

```json
{
    "message": "안녕하세요, 오늘 날씨는 어떤가요?",
    "provider": "main",
    "system_prompt": "당신은 친절한 AI 어시스턴트입니다.",
    "temperature": 0.7,
    "max_tokens": 2048
}
```

**응답:**

```json
{
    "ok": true,
    "data": {
        "content": "안녕하세요! 저는 실시간 날씨 정보에 접근할 수 없지만...",
        "model": "gpt-4o-mini",
        "usage": { "prompt_tokens": 45, "completion_tokens": 80 }
    }
}
```

---

### POST /chat/stream

SSE(Server-Sent Events) 스트리밍 방식으로 채팅합니다.

**요청:** `/chat`과 동일  
**응답:** `text/event-stream`

```
data: {"delta":"안녕"}
data: {"delta":"하세요"}
data: [DONE]
```

---

## 대화 세션

여러 턴의 대화 히스토리를 서버에 보관합니다.

### POST /conversations

대화 세션을 생성합니다.

**요청:**

```json
{
    "title": "여행 계획",
    "provider": "main",
    "system_prompt": "여행 전문 어시스턴트입니다."
}
```

대화 세션 생성 후 동일 `:seq`에 `PATCH`로 메시지를 추가하며 대화를 이어갑니다.

### GET /conversations/:seq

대화 세션을 조회합니다.

### PATCH /conversations/:seq

대화 세션을 수정하거나 메시지를 추가합니다.

### DELETE /conversations/:seq

대화 세션을 삭제합니다.

---

## RAG (문서 검색 증강)

문서를 업로드하고 임베딩하여 자연어 질의에 활용합니다.

### POST /rag/documents

문서를 업로드하고 임베딩합니다.

**요청:**

```json
{
    "title": "제품 매뉴얼",
    "content": "본 제품의 사용 방법은...",
    "provider": "main"
}
```

### GET /rag/documents

업로드된 문서 목록을 조회합니다.

### POST /rag/search

자연어로 문서를 시맨틱 검색합니다.

### POST /rag/chat

RAG 기반으로 채팅합니다.

**요청:**

```json
{
    "message": "제품 보증 기간은 얼마인가요?",
    "provider": "main",
    "top_k": 3
}
```

---

## 챗봇 관리

커스텀 챗봇 설정을 DB에 저장하고 외부에 서비스합니다.

### GET /chatbots

챗봇 목록을 조회합니다.

### POST /chatbots

챗봇을 생성합니다.

**요청:**

```json
{
    "name": "고객지원 봇",
    "provider": "main",
    "system_prompt": "당신은 제품 고객지원 담당자입니다.",
    "temperature": 0.5,
    "max_tokens": 1024
}
```

### GET /chatbots/:seq

챗봇 상세를 조회합니다.

### PATCH /chatbots/:seq

챗봇을 수정합니다.

### DELETE /chatbots/:seq

챗봇을 삭제합니다.

### POST /chatbots/:seq/chat

챗봇과 대화를 나눕니다. 인증 없이 사용 가능합니다.

---

## 프로바이더 및 사용량

### GET /providers

설정된 프로바이더 목록을 조회합니다.

### GET /usage

API 사용량 내역을 조회합니다.

### GET /usage/summary

프로바이더별 사용량 및 비용을 조회합니다.

**응답 예시:**

```json
{
    "ok": true,
    "data": {
        "main": {
            "model": "gpt-4o-mini",
            "prompt_tokens": 12500,
            "completion_tokens": 8300,
            "estimated_cost_usd": 0.031
        }
    }
}
```

---

## 캐시

### GET /cache/stats

캐시 상태를 조회합니다.

### DELETE /cache

캐시를 전체 초기화합니다.

---

## 템플릿

### GET /templates

시스템 프롬프트 템플릿 목록을 조회합니다.
