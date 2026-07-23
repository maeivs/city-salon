/**
 * 본인인증 설정 로더
 * 플러그인 디렉토리의 config.json 로드 + 환경변수 치환
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IdentityConfig, IdentityProviderConfig } from "./types/index.ts";

/** 기본 설정값 */
const DEFAULTS: Omit<IdentityConfig, "providers" | "default"> = {
    enabled: false,
    requestTtlSec: 300,
    resultTtlSec: 600,
    returnUrl: "",
    duplicateCiCheck: true,
    rateLimit: { perIpPerHour: 10, perAccountPerDay: 5 },
};

/** 유효한 드라이버 목록 */
const VALID_DRIVERS = new Set(["nice", "kmc", "danal"]);

/** 문자열 내 ${ENV} 패턴을 환경변수 값으로 치환한다 */
function expandEnv(val: string | undefined): string {
    if (!val) return "";
    return val.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
}

/** 프로바이더 설정의 모든 환경변수를 치환한다 */
function expandProviderEnv(p: IdentityProviderConfig): IdentityProviderConfig {
    return {
        ...p,
        siteCode: expandEnv(p.siteCode),
        sitePassword: expandEnv(p.sitePassword),
        clientId: expandEnv(p.clientId),
        clientSecret: expandEnv(p.clientSecret),
        productId: expandEnv(p.productId),
        cpCd: expandEnv(p.cpCd),
        urlCd: expandEnv(p.urlCd),
        certKey: expandEnv(p.certKey),
        apiUrl: expandEnv(p.apiUrl),
        tokenUrl: expandEnv(p.tokenUrl),
        cryptoUrl: expandEnv(p.cryptoUrl),
    };
}

/** 설정 유효성을 검증한다 */
function validate(cfg: IdentityConfig): void {
    if (Object.keys(cfg.providers).length === 0) {
        throw new Error("identity: at least one provider is required");
    }
    for (const [, p] of Object.entries(cfg.providers)) {
        if (!VALID_DRIVERS.has(p.driver)) {
            throw new Error(`identity: unsupported driver: ${p.driver}`);
        }
    }
    const found = cfg.default in cfg.providers;
    if (!found) {
        throw new Error(
            `identity: default provider '${cfg.default}' not found in providers list`,
        );
    }
}

/**
 * 플러그인 디렉토리의 config.json을 로드한다.
 * 파일이 없거나 enabled=false이면 null을 반환한다.
 */
export function loadIdentityConfig(): IdentityConfig | null {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const filePath = join(__dirname, "config.json");

    if (!existsSync(filePath)) return null;

    let raw: Record<string, any>;
    try {
        raw = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
        throw new Error(`identity: failed to parse ${filePath}`);
    }

    // enabled 확인
    if (raw.enabled === false) return null;

    const cfg: IdentityConfig = {
        enabled: raw.enabled ?? true,
        default: raw.default ?? "",
        requestTtlSec: raw.request_ttl_sec ?? DEFAULTS.requestTtlSec,
        resultTtlSec: raw.result_ttl_sec ?? DEFAULTS.resultTtlSec,
        returnUrl: raw.return_url ?? DEFAULTS.returnUrl,
        successRedirectUrl: raw.success_redirect_url,
        failureRedirectUrl: raw.failure_redirect_url,
        duplicateCiCheck: raw.duplicate_ci_check ?? DEFAULTS.duplicateCiCheck,
        providers: Object.fromEntries(
            Object.entries(raw.providers ?? {}).map(([name, p]) => {
                const pRaw = p as Record<string, any>;
                return [
                    name,
                    expandProviderEnv({
                        driver: pRaw.driver ?? name,
                        siteCode: pRaw.site_code,
                        sitePassword: pRaw.site_password,
                        clientId: pRaw.client_id,
                        clientSecret: pRaw.client_secret,
                        productId: pRaw.product_id,
                        cpCd: pRaw.cp_cd,
                        urlCd: pRaw.url_cd,
                        certKey: pRaw.cert_key,
                        apiUrl: pRaw.api_url,
                        tokenUrl: pRaw.token_url,
                        cryptoUrl: pRaw.crypto_url,
                    }),
                ];
            }),
        ),
        rateLimit: {
            perIpPerHour:
                raw.rate_limit?.per_ip_per_hour ??
                DEFAULTS.rateLimit.perIpPerHour,
            perAccountPerDay:
                raw.rate_limit?.per_account_per_day ??
                DEFAULTS.rateLimit.perAccountPerDay,
        },
    };

    // 기본 프로바이더 자동 설정
    if (!cfg.default && Object.keys(cfg.providers).length > 0) {
        cfg.default = Object.keys(cfg.providers)[0];
    }
    if (cfg.requestTtlSec <= 0) cfg.requestTtlSec = 300;
    if (cfg.resultTtlSec <= 0) cfg.resultTtlSec = 600;
    if (cfg.rateLimit.perIpPerHour <= 0) cfg.rateLimit.perIpPerHour = 10;
    if (cfg.rateLimit.perAccountPerDay <= 0) cfg.rateLimit.perAccountPerDay = 5;

    validate(cfg);
    return cfg;
}
