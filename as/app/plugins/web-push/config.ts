import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

export interface WebPushConfig {
    enabled?: boolean;
    vapidPublicKey?: string;
    vapidPrivateKey?: string;
    vapidSubject?: string;
}

/** 설정 문자열 안의 환경변수 표현식을 치환한다. */
function substituteEnvVars(value: string): string {
    return value.replace(
        /\$\{([^}]+)\}/g,
        (_match, name) => process.env[name] ?? "",
    );
}

/** Web Push 플러그인 설정을 로드한다. */
export function loadWebPushConfig(): WebPushConfig {
    if (!existsSync(CONFIG_PATH)) {
        return {};
    }

    const raw = substituteEnvVars(readFileSync(CONFIG_PATH, "utf-8"));
    return JSON.parse(raw) as WebPushConfig;
}
