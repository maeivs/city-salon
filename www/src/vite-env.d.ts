/// <reference types="vite/client" />

interface ImportMetaEnv {
    /**
     * dev 디버그 평문 시크릿. `npm run dev`(.env.development)에서만 주입한다.
     * AS의 `DEBUG_PLAIN_SECRET` 와 일치하면 해당 세션은 패킷 암호화를 우회(평문)한다.
     * 운영 빌드에는 포함되지 않는다(`.env.development` 는 production 빌드에서 로드되지 않음).
     */
    readonly VITE_DEBUG_PLAIN_SECRET?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

/** 빌드 시 vite define 으로 주입되는 현재 빌드 ID. 현황판이 version.json 과 비교해 새 빌드를 감지한다. */
declare const __BUILD_ID__: string;
