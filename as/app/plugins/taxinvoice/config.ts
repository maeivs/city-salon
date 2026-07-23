/**
 * 전자세금계산서 설정 로더
 *
 * 플러그인 디렉토리의 config.json 로드 + ${ENV_VAR} 치환 + 검증
 */

import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { TaxInvoiceConfig } from "./types/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

/** 세금계산서 설정을 로드한다 */
export function loadTaxInvoiceConfig(): TaxInvoiceConfig | null {
    if (!existsSync(CONFIG_PATH)) return null;

    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const replaced = raw.replace(
        /\$\{(\w+)\}/g,
        (_, key) => process.env[key] ?? "",
    );
    const config: TaxInvoiceConfig = JSON.parse(replaced);

    if (config.enabled === false) return null;

    // 기본값 보정
    config.workers ??= 2;
    config.queue_size ??= 100;
    config.dispatch_interval_sec ??= 10;
    config.max_retries ??= 3;
    config.nts ??= {
        auto_send: false,
        taxation_option: 1,
        taxation_add_tax_allow: 0,
        tax_exemption_option: 1,
        tax_exemption_add_tax_allow: 0,
    };
    config.sync ??= {
        enabled: false,
        interval_sec: 0,
        state_sync_interval_min: 10,
        max_list_days: 200,
    };

    if (!config.default && Object.keys(config.providers ?? {}).length === 1) {
        config.default = Object.keys(config.providers)[0];
    }

    // 검증
    if (!Object.keys(config.providers ?? {}).length) {
        throw new Error(
            "taxinvoice config: at least one provider must be configured",
        );
    }
    if (!config.default) {
        throw new Error(
            "taxinvoice config: 'default' provider driver must be specified",
        );
    }
    if (!(config.default in config.providers)) {
        throw new Error(
            `taxinvoice config: default provider "${config.default}" not found in providers`,
        );
    }

    for (const [name, p] of Object.entries(config.providers)) {
        if (!p.driver)
            throw new Error(
                `taxinvoice config: provider "${name}": driver is required`,
            );
        if (!p.api_endpoint)
            throw new Error(
                `taxinvoice config: provider "${name}" (${p.driver}): api_endpoint is required`,
            );

        switch (p.driver) {
            case "barobill":
                if (!p.cert_key || !p.corp_num || !p.user_id)
                    throw new Error(
                        `taxinvoice config: barobill requires cert_key, corp_num, user_id`,
                    );
                break;
            case "popbill":
                if (!p.link_id || !p.secret_key || !p.corp_num)
                    throw new Error(
                        `taxinvoice config: popbill requires link_id, secret_key, corp_num`,
                    );
                break;
            case "bolta":
                if (!p.api_key || !p.customer_key)
                    throw new Error(
                        `taxinvoice config: bolta requires api_key, customer_key`,
                    );
                break;
            case "smartbill":
                if (!p.api_key || !p.corp_num)
                    throw new Error(
                        `taxinvoice config: smartbill requires api_key, corp_num`,
                    );
                break;
            case "esero":
                if (!p.corp_num || !p.cert_path)
                    throw new Error(
                        `taxinvoice config: esero requires corp_num, cert_path`,
                    );
                break;
            default:
                throw new Error(
                    `taxinvoice config: unknown driver "${p.driver}"`,
                );
        }
    }

    return config;
}

/** 세금계산서 provider 설정 하나를 enabled 여부와 무관하게 로드한다. */
export function loadTaxInvoiceProviderConfig(
    providerName: string,
): TaxInvoiceConfig["providers"][string] | null {
    if (!existsSync(CONFIG_PATH)) return null;

    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const replaced = raw.replace(
        /\$\{(\w+)\}/g,
        (_, key) => process.env[key] ?? "",
    );
    const config = JSON.parse(replaced) as TaxInvoiceConfig;
    return config.providers?.[providerName] ?? null;
}
