/**
 * MediaPipe 검출 자산 자동 세팅 (npm postinstall 로 자동 실행, 크로스플랫폼 node).
 *
 * 목적: 어떤 개발자/CI 든 `npm install` 만 하면 사진편집기 얼굴/포즈/인물 검출 자산이
 *       static/mediapipe/ 에 자동으로 갖춰지게 한다(수동 스크립트 실행 불필요).
 *
 * - wasm  : 설치된 @mediapipe/tasks-vision 패키지의 wasm 을 static/mediapipe/wasm 으로 복사한다.
 *           → 네트워크 불필요, 설치된 JS 버전과 항상 자동 일치(버전 드리프트 없음).
 * - 모델 3종: static/mediapipe/models 에 없을 때만 googleapis 에서 내려받는다(best-effort).
 *           → 실패해도 install 을 깨지 않는다(경고만). npm 이 네트워크를 이미 쓰므로 보통은 받아진다.
 *
 * 자산은 .gitignore 대상이라 커밋되지 않고, 이 스크립트가 매 설치 때 재생성한다.
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WWW = join(HERE, "..");
const WASM_SRC = join(WWW, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const WASM_DST = join(WWW, "static", "mediapipe", "wasm");
const MODEL_DST = join(WWW, "static", "mediapipe", "models");

// 검출 모델 3종(googleapis). 버전에 독립적인 모델 파일이라 URL 고정.
const MODELS = [
    {
        file: "face_landmarker.task",
        url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    },
    {
        file: "selfie_segmenter.tflite",
        url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
    },
    {
        file: "pose_landmarker_lite.task",
        url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    },
];

/** 설치된 tasks-vision 패키지의 wasm 을 static 으로 복사한다(항상 — 버전 자동 일치). */
function copyWasm() {
    if (!existsSync(WASM_SRC)) {
        console.warn("[mediapipe] @mediapipe/tasks-vision 미설치 — wasm 복사 건너뜀");
        return;
    }
    mkdirSync(WASM_DST, { recursive: true });
    let count = 0;
    for (const name of readdirSync(WASM_SRC)) {
        copyFileSync(join(WASM_SRC, name), join(WASM_DST, name));
        count += 1;
    }
    console.log(`[mediapipe] wasm ${count}개 복사 → static/mediapipe/wasm`);
}

/** 모델 3종을 static 에 채운다(없을 때만 다운로드, 실패는 경고만). */
async function ensureModels() {
    mkdirSync(MODEL_DST, { recursive: true });
    for (const model of MODELS) {
        const dst = join(MODEL_DST, model.file);
        if (existsSync(dst) && statSync(dst).size > 0) {
            continue; // 이미 있음 — 재다운로드 안 함
        }
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 120_000);
            const res = await fetch(model.url, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const buf = Buffer.from(await res.arrayBuffer());
            writeFileSync(dst, buf);
            console.log(`[mediapipe] 모델 다운로드 → ${model.file} (${buf.length} bytes)`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[mediapipe] 모델 다운로드 실패(${model.file}): ${message} — 네트워크 확인 후 재설치 필요할 수 있음`);
        }
    }
}

copyWasm();
await ensureModels();
