# LLM 플러그인

OpenAI, Anthropic, Google Gemini, Ollama를 통합 지원하는 AI 채팅 및 RAG(Retrieval-Augmented Generation) 플러그인입니다.

---

## 목차

- [개요](#개요)
- [설정](#설정)
- [환경변수](#환경변수)
- [API 요약](#api-요약)
- [API 상세](api.md)
- [운영 팁](#운영-팁)

---

## 개요

| 항목            | 내용                                                                |
| --------------- | ------------------------------------------------------------------- |
| 지원 프로바이더 | OpenAI, Anthropic (Claude), Google Gemini, Ollama (로컬)            |
| 주요 기능       | 채팅, 스트리밍 채팅, 임베딩, RAG, 챗봇 관리, 사용량 추적, 응답 캐싱 |
| 레이트 리밋     | 토큰 버킷 방식 (RPM 기반)                                           |
| 응답 캐싱       | 동일 입력 해시 기반 메모리 캐시                                     |

> 기본 비활성화(`enabled: false`)입니다. 최소 1개 프로바이더 API 키 설정 후 활성화하세요.

---

## 설정

`config.json` 핵심 구조:

```json
{
    "enabled": false,
    "default": "main",
    "track_usage": true,
    "providers": {
        "main": {
            "driver": "openai",
            "api_key": "${OPENAI_API_KEY}",
            "model": "gpt-4o-mini",
            "max_tokens": 4096,
            "temperature": 0.7,
            "rate_limit": { "rpm": 60 }
        },
        "claude": {
            "driver": "anthropic",
            "api_key": "${ANTHROPIC_API_KEY}",
            "model": "claude-3-5-sonnet-20241022"
        },
        "gemini": {
            "driver": "gemini",
            "api_key": "${GEMINI_API_KEY}",
            "model": "gemini-1.5-flash"
        },
        "local": {
            "driver": "ollama",
            "base_url": "http://localhost:11434",
            "model": "llama3.2"
        }
    }
}
```

### 설정 항목

| 항목          | 기본값  | 설명                                          |
| ------------- | ------- | --------------------------------------------- |
| `enabled`     | `false` | 플러그인 활성화                               |
| `default`     | `main`  | 기본 프로바이더 키                            |
| `track_usage` | `true`  | API 사용량 DB 기록 여부                       |
| `providers.*` | —       | 프로바이더별 설정 (driver, api_key, model 등) |

---

## 환경변수

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
GEMINI_API_KEY=AIza...

# (Ollama는 로컬 실행이므로 API 키 불필요)
```

---

## API 요약

기본 경로: `/v1/llm`

| 그룹     | 경로 예시             | 설명                    |
| -------- | --------------------- | ----------------------- |
| 채팅     | `POST /chat`          | 단일 요청/응답 채팅     |
| 스트리밍 | `POST /chat/stream`   | SSE 스트리밍 채팅       |
| 대화     | `POST /conversations` | 대화 세션 관리          |
| RAG      | `POST /rag/documents` | 문서 업로드 및 검색     |
| 챗봇     | `GET /chatbots`       | 커스텀 챗봇 관리        |
| 사용량   | `GET /usage`          | API 사용량 및 비용 조회 |
| 캐시     | `GET /cache/stats`    | 캐시 상태 및 초기화     |

> 전체 엔드포인트 목록 및 요청/응답 형식은 [api.md](api.md)를 참조하세요.

---

## 운영 팁

- 비용 절감: 개발 환경에서는 `local` (Ollama) 프로바이더 사용
- `track_usage: true` 설정 시 `GET /usage/summary`로 모델별 비용 추적 가능
- RAG 사용 시 문서 임베딩에 추가 API 호출 발생 → 임베딩 전용 프로바이더 설정 권장
- 응답 캐시는 동일 입력에 대해 반복 호출 비용 절감 효과
- 스트리밍(`/chat/stream`)은 SSE 방식으로 클라이언트에서 `EventSource` 또는 `fetch` + `ReadableStream` 사용
