/**
 * 주소 기반 시도/시군구 자동 채움 전역 훅이다.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EntityHook, JwtUserInfo, SubmitContext } from "@system/api";
import { entityServer, logger } from "@system/api";

type EntityFieldConfig = {
    path?: string;
    index?: boolean;
};

type EntityConfig = {
    name?: string;
    fields?: Record<string, EntityFieldConfig>;
};

type AddressFieldPaths = {
    sidoPath: string;
    sigunguPath: string;
};

type AddressResolveResponse = {
    ok?: boolean;
    data?: {
        ok?: boolean;
        sido?: string;
        sigungu?: string;
    };
};

const ADDRESS_CANDIDATE_KEYS = new Set([
    "addr",
    "addr1",
    "address",
    "address1",
    "road_address",
    "road_address1",
    "residence_address",
    "residence_address1",
]);

const entityAddressFieldCache = new Map<string, AddressFieldPaths | null>();

/** 훅 파일 기준 app 루트 경로를 반환한다. */
function getHookAppRoot(): string {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/** 엔티티 설정 파일 경로를 재귀적으로 순회한다. */
function walkEntityConfigFiles(dirPath: string): string[] {
    if (!existsSync(dirPath)) {
        return [];
    }

    const filePaths: string[] = [];

    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
        const nextPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            filePaths.push(...walkEntityConfigFiles(nextPath));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith(".json")) {
            filePaths.push(nextPath);
        }
    }

    return filePaths;
}

/** 엔티티 설정 파일에서 주소 인덱스 필드 경로를 읽는다. */
function readAddressFieldPathsFromConfig(
    filePath: string,
    entity: string,
): AddressFieldPaths | null {
    try {
        const parsed = JSON.parse(
            readFileSync(filePath, "utf8"),
        ) as EntityConfig;
        if (String(parsed.name ?? "").trim() !== entity) {
            return null;
        }

        const sidoPath = String(parsed.fields?.sido?.path ?? "").trim();
        const sigunguPath = String(parsed.fields?.sigungu?.path ?? "").trim();
        if (!sidoPath || !sigunguPath) {
            return null;
        }

        return { sidoPath, sigunguPath };
    } catch {
        return null;
    }
}

/** 엔티티의 주소 인덱스 필드 경로를 캐시와 설정 파일에서 찾는다. */
function getEntityAddressFieldPaths(entity: string): AddressFieldPaths | null {
    if (entityAddressFieldCache.has(entity)) {
        return entityAddressFieldCache.get(entity) ?? null;
    }

    const appRoot = getHookAppRoot();
    const candidates = [
        ...walkEntityConfigFiles(path.join(appRoot, "routes")),
        ...walkEntityConfigFiles(path.join(appRoot, "plugins")),
    ];

    for (const filePath of candidates) {
        const paths = readAddressFieldPathsFromConfig(filePath, entity);
        if (paths) {
            entityAddressFieldCache.set(entity, paths);
            return paths;
        }
    }

    entityAddressFieldCache.set(entity, null);
    return null;
}

/** 중첩 경로 값을 읽는다. */
function getPathValue(
    target: Record<string, unknown>,
    pathText: string,
): unknown {
    return pathText.split(".").reduce<unknown>((current, segment) => {
        if (
            typeof current !== "object" ||
            current === null ||
            !(segment in (current as Record<string, unknown>))
        ) {
            return undefined;
        }

        return (current as Record<string, unknown>)[segment];
    }, target);
}

/** 중첩 경로 값을 생성하며 기록한다. */
function setPathValue(
    target: Record<string, unknown>,
    pathText: string,
    value: unknown,
): void {
    const segments = pathText.split(".");
    let current: Record<string, unknown> = target;

    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        const nextValue = current[segment];
        if (
            typeof nextValue !== "object" ||
            nextValue === null ||
            Array.isArray(nextValue)
        ) {
            current[segment] = {};
        }

        current = current[segment] as Record<string, unknown>;
    }

    current[segments[segments.length - 1]] = value;
}

/** 문자열 값을 trim 기준으로 정규화한다. */
function toTrimmedString(value: unknown): string {
    return String(value ?? "").trim();
}

/** 값이 이미 채워졌는지 확인한다. */
function hasFilledValue(value: unknown): boolean {
    return toTrimmedString(value) !== "";
}

/** 주소 후보 문자열을 재귀적으로 수집한다. */
function collectAddressCandidates(value: unknown, results: string[]): void {
    if (Array.isArray(value)) {
        value.forEach((item) => collectAddressCandidates(item, results));
        return;
    }

    if (typeof value !== "object" || value === null) {
        return;
    }

    for (const [key, childValue] of Object.entries(value)) {
        if (ADDRESS_CANDIDATE_KEYS.has(key)) {
            const address = toTrimmedString(childValue);
            if (address) {
                results.push(address);
            }
        }

        collectAddressCandidates(childValue, results);
    }
}

/** payload에서 주소 후보를 하나 고른다. */
function pickAddressCandidate(payload: Record<string, unknown>): string {
    const candidates: string[] = [];
    collectAddressCandidates(payload, candidates);

    return candidates.find((candidate) => candidate.length > 0) ?? "";
}

/** 주소 문자열에서 시도와 시군구를 해석한다. */
async function resolveAddressFields(address: string): Promise<{
    sido: string;
    sigungu: string;
}> {
    const response = await entityServer.request<AddressResolveResponse>(
        "POST",
        "/v1/utils/address/resolve",
        { address },
        true,
    );

    return {
        sido: toTrimmedString(response.data?.sido),
        sigungu: toTrimmedString(response.data?.sigungu),
    };
}

/** payload에 주소 기반 시도와 시군구를 자동 채운다. */
async function autofillAddressIndexFields(
    entity: string,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const fieldPaths = getEntityAddressFieldPaths(entity);
    if (!fieldPaths) {
        return payload;
    }

    const currentSido = getPathValue(payload, fieldPaths.sidoPath);
    const currentSigungu = getPathValue(payload, fieldPaths.sigunguPath);
    if (hasFilledValue(currentSido) && hasFilledValue(currentSigungu)) {
        return payload;
    }

    const address = pickAddressCandidate(payload);
    if (!address) {
        return payload;
    }

    try {
        const resolved = await resolveAddressFields(address);
        const nextPayload = { ...payload };

        if (!hasFilledValue(currentSido) && resolved.sido) {
            setPathValue(nextPayload, fieldPaths.sidoPath, resolved.sido);
        }
        if (!hasFilledValue(currentSigungu) && resolved.sigungu) {
            setPathValue(nextPayload, fieldPaths.sigunguPath, resolved.sigungu);
        }

        return nextPayload;
    } catch (err) {
        logger.warn(
            { entity, address, err },
            "address_index hook: address resolve failed",
        );
        return payload;
    }
}

export const addressIndexHook: EntityHook = {
    /** 저장 payload에서 주소 기반 시도와 시군구를 자동 채운다. */
    async beforeSubmit(
        entity: string,
        ctx: SubmitContext<Record<string, unknown>>,
        _user: JwtUserInfo,
    ) {
        return autofillAddressIndexFields(entity, ctx.new ?? {});
    },
};
