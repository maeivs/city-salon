/**
 * LLM 클라이언트 팩토리
 *
 * driver 이름에 따라 적절한 LlmClient 구현체를 생성합니다.
 *
 * ── 클라우드 (OpenAI 호환 API) ──────────────────────────────────────────────
 *  openai              — OpenAI (https://api.openai.com)
 *  groq                — Groq 초고속 추론 (https://api.groq.com/openai/v1)
 *  together            — Together.ai (https://api.together.xyz/v1)
 *  deepseek            — DeepSeek (https://api.deepseek.com/v1)
 *  mistral             — Mistral AI (https://api.mistral.ai/v1)
 *  perplexity          — Perplexity AI (https://api.perplexity.ai)
 *
 * ── 클라우드 (전용 API 드라이버) ─────────────────────────────────────────────
 *  anthropic           — Anthropic Claude
 *  gemini              — Google Gemini
 *  azure_openai        — Azure OpenAI (api-key 헤더 + Azure URL 구조)
 *
 * ── 로컬 런타임 (OpenAI 호환 HTTP API) ──────────────────────────────────────
 *  ollama              — Ollama (:11434) — 자체 프로토콜 드라이버
 *  vllm                — vLLM (:8000)
 *  localai             — LocalAI (:8080)
 *  lmstudio            — LM Studio (:1234)
 *  llamacpp            — llama.cpp server (:8080)
 *  koboldcpp           — KoboldCpp (:5001)
 *  text_generation_webui — Text Generation WebUI / oobabooga (:5000)
 *  jan                 — Jan Desktop (:1337)
 *  xinference          — Xinference (:9997)
 *  tabbyapi            — TabbyAPI / ExLlamaV2 (:5000)
 *  openwebui           — Open WebUI 프록시 (:3000)
 */

import type { LlmClient, LlmProviderConfig } from "../types/index.ts";
import { OpenAIClient } from "./openai.ts";
import { AnthropicClient } from "./anthropic.ts";
import { GeminiClient } from "./gemini.ts";
import { OllamaClient } from "./ollama.ts";
import { AzureOpenAIClient } from "./azure.ts";

/** OpenAI 호환 API를 사용하는 드라이버 목록 */
const OPENAI_COMPATIBLE_DRIVERS = new Set([
    // 클라우드
    "openai",
    "groq",
    "together",
    "deepseek",
    "mistral",
    "perplexity",
    // 로컬 런타임
    "vllm",
    "localai",
    "lmstudio",
    "llamacpp",
    "koboldcpp",
    "text_generation_webui",
    "jan",
    "xinference",
    "tabbyapi",
    "openwebui",
]);

/**
 * 프로바이더 설정으로 LlmClient 인스턴스를 생성합니다.
 *
 * @throws driver가 지원하지 않는 값이면 Error
 */
export function createClient(cfg: LlmProviderConfig): LlmClient {
    const driver = cfg.driver.toLowerCase();

    if (OPENAI_COMPATIBLE_DRIVERS.has(driver)) {
        return new OpenAIClient(cfg);
    }

    switch (driver) {
        case "anthropic":
            return new AnthropicClient(cfg);
        case "gemini":
            return new GeminiClient(cfg);
        case "ollama":
            return new OllamaClient(cfg);
        case "azure_openai":
            return new AzureOpenAIClient(cfg);
        default:
            throw new Error(`Unsupported LLM driver: ${cfg.driver}`);
    }
}
