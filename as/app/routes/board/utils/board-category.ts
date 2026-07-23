import { readFileSync } from "node:fs";
import { entityServer, logger } from "@system/api";

interface BoardCategoryConfigFile {
    reset_defaults?: Record<string, unknown>[];
}

let cachedDefaultBoardCategories: Record<string, unknown>[] | null = null;

const boardCategoryBooleanFields = [
    "anonymous_enabled",
    "reply_enabled",
    "comment_enabled",
    "file_enabled",
    "like_enabled",
    "rating_enabled",
    "guest_write_enabled",
    "accept_enabled",
    "push_on_write",
] as const;

/** license_seq 값을 양의 정수 조건으로 정규화한다. */
function normalizeBoardCategoryLicenseCondition(
    licenseSeq?: number,
): number | undefined {
    const normalizedLicenseSeq = Number(licenseSeq ?? 0);
    return Number.isInteger(normalizedLicenseSeq) && normalizedLicenseSeq > 0
        ? normalizedLicenseSeq
        : undefined;
}

/** 게시판 카테고리 응답 필드를 일관된 값으로 정규화한다. */
function normalizeBoardCategoryFields(
    item: Record<string, unknown>,
): Record<string, unknown> {
    const normalizedItem = { ...item };

    for (const field of boardCategoryBooleanFields) {
        const value = normalizedItem[field];
        if (value === "Y" || value === "true" || value === 1 || value === "1") {
            normalizedItem[field] = true;
            continue;
        }
        if (
            value === "N" ||
            value === "false" ||
            value === 0 ||
            value === "0"
        ) {
            normalizedItem[field] = false;
        }
    }

    const postTypeOptions = normalizedItem.post_type_options;
    if (typeof postTypeOptions === "string") {
        try {
            const parsedOptions = JSON.parse(postTypeOptions) as unknown;
            if (Array.isArray(parsedOptions)) {
                normalizedItem.post_type_options = parsedOptions.filter(
                    (option): option is string => typeof option === "string",
                );
            }
        } catch {
            // post_type_options가 문자열 JSON이 아니면 원본 값을 유지한다.
        }
    }

    return normalizedItem;
}

/** 카테고리 이름별 기본 설정 맵을 만든다. */
function getDefaultBoardCategoryMap(): Map<string, Record<string, unknown>> {
    return new Map(
        getDefaultBoardCategories().map((item) => [
            String(item.name ?? ""),
            item,
        ]),
    );
}

/** DB 카테고리 row에 기본 설정의 누락 필드를 병합한다. */
function mergeDefaultCategoryFields(
    item: Record<string, unknown>,
): Record<string, unknown> {
    const defaultItem = getDefaultBoardCategoryMap().get(
        String(item.name ?? ""),
    );
    if (!defaultItem) {
        return item;
    }

    return normalizeBoardCategoryFields({
        ...defaultItem,
        ...item,
    });
}

/** 기본 게시판 카테고리 설정을 파일에서 읽어 캐시한다. */
function getDefaultBoardCategories(): Record<string, unknown>[] {
    if (cachedDefaultBoardCategories) {
        return cachedDefaultBoardCategories.map((item) => ({ ...item }));
    }

    try {
        const configText = readFileSync(
            new URL("../entities/board_category.json", import.meta.url),
            "utf8",
        );
        const config = JSON.parse(configText) as BoardCategoryConfigFile;
        cachedDefaultBoardCategories = Array.isArray(config.reset_defaults)
            ? config.reset_defaults.map((item) => ({ ...item }))
            : [];
    } catch (error) {
        logger.warn({ err: error }, "board category defaults load failed");
        cachedDefaultBoardCategories = [];
    }

    return cachedDefaultBoardCategories.map((item) => ({ ...item }));
}

/** 게시판 카테고리 목록을 DB 우선, 없으면 기본 설정으로 반환한다. */
export async function listResolvedBoardCategories(
    includeInactive = false,
    licenseSeq?: number,
): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const conditions: Record<string, unknown> = {};
    if (!includeInactive) {
        conditions.status = "active";
    }
    const scopedLicenseSeq = normalizeBoardCategoryLicenseCondition(licenseSeq);
    if (scopedLicenseSeq !== undefined) {
        conditions.license_seq = scopedLicenseSeq;
    }

    try {
        const response = await entityServer.list<Record<string, unknown>>(
            "board_category",
            {
                conditions,
                orderBy: "sort_order",
                orderDir: "ASC",
                limit: 200,
                fields: ["*"],
            },
        );
        const items = response.data?.items ?? [];

        if (items.length > 0) {
            return {
                items: items.map((item) => mergeDefaultCategoryFields(item)),
                total: response.data?.total ?? items.length,
            };
        }
    } catch (error) {
        logger.warn(
            { err: error },
            "board category list failed; using defaults",
        );
    }

    const fallbackItems = getDefaultBoardCategories().filter((item) => {
        if (includeInactive) {
            return true;
        }

        return String(item.status ?? "active") === "active";
    });

    return {
        items: fallbackItems,
        total: fallbackItems.length,
    };
}

/** 카테고리 이름으로 게시판 설정을 찾고 없으면 기본 설정을 사용한다. */
export async function resolveBoardCategoryByName(
    categoryName: string,
    includeInactive = false,
    licenseSeq?: number,
): Promise<Record<string, unknown> | null> {
    const normalizedCategoryName = categoryName.trim();
    if (!normalizedCategoryName) {
        return null;
    }
    const conditions: Record<string, unknown> = {
        name: normalizedCategoryName,
        ...(includeInactive ? {} : { status: "active" }),
    };
    const scopedLicenseSeq = normalizeBoardCategoryLicenseCondition(licenseSeq);
    if (scopedLicenseSeq !== undefined) {
        conditions.license_seq = scopedLicenseSeq;
    }

    try {
        const response = await entityServer.find<Record<string, unknown>>(
            "board_category",
            conditions,
        );
        if (response.data) {
            return mergeDefaultCategoryFields(response.data);
        }
    } catch (error) {
        logger.warn(
            { err: error, categoryName: normalizedCategoryName },
            "board category find failed; using defaults",
        );
    }

    const categoryList = await listResolvedBoardCategories(
        includeInactive,
        licenseSeq,
    );
    return (
        categoryList.items.find(
            (item) => String(item.name ?? "") === normalizedCategoryName,
        ) ?? null
    );
}
