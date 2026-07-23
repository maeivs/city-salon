import type { ParsedDocument } from "./parsed.ts";

export interface Template {
    docType: string;
    label: string;
    preprocess: PreprocessConfig;
    keywords: Record<string, string[]>;
    fields: Record<string, FieldConfig>;
    requiredFields: string[];
    confidenceWeight: Record<string, number>;
}

export interface FieldConfig {
    outputKey: string;
    mode?: string; // anchor(기본), region, regex_scan
    criteria?: Criterion[];
    region?: RegionConfig;
    pattern?: string;
    captureGroup?: number;
    refine?: string;
    required?: boolean;
}

export interface Criterion {
    keyword: string;
    direction: string;
}

export interface RegionConfig {
    from: string;
    to: string;
    direction?: string;
    xMinAnchor?: string;
}

export interface PreprocessConfig {
    maxSlope: number;
    slopeExceptions: string[];
    yTolerance: number;
    xTolerance: number;
    removeKeywords: string[];
    removePatterns: string[];
    mergePatterns: string[];
    keywords: Record<string, string[]>;
}

export interface ProcessedItem {
    text: string;
    isKeyword: boolean;
    field: string;
    centerX: number;
    centerY: number;
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
    slope: number;
}

export interface ProcessedPage {
    keywordList: Record<string, ProcessedItem[]>;
    valueList: ProcessedItem[];
}

export interface BaseItem {
    item: ProcessedItem;
    direction: string;
}

export interface MatchResult {
    parsed?: ParsedDocument;
    confidence: number;
    missingRequired: string[];
    extracted: Record<string, string>;
}

export interface LlmPromptTemplate {
    docType: string;
    systemMsg: string;
    userMsg: string;
    schema: unknown;
}

export interface RetryConfig {
    maxRetries: number;
    retryDelayMs: number;
}
