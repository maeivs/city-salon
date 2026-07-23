import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveConfigsDir } from "@system/api";

export interface PasswordPolicy {
    enabled: boolean;
    min_length: number;
    max_length: number;
    require_mixed_case: boolean;
    require_number: boolean;
    require_special: boolean;
    history_count: number;
    forbidden_patterns: {
        sequential_digits: boolean;
        repeated_chars: boolean;
        keyboard_patterns: boolean;
        sequential_length: number;
    };
    pii_check: {
        enabled: boolean;
        entity: string;
        fields: string[];
    };
}

interface SecurityConfig {
    password_policy?: Partial<PasswordPolicy>;
    [key: string]: unknown;
}

const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
    enabled: false,
    min_length: 8,
    max_length: 128,
    require_mixed_case: false,
    require_number: false,
    require_special: false,
    history_count: 5,
    forbidden_patterns: {
        sequential_digits: true,
        repeated_chars: true,
        keyboard_patterns: false,
        sequential_length: 4,
    },
    pii_check: {
        enabled: false,
        entity: "user",
        fields: [],
    },
};

/** security.json 파일 경로를 반환한다. */
function getSecurityConfigPath(): string {
    return join(resolveConfigsDir(), "security.json");
}

/** 알 수 없는 값을 레코드로 정규화한다. */
function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/** 불리언 설정값을 정규화한다. */
function normalizeBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

/** 정수 설정값을 허용 범위 안으로 정규화한다. */
function normalizeInteger(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
): number {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numericValue));
}

/** 문자열 설정값을 정규화한다. */
function normalizeString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** 문자열 배열 설정값을 정규화한다. */
function normalizeStringArray(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) {
        return fallback;
    }
    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}

/** password_policy 입력값을 저장 가능한 형태로 정규화한다. */
export function normalizePasswordPolicy(
    input: unknown,
    base: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PasswordPolicy {
    const record = asRecord(input);
    const forbiddenPatterns = asRecord(record.forbidden_patterns);
    const baseForbiddenPatterns = base.forbidden_patterns;
    const piiCheck = asRecord(record.pii_check);
    const basePiiCheck = base.pii_check;

    const minLength = normalizeInteger(
        record.min_length,
        base.min_length,
        1,
        512,
    );
    const maxLength = normalizeInteger(
        record.max_length,
        base.max_length,
        minLength,
        1024,
    );

    return {
        enabled: normalizeBoolean(record.enabled, base.enabled),
        min_length: minLength,
        max_length: maxLength,
        require_mixed_case: normalizeBoolean(
            record.require_mixed_case,
            base.require_mixed_case,
        ),
        require_number: normalizeBoolean(
            record.require_number,
            base.require_number,
        ),
        require_special: normalizeBoolean(
            record.require_special,
            base.require_special,
        ),
        history_count: normalizeInteger(
            record.history_count,
            base.history_count,
            0,
            50,
        ),
        forbidden_patterns: {
            sequential_digits: normalizeBoolean(
                forbiddenPatterns.sequential_digits,
                baseForbiddenPatterns.sequential_digits,
            ),
            repeated_chars: normalizeBoolean(
                forbiddenPatterns.repeated_chars,
                baseForbiddenPatterns.repeated_chars,
            ),
            keyboard_patterns: normalizeBoolean(
                forbiddenPatterns.keyboard_patterns,
                baseForbiddenPatterns.keyboard_patterns,
            ),
            sequential_length: normalizeInteger(
                forbiddenPatterns.sequential_length,
                baseForbiddenPatterns.sequential_length,
                2,
                32,
            ),
        },
        pii_check: {
            enabled: normalizeBoolean(piiCheck.enabled, basePiiCheck.enabled),
            entity: normalizeString(piiCheck.entity, basePiiCheck.entity),
            fields: normalizeStringArray(piiCheck.fields, basePiiCheck.fields),
        },
    };
}

/** security.json 전체 설정을 읽는다. */
async function readSecurityConfig(): Promise<SecurityConfig> {
    const configPath = getSecurityConfigPath();
    if (!existsSync(configPath)) {
        return {};
    }
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw) as SecurityConfig;
}

/** security.json 전체 설정을 원자적으로 저장한다. */
async function writeSecurityConfig(config: SecurityConfig): Promise<void> {
    const configPath = getSecurityConfigPath();
    const tempPath = `${configPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(config, null, 4)}\n`, "utf-8");
    await rename(tempPath, configPath);
}

/** 현재 비밀번호 정책 설정을 읽는다. */
export async function loadPasswordPolicyConfig(): Promise<PasswordPolicy> {
    const config = await readSecurityConfig();
    return normalizePasswordPolicy(config.password_policy);
}

/** 현재 비밀번호 정책 설정을 갱신한다. */
export async function updatePasswordPolicyConfig(
    input: unknown,
): Promise<PasswordPolicy> {
    const config = await readSecurityConfig();
    const currentPolicy = normalizePasswordPolicy(config.password_policy);
    const nextPolicy = normalizePasswordPolicy(input, currentPolicy);
    await writeSecurityConfig({ ...config, password_policy: nextPolicy });
    return nextPolicy;
}

/** 비밀번호가 연속 숫자 패턴인지 검사한다. */
function isSequentialDigits(value: string, ascending: boolean): boolean {
    if (!/^\d+$/.test(value)) {
        return false;
    }
    for (let index = 1; index < value.length; index += 1) {
        const diff = value.charCodeAt(index) - value.charCodeAt(index - 1);
        if (ascending ? diff !== 1 : diff !== -1) {
            return false;
        }
    }
    return true;
}

/** 비밀번호 금지 패턴 위반 메시지를 반환한다. */
function validateForbiddenPatterns(
    password: string,
    policy: PasswordPolicy,
): string | null {
    const config = policy.forbidden_patterns;
    const sequenceLength = config.sequential_length;

    if (config.sequential_digits) {
        for (
            let index = 0;
            index <= password.length - sequenceLength;
            index += 1
        ) {
            const part = password.slice(index, index + sequenceLength);
            if (
                isSequentialDigits(part, true) ||
                isSequentialDigits(part, false)
            ) {
                return `연속된 숫자(${sequenceLength}자 이상)는 사용할 수 없습니다`;
            }
        }
    }

    if (config.repeated_chars) {
        for (
            let index = 0;
            index <= password.length - sequenceLength;
            index += 1
        ) {
            const part = password.slice(index, index + sequenceLength);
            if (part.split("").every((char) => char === part[0])) {
                return `동일한 문자의 반복(${sequenceLength}자 이상)은 사용할 수 없습니다`;
            }
        }
    }

    if (config.keyboard_patterns) {
        const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];
        const lowerPassword = password.toLowerCase();
        for (const row of rows) {
            for (
                let index = 0;
                index <= row.length - sequenceLength;
                index += 1
            ) {
                const pattern = row.slice(index, index + sequenceLength);
                const reversed = pattern.split("").reverse().join("");
                if (
                    lowerPassword.includes(pattern) ||
                    lowerPassword.includes(reversed)
                ) {
                    return `키보드 연속 문자(${sequenceLength}자 이상)는 사용할 수 없습니다`;
                }
            }
        }
    }

    return null;
}

/** 현재 설정 기준으로 비밀번호 정책 위반 메시지를 반환한다. */
export async function validatePasswordWithCurrentPolicy(
    password: string,
): Promise<string | null> {
    const policy = await loadPasswordPolicyConfig();
    if (!policy.enabled) {
        return null;
    }
    if (policy.min_length > 0 && password.length < policy.min_length) {
        return `비밀번호는 최소 ${policy.min_length}자 이상이어야 합니다`;
    }
    if (policy.max_length > 0 && password.length > policy.max_length) {
        return `비밀번호는 ${policy.max_length}자를 초과할 수 없습니다`;
    }
    if (
        policy.require_mixed_case &&
        (!/[A-Z]/.test(password) || !/[a-z]/.test(password))
    ) {
        return "비밀번호에 대소문자를 모두 포함해야 합니다";
    }
    if (policy.require_number && !/\d/.test(password)) {
        return "비밀번호에 숫자가 포함되어야 합니다";
    }
    if (policy.require_special && !/[^A-Za-z0-9]/.test(password)) {
        return "비밀번호에 특수문자가 포함되어야 합니다";
    }
    return validateForbiddenPatterns(password, policy);
}
